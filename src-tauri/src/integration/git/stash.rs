use super::{commit::verify_commit, runner, FileDiff};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub reference: String,
    pub hash: String,
    pub date: String,
    pub message: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashList {
    pub entries: Vec<StashEntry>,
    pub has_more: bool,
}

pub fn list(root: &Path) -> Result<StashList, String> {
    let raw = runner::text(
        root,
        &[
            "stash",
            "list",
            "-z",
            "--format=%gd%x00%H%x00%cI%x00%gs",
            "-101",
        ],
    )?;
    let fields: Vec<_> = raw.strip_suffix('\0').unwrap_or(&raw).split('\0').collect();
    if raw.is_empty() {
        return Ok(StashList {
            entries: vec![],
            has_more: false,
        });
    }
    if fields.len() % 4 != 0 {
        return Err("Malformed Git stash list.".into());
    }
    let mut entries = Vec::new();
    for fields in fields.as_chunks::<4>().0 {
        validate_reference(fields[0])?;
        if !matches!(fields[1].len(), 40 | 64) || !fields[1].bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("Malformed stash object ID.".into());
        }
        entries.push(StashEntry {
            reference: fields[0].into(),
            hash: fields[1].into(),
            date: fields[2].into(),
            message: fields[3].into(),
        });
    }
    let has_more = entries.len() > 100;
    entries.truncate(100);
    Ok(StashList { entries, has_more })
}

fn validate_reference(reference: &str) -> Result<(), String> {
    let index = reference
        .strip_prefix("stash@{")
        .and_then(|value| value.strip_suffix('}'))
        .ok_or("Select a stash from the current list.")?;
    if index.is_empty() || index.len() > 10 || !index.bytes().all(|b| b.is_ascii_digit()) {
        return Err("Invalid stash reference.".into());
    }
    Ok(())
}
pub(super) fn verify(root: &Path, reference: &str, hash: &str) -> Result<(), String> {
    validate_reference(reference)?;
    verify_commit(root, hash)?;
    let actual = runner::text(root, &["rev-parse", "--verify", reference])?;
    if actual.trim() != hash {
        return Err("Stash list changed. Refresh and select the stash again.".into());
    }
    Ok(())
}
pub fn preview(root: &Path, reference: &str, hash: &str) -> Result<FileDiff, String> {
    verify(root, reference, hash)?;
    let raw = runner::run(
        root,
        &[
            "stash",
            "show",
            "--patch",
            "--include-untracked",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            hash,
        ],
    )?;
    let limited =
        raw.len() > 256 * 1024 || raw.iter().filter(|byte| **byte == b'\n').count() > 4000;
    let binary = raw.windows(13).any(|bytes| bytes == b"Binary files ");
    let patch = if limited {
        String::new()
    } else {
        String::from_utf8(raw)
            .map_err(|_| "Stash diff is not UTF-8 text. Inspect it in the terminal.")?
    };
    Ok(FileDiff {
        path: reference.into(),
        original_path: None,
        patch,
        binary,
        limited,
    })
}
pub(super) fn push(root: &Path, message: &str, untracked: bool) -> Result<(), String> {
    if message.len() > 4096 || message.contains('\0') {
        return Err("Stash message exceeds 4096 bytes or contains NUL.".into());
    }
    let mut args = vec!["stash", "push"];
    if untracked {
        args.push("--include-untracked");
    }
    if !message.is_empty() {
        args.extend(["--message", message]);
    }
    runner::run(root, &args).map(|_| ())
}
pub(super) fn restore(
    root: &Path,
    reference: &str,
    hash: &str,
    index: bool,
    pop: bool,
) -> Result<(), String> {
    verify(root, reference, hash)?;
    let mut args = vec!["stash", "apply"];
    if index {
        args.push("--index");
    }
    args.push(hash);
    runner::run(root, &args).map_err(|error| format!("Stash application failed; the stash is retained. Refresh Source Control to inspect conflicts. {error}"))?;
    if pop {
        // Apply immutable content first; never drop on a failed/conflicted apply.
        verify(root, reference, hash).map_err(|error| {
            format!("Stash applied, but retained because its reference changed. {error}")
        })?;
        runner::run(root, &["stash", "drop", reference])
            .map_err(|error| format!("Stash applied, but could not be dropped. {error}"))?;
    }
    Ok(())
}
pub(super) fn drop_entry(root: &Path, reference: &str, hash: &str) -> Result<(), String> {
    verify(root, reference, hash)?;
    runner::run(root, &["stash", "drop", reference]).map(|_| ())
}
