mod snapshot;
#[cfg(test)]
mod tests;

use anyhow::{Context, Result};
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FsWatchMode {
    Watch,
    Polling,
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

type ChangeEmitter = Arc<dyn Fn(WorkspaceFsChangedPayload) -> Result<(), String> + Send + Sync>;
type SnapshotCollector = Arc<dyn Fn(&Path) -> Result<snapshot::Snapshot> + Send + Sync>;

#[derive(Clone, Default)]
pub struct FsWatchService {
    state: Arc<Mutex<FsWatchServiceState>>,
    force_watcher_start_failure: bool,
}

#[derive(Default)]
struct FsWatchServiceState {
    workspaces: HashMap<PathBuf, WorkspaceWatchState>,
    shutdown: bool,
}

struct WorkspaceWatchState {
    // Each caller owns a lease, so late cleanup cannot stop a newer caller.
    subscribers: HashSet<String>,
    native_active: Arc<AtomicBool>,
    _watcher: Option<RecommendedWatcher>,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for WorkspaceWatchState {
    fn drop(&mut self) {
        self.task.abort();
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FsWatchStartResult {
    pub workspace_root: String,
    pub watch_id: String,
    pub mode: FsWatchMode,
}

impl FsWatchService {
    pub fn new() -> Self {
        Self::default()
    }

    #[cfg(test)]
    fn new_for_test(force_watcher_start_failure: bool) -> Self {
        Self {
            force_watcher_start_failure,
            ..Self::default()
        }
    }

    pub async fn start<R: tauri::Runtime>(
        &self,
        app: tauri::AppHandle<R>,
        workspace_root: &Path,
    ) -> Result<FsWatchStartResult> {
        self.start_with_emitter(
            workspace_root.to_path_buf(),
            Arc::new(move |payload| {
                app.emit("workspace-fs-changed", payload)
                    .map_err(|error| error.to_string())
            }),
        )
        .await
    }

    async fn start_with_emitter(
        &self,
        workspace_root: PathBuf,
        emit: ChangeEmitter,
    ) -> Result<FsWatchStartResult> {
        let service = self.clone();
        let runtime = tokio::runtime::Handle::current();
        tokio::task::spawn_blocking(move || {
            let root = workspace_root.canonicalize().with_context(|| {
                format!(
                    "workspace root does not exist: {}",
                    workspace_root.display()
                )
            })?;
            if !root.is_dir() {
                anyhow::bail!("workspace root must be a directory");
            }
            let watch_id = uuid::Uuid::new_v4().to_string();
            let mut state = service
                .state
                .lock()
                .map_err(|_| anyhow::anyhow!("filesystem sync state is poisoned"))?;
            if state.shutdown {
                anyhow::bail!("filesystem sync service is shutting down");
            }
            if let Some(existing) = state.workspaces.get_mut(&root) {
                if !existing.task.is_finished() {
                    existing.subscribers.insert(watch_id.clone());
                    return Ok(FsWatchStartResult {
                        workspace_root: display_root(&root),
                        watch_id,
                        mode: watch_mode(&existing.native_active),
                    });
                }
            }
            state.workspaces.remove(&root);
            let native_active = Arc::new(AtomicBool::new(true));
            let (sender, receiver) = mpsc::channel(1);
            let watcher = match service.try_start_watcher(&root, sender, Arc::clone(&native_active))
            {
                Ok(watcher) => Some(watcher),
                Err(error) => {
                    eprintln!(
                        "Native filesystem sync unavailable for {}: {error}; using polling",
                        root.display()
                    );
                    native_active.store(false, Ordering::Release);
                    None
                }
            };
            // Subscribe before taking the baseline; queued changes close the startup gap.
            let previous = snapshot::collect(&root)?;
            let mode = watch_mode(&native_active);
            let task = runtime.spawn(run_sync(
                root.clone(),
                previous,
                receiver,
                Arc::clone(&native_active),
                emit,
            ));
            state.workspaces.insert(
                root.clone(),
                WorkspaceWatchState {
                    subscribers: HashSet::from([watch_id.clone()]),
                    native_active,
                    _watcher: watcher,
                    task,
                },
            );
            Ok(FsWatchStartResult {
                workspace_root: display_root(&root),
                watch_id,
                mode,
            })
        })
        .await
        .context("filesystem sync startup task failed")?
    }

    fn try_start_watcher(
        &self,
        root: &Path,
        sender: mpsc::Sender<()>,
        native_active: Arc<AtomicBool>,
    ) -> Result<RecommendedWatcher> {
        if self.force_watcher_start_failure {
            anyhow::bail!("native watcher startup failed");
        }
        let callback_root = root.to_path_buf();
        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<notify::Event>| {
                match result {
                    Ok(event) => {
                        // Read/access events generated by scans must not trigger another scan.
                        if matches!(event.kind, EventKind::Access(_)) {
                            return;
                        }
                        if !event.paths.is_empty()
                            && event.paths.iter().all(|path| {
                                path.strip_prefix(&callback_root)
                                    .map(snapshot::is_ignored)
                                    .unwrap_or(true)
                            })
                        {
                            return;
                        }
                    }
                    Err(error) => {
                        if native_active.swap(false, Ordering::AcqRel) {
                            eprintln!("Native filesystem watcher failed: {error}; using polling");
                        }
                    }
                }
                // One pending wakeup coalesces bursts without an unbounded event queue.
                let _ = sender.try_send(());
            },
            Config::default().with_follow_symlinks(false),
        )?;
        watcher.watch(root, RecursiveMode::Recursive)?;
        Ok(watcher)
    }

    pub fn stop(&self, watch_id: &str) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| anyhow::anyhow!("filesystem sync state is poisoned"))?;
        state.workspaces.retain(|_, workspace| {
            workspace.subscribers.remove(watch_id);
            !workspace.subscribers.is_empty()
        });
        Ok(())
    }

    pub fn stop_all(&self) -> Result<()> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| anyhow::anyhow!("filesystem sync state is poisoned"))?;
        state.shutdown = true;
        state.workspaces.clear();
        Ok(())
    }
}

