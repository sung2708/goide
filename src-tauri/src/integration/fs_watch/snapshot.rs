use super::{FsWatchChange, FsWatchChangeKindDto};
use anyhow::{bail, Context, Result};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Entry {
    pub is_dir: bool,
    pub len: u64,
    pub modified: Option<SystemTime>,
}

pub(super) type Snapshot = HashMap<PathBuf, Entry>;

pub(super) fn is_ignored(path: &Path) -> bool {
    path.components().any(|component| {
        matches!(
            component.as_os_str().to_str(),
            Some(".git" | "node_modules" | "target" | "dist")
        )
    })
}

pub(super) fn collect(root: &Path) -> Result<Snapshot> {
    let mut snapshot = HashMap::new();
    let mut directories = vec![(root.to_path_buf(), 0)];
    while let Some((directory, depth)) = directories.pop() {
        if depth > 256 {
            bail!("workspace directory nesting exceeds the filesystem sync limit");
        }
        for entry in fs::read_dir(&directory)
            .with_context(|| format!("failed to scan {}", directory.display()))?
        {
            let path = entry?.path();
            let relative = path.strip_prefix(root)?.to_path_buf();
            if is_ignored(&relative) {
                continue;
            }
            // Never follow symlinks/junctions: they can escape the root or cycle.
            let metadata = fs::symlink_metadata(&path)
                .with_context(|| format!("failed to read metadata for {}", path.display()))?;
            let is_dir = metadata.is_dir() && !metadata.file_type().is_symlink();
            snapshot.insert(
                relative,
                Entry {
                    is_dir,
                    len: if is_dir { 0 } else { metadata.len() },
                    modified: if is_dir {
                        None
                    } else {
                        Some(metadata.modified()?)
                    },
                },
            );
            if snapshot.len() > 100_000 {
                bail!("workspace exceeds the 100,000-entry filesystem sync limit");
            }
            if is_dir {
                directories.push((path, depth + 1));
            }
        }
    }
    Ok(snapshot)
}

pub(super) fn diff(previous: &Snapshot, current: &Snapshot) -> Vec<FsWatchChange> {
    let mut changes = Vec::new();
    for (path, entry) in current {
        let kind = match previous.get(path) {
            None => FsWatchChangeKindDto::Create,
            Some(old) if old != entry => FsWatchChangeKindDto::Modify,
            _ => continue,
        };
        changes.push(FsWatchChange {
            kind,
            relative_path: path.to_string_lossy().replace('\\', "/"),
            is_dir: entry.is_dir,
        });
    }
    for (path, entry) in previous {
        if !current.contains_key(path) {
            changes.push(FsWatchChange {
                kind: FsWatchChangeKindDto::Delete,
                relative_path: path.to_string_lossy().replace('\\', "/"),
                is_dir: entry.is_dir,
            });
        }
    }
    changes.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    changes
}
