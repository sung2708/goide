use super::*;

fn fixture(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("goide-{name}-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(
        root.join("go.mod"),
        "module example.com/startup\n\ngo 1.22\n",
    )
    .unwrap();
    std::fs::write(
        root.join("main.go"),
        "package main\nimport \"time\"\nfunc main() { time.Sleep(60*time.Second) }\n",
    )
    .unwrap();
    root
}
async fn remove_fixture(root: PathBuf) {
    // This fixture is freshly created by this test. Ownership assertions precede deletion;
    // Windows may briefly retain a file handle after every job member has exited.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    loop {
        match std::fs::remove_dir_all(&root) {
            Ok(()) => return,
            Err(error)
                if error.kind() == std::io::ErrorKind::PermissionDenied
                    && tokio::time::Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(30)).await;
            }
            Err(error) => panic!("Fixture cleanup failed for {}: {error}", root.display()),
        }
    }
}
fn request(root: &Path, id: &str) -> StartDebugSessionRequestDto {
    StartDebugSessionRequestDto {
        request_id: id.into(),
        workspace_root: root.to_string_lossy().into_owned(),
        relative_path: "main.go".into(),
        test_name: None,
    }
}
fn cancel(root: &Path, id: &str) -> super::super::types::LanguageCancelRequestDto {
    super::super::types::LanguageCancelRequestDto {
        workspace_root: root.to_string_lossy().into_owned(),
        request_id: id.into(),
    }
}
#[tokio::test]
async fn debug_startup_cancellation_precedes_gate_acquisition_and_prevents_late_launch() {
    let root = fixture("debug-queued");
    let id = uuid::Uuid::new_v4().to_string();
    let gate = crate::integration::lifecycle::gate()
        .operation()
        .await
        .unwrap();
    let start_request = request(&root, &id);
    let startup = tokio::spawn(start_debug_session(start_request));
    tokio::time::sleep(Duration::from_millis(30)).await;
    let normalized = gopls::normalize_platform_pathbuf(root.canonicalize().unwrap());
    crate::integration::language_requests::cancel(&normalized, &id).unwrap();
    let response = tokio::time::timeout(Duration::from_secs(1), startup)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(response.error.unwrap().code, "debug_startup_cancelled");
    assert!(get_dap_session_handle().lock().await.is_none());
    drop(gate);
    assert!(cancel_debugger_startup(cancel(&root, &id)).await.ok);
    assert!(!start_debug_session(request(&root, &id)).await.ok);
    remove_fixture(root).await;
}
#[tokio::test]
#[ignore = "requires installed Go and Delve; verifies acknowledged startup ownership and scoped cleanup"]
async fn actual_debug_startup_cleanup_preserves_foreign_requests_and_retires_only_its_session() {
    let root = fixture("debug-startup");
    let id = uuid::Uuid::new_v4().to_string();
    let started = start_debug_session(request(&root, &id)).await;
    assert!(started.ok, "{:?}", started.error);
    let state = started.data.unwrap().debugger_state.unwrap();
    let owner = state.session_id.unwrap();
    tokio::time::sleep(Duration::from_millis(150)).await;
    assert_eq!(
        get_debugger_state()
            .await
            .data
            .unwrap()
            .session_id
            .as_deref(),
        Some(owner.as_str())
    );
    let other = uuid::Uuid::new_v4().to_string();
    let rejected = start_debug_session(request(&root, &other)).await;
    assert_eq!(rejected.error.unwrap().code, "debug_session_busy");
    assert!(cancel_debugger_startup(cancel(&root, &other)).await.ok);
    assert!(
        !cancel_debugger_startup(cancel(root.parent().unwrap(), &id))
            .await
            .ok
    );
    assert_eq!(
        get_debugger_state()
            .await
            .data
            .unwrap()
            .session_id
            .as_deref(),
        Some(owner.as_str())
    );
    assert!(cancel_debugger_startup(cancel(&root, &id)).await.ok);
    let state = get_debugger_state().await.data.unwrap();
    assert!(!state.session_active);
    assert!(!state.cleanup_pending);
    assert!(state.stop_token.is_none());
    assert!(get_dap_session_handle().lock().await.is_none());
    assert!(!delve::ownership::is_pending());
    remove_fixture(root).await;
}
