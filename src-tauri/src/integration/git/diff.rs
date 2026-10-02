use super::{repository_status, runner, validate_path};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub original_path: Option<String>,
    pub patch: String,
    pub binary: bool,
    pub limited: bool,
}

pub fn file_diff(root: &Path, path: &str, staged: bool) -> Result<FileDiff, String> {
    validate_path(path)?;
    let status = repository_status(root)?;
    let file = status.files.iter().find(|f| f.path == path).ok_or("This file is no longer changed. Refresh Source Control.")?;
    if file.conflicted || file.submodule { return Err("Conflict/submodule diff is not supported yet. Open the repository terminal.".into()); }
    let mut args = vec!["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--no-relative"];
    if staged { args.push("--cached"); }
    // Untracked files need a Git-generated no-index patch. Do not render
    // contents ourselves or follow a symlink outside the workspace.
    if file.index_status == "?" {
        return Err("Untracked files have no index diff yet. Open the file or stage it explicitly to inspect its added-file diff.".into());
    }
    args.push("--"); args.push(path);
    if let Some(original) = &file.original_path { args.push(original); }
    let raw = runner::run(root, &args)?;
    let binary = raw.windows(13).any(|w| w == b"Binary files ");
    let limited = raw.len() > 256 * 1024 || raw.iter().filter(|b| **b == b'\n').count() > 4000;
    let patch = if limited { String::new() } else { String::from_utf8(raw).map_err(|_| "Diff is not UTF-8 text. Use the terminal.")? };
    Ok(FileDiff { path: path.into(), original_path: file.original_path.clone(), patch, binary, limited })
}
