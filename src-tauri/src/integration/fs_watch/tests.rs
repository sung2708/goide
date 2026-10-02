use super::*;
use std::fs;

struct Workspace(PathBuf);

impl Workspace {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("goide-watch-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for Workspace {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).unwrap();
    }
}

fn emitter() -> (
    ChangeEmitter,
    mpsc::UnboundedReceiver<WorkspaceFsChangedPayload>,
) {
    let (sender, receiver) = mpsc::unbounded_channel();
    (
        Arc::new(move |payload| sender.send(payload).map_err(|error| error.to_string())),
        receiver,
    )
}

async fn wait_for_change(
    receiver: &mut mpsc::UnboundedReceiver<WorkspaceFsChangedPayload>,
    relative_path: &str,
    kind: FsWatchChangeKindDto,
) {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let payload = receiver.recv().await.expect("watcher event channel closed");
            if payload
                .changes
                .iter()
                .any(|change| change.relative_path == relative_path && change.kind == kind)
            {
                break;
            }
        }
    })
    .await
    .expect("filesystem change was not delivered");
}

#[tokio::test]
async fn native_watch_delivers_real_file_changes() {
    let workspace = Workspace::new();
    let service = FsWatchService::new();
    let (emit, mut events) = emitter();
    let started = service
        .start_with_emitter(workspace.0.clone(), emit)
        .await
        .unwrap();
    assert_eq!(started.mode, FsWatchMode::Watch);
    assert!(!started.workspace_root.starts_with("//?/"));
    fs::write(workspace.0.join("main.go"), "package main").unwrap();
    wait_for_change(&mut events, "main.go", FsWatchChangeKindDto::Create).await;
    fs::write(workspace.0.join("main.go"), "package demo").unwrap();
    wait_for_change(&mut events, "main.go", FsWatchChangeKindDto::Modify).await;
    fs::rename(workspace.0.join("main.go"), workspace.0.join("renamed.go")).unwrap();
    wait_for_change(&mut events, "renamed.go", FsWatchChangeKindDto::Create).await;
    fs::remove_file(workspace.0.join("renamed.go")).unwrap();
    wait_for_change(&mut events, "renamed.go", FsWatchChangeKindDto::Delete).await;
    service.stop(&started.watch_id).unwrap();
    assert!(service.state.lock().unwrap().workspaces.is_empty());
}

#[tokio::test]
async fn polling_delivers_content_changes_when_native_start_fails() {
    let workspace = Workspace::new();
    fs::write(workspace.0.join("main.go"), "before").unwrap();
    let service = FsWatchService::new_for_test(true);
    let (emit, mut events) = emitter();
    let started = service
        .start_with_emitter(workspace.0.clone(), emit)
        .await
        .unwrap();
    assert_eq!(started.mode, FsWatchMode::Polling);
    fs::write(workspace.0.join("main.go"), "after with a different length").unwrap();
    wait_for_change(&mut events, "main.go", FsWatchChangeKindDto::Modify).await;
    service.stop(&started.watch_id).unwrap();
}

