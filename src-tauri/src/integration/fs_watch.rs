use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FsWatchMode {
    Watch,
    Polling,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FsWatchChangeKind {
    Created,
    Modified,
    Deleted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FsWatchEntryKind {
    File,
    Directory,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FsWatchChange {
    pub kind: FsWatchChangeKindDto,
    pub relative_path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FsWatchChangeKindDto {
    Create,
    Modify,
    Delete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFsChangedPayload {
    pub workspace_root: String,
    pub changes: Vec<FsWatchChange>,
}

#[derive(Debug, Clone)]
pub struct FsWatchService {
    state: Arc<Mutex<FsWatchServiceState>>,
    native_watch_available_override: Option<bool>,
    force_watcher_start_failure: bool,
}

#[derive(Debug, Default)]
struct FsWatchServiceState {
    workspaces: HashMap<PathBuf, WorkspaceWatchState>,
}

#[derive(Debug)]
struct WorkspaceWatchState {
    mode: FsWatchMode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FsWatchStartResult {
    pub workspace_root: String,
    pub mode: FsWatchMode,
}

impl FsWatchService {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(FsWatchServiceState::default())),
            native_watch_available_override: None,
            force_watcher_start_failure: false,
        }
    }

    pub fn new_for_test(native_watch_available: bool, force_watcher_start_failure: bool) -> Self {
        Self {
            state: Arc::new(Mutex::new(FsWatchServiceState::default())),
            native_watch_available_override: Some(native_watch_available),
            force_watcher_start_failure,
        }
    }

    pub async fn start<R: tauri::Runtime>(
        &self,
        app: tauri::AppHandle<R>,
        workspace_root: &Path,
    ) -> Result<FsWatchStartResult> {
        let canonical_root = workspace_root.canonicalize().with_context(|| {
            format!(
                "workspace root does not exist: {}",
                workspace_root.display()
            )
        })?;
        let workspace_root_str = canonical_root.to_string_lossy().replace('\\', "/");

        let mode = match self.try_start_watcher(&canonical_root).await {
            Ok(()) => FsWatchMode::Watch,
            Err(_) => FsWatchMode::Polling,
        };

        {
            let mut guard = self.state.lock().await;
            guard
                .workspaces
                .insert(canonical_root.clone(), WorkspaceWatchState { mode });
        }

        if mode == FsWatchMode::Polling {
            self.spawn_polling_task(app, canonical_root.clone()).await;
        }

        Ok(FsWatchStartResult {
            workspace_root: workspace_root_str,
            mode,
        })
    }

    pub async fn mode_for_workspace(&self, workspace_root: &Path) -> Option<FsWatchMode> {
        let canonical_root = workspace_root.canonicalize().ok()?;
        let guard = self.state.lock().await;
        guard
            .workspaces
            .get(&canonical_root)
            .map(|entry| entry.mode)
    }

    async fn try_start_watcher(&self, _workspace_root: &Path) -> Result<()> {
        if !self
            .native_watch_available_override
            .unwrap_or_else(native_watch_is_available)
        {
            return Err(anyhow::anyhow!("native file watching unavailable"));
        }
        if self.force_watcher_start_failure {
            return Err(anyhow::anyhow!("failed to initialize native file watcher"));
        }
        Ok(())
    }

    async fn spawn_polling_task<R: tauri::Runtime>(
        &self,
        app: tauri::AppHandle<R>,
        workspace_root: PathBuf,
    ) {
        let state = Arc::clone(&self.state);
        tokio::spawn(async move {
            let mut previous = collect_snapshot(&workspace_root).unwrap_or_default();
            let mut interval = tokio::time::interval(Duration::from_millis(900));
            loop {
                interval.tick().await;

                let mode_active = {
                    let guard = state.lock().await;
                    guard
                        .workspaces
                        .get(&workspace_root)
                        .map(|entry| entry.mode == FsWatchMode::Polling)
                        .unwrap_or(false)
                };
                if !mode_active {
                    return;
                }

                let current = match collect_snapshot(&workspace_root) {
                    Ok(snapshot) => snapshot,
                    Err(_) => continue,
                };

                let changes = diff_snapshots(&previous, &current);
                previous = current;
                if changes.is_empty() {
                    continue;
                }

                let payload = WorkspaceFsChangedPayload {
                    workspace_root: workspace_root.to_string_lossy().replace('\\', "/"),
                    changes,
                };
                let _ = app.emit("workspace-fs-changed", payload);
            }
        });
    }
}

fn native_watch_is_available() -> bool {
    true
}

fn collect_snapshot(workspace_root: &Path) -> Result<HashMap<PathBuf, FsWatchEntryKind>> {
    let mut snapshot = HashMap::new();
    collect_snapshot_recursive(workspace_root, workspace_root, &mut snapshot)?;
    Ok(snapshot)
}

fn collect_snapshot_recursive(
    workspace_root: &Path,
    current_dir: &Path,
    snapshot: &mut HashMap<PathBuf, FsWatchEntryKind>,
) -> Result<()> {
    for entry in std::fs::read_dir(current_dir)
        .with_context(|| format!("failed to read directory {}", current_dir.display()))?
    {
        let entry = entry.with_context(|| "failed to read directory entry")?;
        let path = entry.path();
        let metadata = entry
            .metadata()
            .with_context(|| format!("failed to read metadata for {}", path.display()))?;
        let relative_path = match path.strip_prefix(workspace_root) {
            Ok(value) => value.to_path_buf(),
            Err(_) => continue,
        };
        if relative_path.as_os_str().is_empty() {
            continue;
        }

        if metadata.is_dir() {
            snapshot.insert(relative_path.clone(), FsWatchEntryKind::Directory);
            collect_snapshot_recursive(workspace_root, &path, snapshot)?;
        } else if metadata.is_file() {
            snapshot.insert(relative_path, FsWatchEntryKind::File);
        }
    }
    Ok(())
}

pub fn diff_snapshots(
    previous: &HashMap<PathBuf, FsWatchEntryKind>,
    current: &HashMap<PathBuf, FsWatchEntryKind>,
) -> Vec<FsWatchChange> {
    let mut changes = Vec::new();

    for (path, current_kind) in current {
        match previous.get(path) {
            None => changes.push(FsWatchChange {
                kind: FsWatchChangeKindDto::Create,
                relative_path: path.to_string_lossy().replace('\\', "/"),
                is_dir: *current_kind == FsWatchEntryKind::Directory,
            }),
            Some(previous_kind) if previous_kind != current_kind => {
                changes.push(FsWatchChange {
                    kind: FsWatchChangeKindDto::Modify,
                    relative_path: path.to_string_lossy().replace('\\', "/"),
                    is_dir: *current_kind == FsWatchEntryKind::Directory,
                });
            }
            _ => {}
        }
    }

    for (path, previous_kind) in previous {
        if current.contains_key(path) {
            continue;
        }
        changes.push(FsWatchChange {
            kind: FsWatchChangeKindDto::Delete,
            relative_path: path.to_string_lossy().replace('\\', "/"),
            is_dir: *previous_kind == FsWatchEntryKind::Directory,
        });
    }

    changes
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};

    fn snapshot(paths: &[(&str, bool)]) -> HashMap<PathBuf, FsWatchEntryKind> {
        paths
            .iter()
            .map(|(path, is_dir)| {
                (
                    PathBuf::from(path),
                    if *is_dir {
                        FsWatchEntryKind::Directory
                    } else {
                        FsWatchEntryKind::File
                    },
                )
            })
            .collect()
    }

    #[test]
    #[tokio::test]
    async fn fs_watch_prefers_watch_when_watcher_starts_successfully() {
        let service = FsWatchService::new_for_test(true, false);
        let mode = service
            .try_start_watcher(Path::new("."))
            .await
            .map(|_| FsWatchMode::Watch)
            .unwrap_or(FsWatchMode::Polling);
        assert_eq!(mode, FsWatchMode::Watch);
    }

    #[tokio::test]
    async fn fs_watch_falls_back_to_polling_when_watcher_start_fails() {
        let service = FsWatchService::new_for_test(true, true);
        let mode = service
            .try_start_watcher(Path::new("."))
            .await
            .map(|_| FsWatchMode::Watch)
            .unwrap_or(FsWatchMode::Polling);
        assert_eq!(mode, FsWatchMode::Polling);
    }

    #[tokio::test]
    async fn fs_watch_falls_back_to_polling_when_native_watch_is_unavailable() {
        let service = FsWatchService::new_for_test(false, false);
        let mode = service
            .try_start_watcher(Path::new("."))
            .await
            .map(|_| FsWatchMode::Watch)
            .unwrap_or(FsWatchMode::Polling);
        assert_eq!(mode, FsWatchMode::Polling);
    }

    #[test]
    fn polling_diff_reports_created_and_deleted_paths() {
        let previous = snapshot(&[("main.go", false), ("pkg", true), ("old.go", false)]);
        let current = snapshot(&[("main.go", false), ("pkg", true), ("new.go", false)]);

        let changes = diff_snapshots(&previous, &current);

        assert!(changes.iter().any(|change| {
            change.relative_path == "new.go" && change.kind == FsWatchChangeKindDto::Create
        }));
        assert!(changes.iter().any(|change| {
            change.relative_path == "old.go" && change.kind == FsWatchChangeKindDto::Delete
        }));
        assert!(
            changes.iter().all(|change| change.relative_path != "pkg"),
            "unchanged directories must not be reported as external deltas"
        );
    }
}