fn watch_mode(native_active: &AtomicBool) -> FsWatchMode {
    if native_active.load(Ordering::Acquire) {
        FsWatchMode::Watch
    } else {
        FsWatchMode::Polling
    }
}

fn display_root(root: &Path) -> String {
    let raw = root.to_string_lossy().replace('\\', "/");
    if let Some(unc) = raw.strip_prefix("//?/UNC/") {
        format!("//{unc}")
    } else {
        raw.strip_prefix("//?/").unwrap_or(&raw).to_string()
    }
}

async fn run_sync(
    root: PathBuf,
    previous: snapshot::Snapshot,
    receiver: mpsc::Receiver<()>,
    native_active: Arc<AtomicBool>,
    emit: ChangeEmitter,
) {
    run_sync_with_collector(
        root,
        previous,
        receiver,
        native_active,
        emit,
        Arc::new(snapshot::collect),
    )
    .await;
}

async fn run_sync_with_collector(
    root: PathBuf,
    mut previous: snapshot::Snapshot,
    mut receiver: mpsc::Receiver<()>,
    native_active: Arc<AtomicBool>,
    emit: ChangeEmitter,
    collect: SnapshotCollector,
) {
    let mut interval = tokio::time::interval(Duration::from_millis(900));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    interval.tick().await;
    let mut scan_failed = false;
    loop {
        // Retry transient scan failures even if no further native event arrives.
        if native_active.load(Ordering::Acquire) && !scan_failed {
            if receiver.recv().await.is_none() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(150)).await;
            while receiver.try_recv().is_ok() {}
        } else {
            interval.tick().await;
        }
        let scan_root = root.clone();
        let collector = Arc::clone(&collect);
        let current = match tokio::task::spawn_blocking(move || collector(&scan_root)).await {
            Ok(Ok(snapshot)) => {
                scan_failed = false;
                snapshot
            }
            result => {
                if !scan_failed {
                    eprintln!("Filesystem sync scan failed for {}: {result:?}; retaining the previous snapshot", root.display());
                    scan_failed = true;
                }
                continue;
            }
        };
        let changes = snapshot::diff(&previous, &current);
        previous = current;
        if !changes.is_empty() {
            if let Err(error) = emit(WorkspaceFsChangedPayload {
                workspace_root: display_root(&root),
                changes,
            }) {
                eprintln!("Filesystem sync event delivery failed: {error}");
                return;
            }
        }
    }
}