#[tokio::test]
async fn duplicate_starts_share_resources_with_independent_cleanup() {
    let workspace = Workspace::new();
    let service = FsWatchService::new_for_test(true);
    let (emit, _) = emitter();
    let first = service
        .start_with_emitter(workspace.0.clone(), Arc::clone(&emit))
        .await
        .unwrap();
    let second = service
        .start_with_emitter(workspace.0.clone(), emit)
        .await
        .unwrap();
    assert_ne!(first.watch_id, second.watch_id);
    assert_eq!(service.state.lock().unwrap().workspaces.len(), 1);
    service.stop(&first.watch_id).unwrap();
    service.stop(&first.watch_id).unwrap();
    assert_eq!(service.state.lock().unwrap().workspaces.len(), 1);
    let task = service
        .state
        .lock()
        .unwrap()
        .workspaces
        .values()
        .next()
        .unwrap()
        .task
        .abort_handle();
    service.stop(&second.watch_id).unwrap();
    tokio::time::timeout(Duration::from_secs(1), async {
        while !task.is_finished() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("filesystem sync task did not stop");
    assert!(service.state.lock().unwrap().workspaces.is_empty());
}

#[tokio::test]
async fn failed_native_scan_retries_without_another_filesystem_event() {
    let workspace = Workspace::new();
    let previous = snapshot::collect(&workspace.0).unwrap();
    fs::write(workspace.0.join("main.go"), "package main").unwrap();
    let (emit, mut events) = emitter();
    let (wake_sender, wake_receiver) = mpsc::channel(1);
    let (failed_sender, mut failed_receiver) = mpsc::unbounded_channel();
    let first_scan = AtomicBool::new(true);
    let collector: SnapshotCollector = Arc::new(move |root| {
        if first_scan.swap(false, Ordering::AcqRel) {
            failed_sender.send(()).unwrap();
            anyhow::bail!("injected transient scan failure");
        }
        snapshot::collect(root)
    });
    let task = tokio::spawn(run_sync_with_collector(
        workspace.0.clone(),
        previous,
        wake_receiver,
        Arc::new(AtomicBool::new(true)),
        emit,
        collector,
    ));
    wake_sender.send(()).await.unwrap();
    tokio::time::timeout(Duration::from_secs(5), failed_receiver.recv())
        .await
        .unwrap()
        .unwrap();
    // No second wakeup: the periodic retry must discover the real file.
    wait_for_change(&mut events, "main.go", FsWatchChangeKindDto::Create).await;
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
}

#[tokio::test]
async fn missing_roots_and_files_are_not_reported_as_watched() {
    let workspace = Workspace::new();
    fs::write(workspace.0.join("main.go"), "package main").unwrap();
    let service = FsWatchService::new();
    let (emit, _) = emitter();
    assert!(service
        .start_with_emitter(workspace.0.join("missing"), Arc::clone(&emit))
        .await
        .is_err());
    assert!(service
        .start_with_emitter(workspace.0.join("main.go"), emit)
        .await
        .is_err());
    assert!(service.state.lock().unwrap().workspaces.is_empty());
}

#[tokio::test]
async fn stop_all_releases_every_workspace() {
    let first = Workspace::new();
    let second = Workspace::new();
    let service = FsWatchService::new_for_test(true);
    let (emit, _) = emitter();
    service
        .start_with_emitter(first.0.clone(), Arc::clone(&emit))
        .await
        .unwrap();
    service
        .start_with_emitter(second.0.clone(), emit)
        .await
        .unwrap();
    service.stop_all().unwrap();
    assert!(service.state.lock().unwrap().workspaces.is_empty());
    let (emit, _) = emitter();
    assert!(service
        .start_with_emitter(first.0.clone(), emit)
        .await
        .is_err());
}

#[test]
fn snapshots_report_create_delete_and_same_size_modifications() {
    let workspace = Workspace::new();
    fs::write(workspace.0.join("old.go"), "old").unwrap();
    let previous = snapshot::collect(&workspace.0).unwrap();
    fs::remove_file(workspace.0.join("old.go")).unwrap();
    fs::write(workspace.0.join("new.go"), "new").unwrap();
    let mut current = snapshot::collect(&workspace.0).unwrap();
    let changes = snapshot::diff(&previous, &current);
    assert_eq!(changes.len(), 2);
    assert_eq!(changes[0].relative_path, "new.go");
    assert_eq!(changes[1].relative_path, "old.go");
    let previous = current.clone();
    current.get_mut(&PathBuf::from("new.go")).unwrap().modified = Some(std::time::UNIX_EPOCH);
    let changes = snapshot::diff(&previous, &current);
    assert_eq!(changes.len(), 1);
    assert_eq!(changes[0].kind, FsWatchChangeKindDto::Modify);
}

#[test]
fn snapshots_exclude_generated_trees() {
    let workspace = Workspace::new();
    for ignored in [".git", "node_modules", "target", "dist"] {
        fs::create_dir(workspace.0.join(ignored)).unwrap();
        fs::write(workspace.0.join(ignored).join("ignored.go"), "ignore").unwrap();
    }
    fs::create_dir(workspace.0.join("pkg")).unwrap();
    fs::write(workspace.0.join("pkg/main.go"), "package main").unwrap();
    assert_eq!(snapshot::collect(&workspace.0).unwrap().len(), 2);
}

#[cfg(windows)]
#[test]
fn snapshots_do_not_follow_windows_junctions() {
    let workspace = Workspace::new();
    let outside = Workspace::new();
    fs::write(outside.0.join("private.go"), "outside").unwrap();
    for (name, destination) in [("outside", &outside.0), ("cycle", &workspace.0)] {
        let output = std::process::Command::new("cmd.exe")
            .args(["/d", "/c", "mklink", "/J"])
            .arg(workspace.0.join(name))
            .arg(destination)
            .output()
            .unwrap();
        assert!(output.status.success(), "junction setup failed: {output:?}");
    }
    let snapshot = snapshot::collect(&workspace.0).unwrap();
    assert_eq!(snapshot.len(), 2);
    assert!(snapshot.values().all(|entry| !entry.is_dir));
}

#[cfg(unix)]
#[test]
fn snapshots_do_not_follow_outside_or_cyclic_links() {
    use std::os::unix::fs::symlink;
    let workspace = Workspace::new();
    let outside = Workspace::new();
    fs::write(outside.0.join("private.go"), "outside").unwrap();
    symlink(&outside.0, workspace.0.join("outside")).unwrap();
    symlink(&workspace.0, workspace.0.join("cycle")).unwrap();
    let snapshot = snapshot::collect(&workspace.0).unwrap();
    assert_eq!(snapshot.len(), 2);
    assert!(snapshot.values().all(|entry| !entry.is_dir));
}
