//! Bounded, cancellable workspace text search with one native matching engine.
use crate::ui_bridge::types::{WorkspaceSearchFileDto, WorkspaceSearchMatchDto};
use globset::{GlobBuilder, GlobSet, GlobSetBuilder};
use ignore::WalkBuilder;
use regex::RegexBuilder;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::Read,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};

#[derive(Default, Clone, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SearchOptions {
    pub match_case: bool,
    pub whole_word: bool,
    pub use_regex: bool,
    pub include: Vec<String>,
    pub exclude: Vec<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchReport {
    pub files: Vec<WorkspaceSearchFileDto>,
    pub limited: bool,
    pub reason: Option<String>,
    pub scanned_files: usize,
}
#[derive(Default)]
struct Registry {
    active: HashMap<String, Arc<AtomicBool>>,
    cancelled: HashMap<String, Instant>,
}
static ACTIVE: OnceLock<Mutex<Registry>> = OnceLock::new();
struct Request(String);
impl Drop for Request {
    fn drop(&mut self) {
        if let Ok(mut requests) = ACTIVE.get_or_init(Default::default).lock() {
            requests.active.remove(&self.0);
        }
    }
}
pub fn cancel(id: &str) -> Result<bool, String> {
    let mut active = ACTIVE
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "Search registry unavailable")?;
    if id.is_empty() || id.len() > 128 {
        return Err("Invalid search request identity".into());
    }
    if let Some(token) = active.active.get(id) {
        token.store(true, Ordering::Release);
        return Ok(true);
    }
    // Cancellation may arrive before spawn_blocking registers the request.
    active
        .cancelled
        .retain(|_, time| time.elapsed() < Duration::from_secs(30));
    if active.cancelled.len() >= 256 {
        if let Some(oldest) = active
            .cancelled
            .iter()
            .min_by_key(|(_, time)| **time)
            .map(|(id, _)| id.clone())
        {
            active.cancelled.remove(&oldest);
        }
    }
    active.cancelled.insert(id.into(), Instant::now());
    Ok(false)
}
pub(super) fn globs(patterns: &[String]) -> Result<GlobSet, String> {
    if patterns.len() > 32 || patterns.iter().any(|pattern| pattern.len() > 1024) {
        return Err("At most 32 glob filters of 1024 bytes are supported.".into());
    }
    let mut builder = GlobSetBuilder::new();
    for pattern in patterns {
        builder.add(
            GlobBuilder::new(pattern)
                .literal_separator(true)
                .backslash_escape(true)
                .build()
                .map_err(|e| format!("Invalid glob: {e}"))?,
        );
    }
    builder.build().map_err(|e| e.to_string())
}
pub(super) fn matcher(query: &str, options: &SearchOptions) -> Result<regex::Regex, String> {
    if query.is_empty() || query.len() > 4096 {
        return Err("Search needs a pattern within 4096 bytes.".into());
    }
    let pattern = if options.use_regex {
        query.to_string()
    } else {
        regex::escape(query)
    };
    let pattern = if options.whole_word {
        format!(r"\b(?:{pattern})\b")
    } else {
        pattern
    };
    RegexBuilder::new(&pattern)
        .case_insensitive(!options.match_case)
        .size_limit(4 * 1024 * 1024)
        .build()
        .map_err(|e| format!("Invalid search pattern: {e}"))
}
pub fn search(
    root: &str,
    id: &str,
    query: &str,
    options: SearchOptions,
) -> Result<SearchReport, String> {
    if id.is_empty() || id.len() > 128 {
        return Err("Invalid search request identity".into());
    }
    if query.is_empty() || query.len() > 4096 {
        return Err("Search needs a pattern within 4096 bytes.".into());
    }
    let root = Path::new(root).canonicalize().map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("Workspace must be a directory".into());
    }
    let include = globs(&options.include)?;
    let exclude = globs(&options.exclude)?;
    let matcher = matcher(query, &options)?;
    let token = Arc::new(AtomicBool::new(false));
    {
        let mut active = ACTIVE
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| "Search registry unavailable")?;
        active
            .cancelled
            .retain(|_, time| time.elapsed() < Duration::from_secs(30));
        if active.cancelled.remove(id).is_some() {
            return Err("Search cancelled before execution".into());
        }
        if active.active.contains_key(id) || active.active.len() >= 8 {
            return Err("Search capacity reached. Cancel pending requests first.".into());
        }
        active.active.insert(id.into(), token.clone());
    }
    let _request = Request(id.into());
    let started = Instant::now();
    let mut report = SearchReport {
        files: vec![],
        limited: false,
        reason: None,
        scanned_files: 0,
    };
    let mut bytes = 0;
    let mut matches_count = 0;
    let mut walker = WalkBuilder::new(&root);
    walker
        .follow_links(false)
        .hidden(false)
        .require_git(false)
        .max_depth(Some(64))
        .filter_entry(|entry| {
            !entry.file_type().is_some_and(|kind| kind.is_dir())
                || !matches!(
                    entry.file_name().to_str(),
                    Some(
                        ".git"
                            | "node_modules"
                            | "target"
                            | "dist"
                            | ".turbo"
                            | ".cache"
                            | "vendor"
                    )
                )
        });
    for entry in walker.build() {
        if token.load(Ordering::Acquire) || crate::integration::lifecycle::gate().is_closing() {
            return Err("Search cancelled. Results were not replaced.".into());
        }
        if started.elapsed() > Duration::from_secs(5)
            || report.scanned_files >= 20000
            || bytes >= 64 * 1024 * 1024
            || matches_count >= 2000
            || report.files.len() >= 200
        {
            report.limited = true;
            report.reason = Some("Search stopped at its time/file/64 MiB/200-file/2000-line result budget. Narrow the glob filters.".into());
            break;
        }
        let entry = entry.map_err(|e| format!("Search traversal failed: {e}"))?;
        if !entry.file_type().is_some_and(|kind| kind.is_file()) {
            continue;
        }
        let path = entry.path();
        let relative = path
            .strip_prefix(&root)
            .map_err(|_| "Search path escapes workspace")?;
        let relative = relative
            .to_str()
            .ok_or("Search filename is not UTF-8")?
            .replace('\\', "/");
        if (!options.include.is_empty() && !include.is_match(&relative))
            || exclude.is_match(&relative)
        {
            continue;
        }
        report.scanned_files += 1;
        // Walkers never follow links; revalidate before opening to guard replacement by a link.
        let metadata = std::fs::symlink_metadata(path).map_err(|e| e.to_string())?;
        if !metadata.is_file()
            || metadata.len() > 1024 * 1024
            || !path
                .canonicalize()
                .map_err(|e| e.to_string())?
                .starts_with(&root)
        {
            continue;
        }
        let mut raw = Vec::new();
        std::fs::File::open(path)
            .map_err(|e| e.to_string())?
            .take(1024 * 1024 + 1)
            .read_to_end(&mut raw)
            .map_err(|e| e.to_string())?;
        bytes += raw.len();
        if raw.len() > 1024 * 1024 || raw.contains(&0) {
            continue;
        }
        let Ok(text) = std::str::from_utf8(&raw) else {
            continue;
        };
        let mut matches = vec![];
        for (index, line) in text.lines().enumerate() {
            if token.load(Ordering::Acquire) {
                return Err("Search cancelled".into());
            }
            if matcher.is_match(line) {
                if line.len() > 8192 {
                    report.limited = true;
                    report.reason = Some(
                        "Long matching lines were omitted; narrow search or open the file.".into(),
                    );
                    continue;
                }
                matches.push(WorkspaceSearchMatchDto {
                    line: index + 1,
                    preview: line.into(),
                });
                matches_count += 1;
                if matches_count >= 2000 {
                    report.limited = true;
                    report.reason =
                        Some("2000 matching-line result limit reached. Narrow the search.".into());
                    break;
                }
            }
        }
        if !matches.is_empty() {
            report.files.push(WorkspaceSearchFileDto {
                relative_path: relative,
                matches,
            });
        }
    }
    report
        .files
        .sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(report)
}

#[cfg(test)]
mod tests;
