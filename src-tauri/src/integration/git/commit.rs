use super::{runner, validate_path, FileDiff};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitFile {
    pub path: String,
    pub original_path: Option<String>,
    pub status: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetails {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
    pub files: Vec<CommitFile>,
    pub selected_parent: Option<String>,
}

pub(super) fn verify_commit(root: &Path, hash: &str) -> Result<(), String> {
    if !matches!(hash.len(), 40 | 64) || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Select a full commit object ID.".into());
    }
    if runner::text(root, &["cat-file", "-t", hash])?.trim() != "commit" {
        return Err("Object is not a commit.".into());
    }
    Ok(())
}
pub fn details(root: &Path, hash: &str, parent: Option<String>) -> Result<CommitDetails, String> {
    verify_commit(root, hash)?;
    let metadata = runner::text(
        root,
        &[
            "show",
            "-s",
            "--format=%H%x00%P%x00%an%x00%ae%x00%aI%x00%B",
            hash,
            "--",
        ],
    )?;
    let fields: Vec<_> = metadata.splitn(6, '\0').collect();
    if fields.len() != 6 {
        return Err("Malformed commit metadata".into());
    }
    let parents: Vec<String> = fields[1].split_whitespace().map(str::to_string).collect();
    let parent = parent.or_else(|| parents.first().cloned());
    if parent.as_ref().is_some_and(|p| !parents.contains(p)) {
        return Err("Selected comparison must be a parent of this commit.".into());
    }
    let output = match &parent {
        Some(parent) => runner::text(
            root,
            &[
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--name-status",
                "-z",
                "--find-renames",
                parent,
                hash,
                "--",
            ],
        ),
        None => runner::text(
            root,
            &[
                "diff-tree",
                "--root",
                "--no-commit-id",
                "--name-status",
                "-r",
                "-z",
                hash,
                "--",
            ],
        ),
    }?;
    let mut records = output.strip_suffix('\0').unwrap_or(&output).split('\0');
    let mut files = Vec::new();
    if !output.is_empty() {
        while let Some(status) = records.next() {
            let first = records.next().ok_or("Malformed commit file record")?;
            let (path, original_path) = if status.starts_with(['R', 'C']) {
                (
                    records.next().ok_or("Malformed rename record")?.to_string(),
                    Some(first.to_string()),
                )
            } else {
                (first.to_string(), None)
            };
            files.push(CommitFile {
                path,
                original_path,
                status: status.into(),
            });
        }
    }
    Ok(CommitDetails {
        hash: fields[0].into(),
        parents,
        author: fields[2].into(),
        email: fields[3].into(),
        date: fields[4].into(),
        message: fields[5].into(),
        files,
        selected_parent: parent,
    })
}
pub fn historical_diff(
    root: &Path,
    hash: &str,
    parent: Option<String>,
    path: &str,
) -> Result<FileDiff, String> {
    validate_path(path)?;
    let details = details(root, hash, parent)?;
    let file = details
        .files
        .iter()
        .find(|f| f.path == path)
        .ok_or("Path is not changed in this commit comparison.")?;
    let mut args = if let Some(parent) = details.selected_parent.as_deref() {
        vec![
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "--no-relative",
            parent,
            hash,
            "--",
            path,
        ]
    } else {
        vec![
            "diff-tree",
            "--root",
            "--no-commit-id",
            "-p",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            hash,
            "--",
            path,
        ]
    };
    if let Some(original) = &file.original_path {
        args.push(original);
    }
    let patch = String::from_utf8(runner::paths(root, &args)?)
        .map_err(|_| "Diff is not UTF-8 text. Use the terminal.")?;
    let binary = patch.contains("Binary files ");
    let limited = patch.len() > 256 * 1024 || patch.bytes().filter(|b| *b == b'\n').count() > 4000;
    Ok(FileDiff {
        path: path.into(),
        original_path: file.original_path.clone(),
        patch: if limited { String::new() } else { patch },
        binary,
        limited,
    })
}
