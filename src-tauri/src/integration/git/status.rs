use super::runner;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub path: String,
    pub original_path: Option<String>,
    pub index_status: String,
    pub worktree_status: String,
    pub conflicted: bool,
    pub submodule: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryStatus {
    pub root: String,
    pub git_dir: String,
    pub git_version: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub operation: Option<String>,
    pub files: Vec<FileStatus>,
    pub remotes: Vec<String>,
}

pub(super) fn parse(bytes: &[u8]) -> Result<RepositoryStatus, String> {
    let raw = std::str::from_utf8(bytes)
        .map_err(|_| "Non-UTF-8 Git filenames are unsupported. Use the terminal.")?;
    let mut records = raw.split('\0').filter(|r| !r.is_empty());
    let mut status = RepositoryStatus::default();
    while let Some(record) = records.next() {
        if let Some(head) = record.strip_prefix("# branch.oid ") {
            status.head = (head != "(initial)").then(|| head.into());
        } else if let Some(branch) = record.strip_prefix("# branch.head ") {
            status.branch = (branch != "(detached)").then(|| branch.into());
        } else if let Some(upstream) = record.strip_prefix("# branch.upstream ") {
            status.upstream = Some(upstream.into());
        } else if let Some(ab) = record.strip_prefix("# branch.ab ") {
            let (a, b) = ab
                .split_once(' ')
                .ok_or("Malformed Git ahead/behind record")?;
            status.ahead = a
                .trim_start_matches('+')
                .parse()
                .map_err(|_| "Invalid ahead count")?;
            status.behind = b
                .trim_start_matches('-')
                .parse()
                .map_err(|_| "Invalid behind count")?;
        } else if let Some(path) = record.strip_prefix("? ") {
            status.files.push(FileStatus {
                path: path.into(),
                original_path: None,
                index_status: "?".into(),
                worktree_status: "?".into(),
                conflicted: false,
                submodule: false,
            });
        } else if matches!(record.as_bytes()[0], b'1' | b'2' | b'u') {
            let kind = record.as_bytes()[0];
            let fields: Vec<_> = record
                .splitn(
                    if kind == b'1' {
                        9
                    } else if kind == b'2' {
                        10
                    } else {
                        11
                    },
                    ' ',
                )
                .collect();
            let expected = if kind == b'1' {
                9
            } else if kind == b'2' {
                10
            } else {
                11
            };
            if fields.len() != expected || fields[1].len() != 2 || !fields[1].is_ascii() {
                return Err("Malformed Git status record".into());
            }
            let original_path = if kind == b'2' {
                Some(records.next().ok_or("Missing Git rename source")?.into())
            } else {
                None
            };
            status.files.push(FileStatus {
                path: fields[expected - 1].into(),
                original_path,
                index_status: fields[1][..1].into(),
                worktree_status: fields[1][1..].into(),
                conflicted: kind == b'u',
                submodule: fields[2].starts_with('S'),
            });
        } else if !record.starts_with("# ") && !record.starts_with("! ") {
            return Err("Unknown Git status record; update Git or use the terminal.".into());
        }
    }
    Ok(status)
}

pub fn repository_status(root: &Path) -> Result<RepositoryStatus, String> {
    let mut status = parse(&runner::run(
        root,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=all",
        ],
    )?)?;
    status.root = root.to_string_lossy().into();
    status.git_version = runner::text(root, &["--version"])?.trim().into();
    status.remotes = runner::text(root, &["remote"])?
        .lines()
        .map(str::to_string)
        .collect();
    status.git_dir = runner::text(root, &["rev-parse", "--absolute-git-dir"])?
        .trim_end_matches(['\r', '\n'])
        .into();
    for (marker, label) in [
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase"),
        ("MERGE_HEAD", "merge"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("REVERT_HEAD", "revert"),
    ] {
        let path = runner::text(root, &["rev-parse", "--git-path", marker])?;
        if root.join(path.trim_end_matches(['\r', '\n'])).exists() {
            status.operation = Some(label.into());
            break;
        }
    }
    Ok(status)
}
