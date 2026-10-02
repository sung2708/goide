//! Prepare reviewable text replacements with disk baselines; never write during preview.
use super::{
    document,
    search::{self, SearchOptions},
};
use crate::ui_bridge::types::WorkspaceSearchFileDto;
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacementRequest {
    pub workspace_root: String,
    pub query: String,
    pub replacement: String,
    pub options: SearchOptions,
    pub files: Vec<WorkspaceSearchFileDto>,
    pub single: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacementPlan {
    pub path: String,
    pub before: String,
    pub after: String,
    pub occurrences: usize,
}
pub fn preview(request: ReplacementRequest) -> Result<Vec<ReplacementPlan>, String> {
    if request.files.is_empty() || request.files.len() > 100 || request.replacement.len() > 65536 {
        return Err(
            "Replacement supports 1–100 reviewed files and at most 64 KiB replacement text.".into(),
        );
    }
    let root = Path::new(&request.workspace_root)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let matcher = search::matcher(&request.query, &request.options)?;
    let include = search::globs(&request.options.include)?;
    let exclude = search::globs(&request.options.exclude)?;
    let mut bytes = 0;
    let mut plans = vec![];
    let mut seen = std::collections::HashSet::new();
    for file in request.files {
        if !seen.insert(file.relative_path.clone()) {
            return Err("Duplicate replacement file".into());
        }
        if (!request.options.include.is_empty() && !include.is_match(&file.relative_path))
            || exclude.is_match(&file.relative_path)
        {
            return Err("Replacement path is outside the selected glob scope.".into());
        }
        if file.matches.is_empty() || file.matches.len() > 2000 {
            return Err("Select bounded matching lines for replacement.".into());
        }
        // Validate scope before metadata or file I/O, including symlink parents.
        let before = document::disk_state(
            root.to_str().ok_or("Non-UTF-8 workspace")?,
            &file.relative_path,
        )?
        .content
        .ok_or("Replacement file was deleted")?;
        if before.len() > 256 * 1024 || before.contains('\0') {
            return Err("Replacement file exceeds the 256 KiB text limit.".into());
        }
        let mut lines: Vec<String> = before.split_inclusive('\n').map(str::to_string).collect();
        if lines.is_empty() {
            lines.push(String::new());
        }
        let mut occurrences = 0;
        let mut seen_lines = std::collections::HashSet::new();
        for matched in file.matches {
            if !seen_lines.insert(matched.line) {
                return Err("Duplicate replacement line".into());
            }
            let index = matched
                .line
                .checked_sub(1)
                .ok_or("Invalid replacement line")?;
            let line = lines.get_mut(index).ok_or("Search location is stale")?;
            let text = line.trim_end_matches(['\r', '\n']);
            if text != matched.preview.trim_end_matches(['\r', '\n']) {
                return Err(format!(
                    "{} changed since search. Search again before replacing.",
                    file.relative_path
                ));
            }
            let ending = &line[text.len()..];
            let limit = if request.single { 1 } else { usize::MAX };
            let mut replaced = String::new();
            let mut last = 0;
            let mut count = 0;
            for found in matcher.find_iter(text).take(limit) {
                replaced.push_str(&text[last..found.start()]);
                replaced.push_str(&request.replacement);
                last = found.end();
                count += 1;
                if replaced.len() > 512 * 1024 {
                    return Err("Expanded replacement exceeds the safety limit.".into());
                }
            }
            if count == 0 {
                return Err("Search pattern no longer matches the selected line.".into());
            }
            replaced.push_str(&text[last..]);
            replaced.push_str(ending);
            *line = replaced;
            occurrences += count;
        }
        let after = lines.concat();
        bytes += before.len() + after.len();
        if bytes > 4 * 1024 * 1024 || after.len() > 512 * 1024 {
            return Err(
                "Replacement preview exceeds the 4 MiB batch limit; select fewer files.".into(),
            );
        }
        plans.push(ReplacementPlan {
            path: file.relative_path,
            before,
            after,
            occurrences,
        });
    }
    Ok(plans)
}
#[cfg(test)]
mod tests;
