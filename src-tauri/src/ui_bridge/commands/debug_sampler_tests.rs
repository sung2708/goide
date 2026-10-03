use super::*;

#[tokio::test]
#[ignore = "requires installed Go and Delve; starts only an isolated fixture"]
async fn an_actual_program_exit_retires_the_debugger_and_its_stop_token() {
    let root = std::env::temp_dir().join(format!("goide-debug-exit-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(
        root.join("go.mod"),
        "module example.com/debugexit\n\ngo 1.22\n",
    )
    .unwrap();
    std::fs::write(root.join("main.go"), "package main\nfunc main() {}\n").unwrap();
    let started = start_debug_session(StartDebugSessionRequestDto {
        workspace_root: root.to_string_lossy().into(),
        relative_path: "main.go".into(),
    })
    .await;
    assert!(
        started.ok,
        "real debugger startup failed: {:?}",
        started.error
    );
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    loop {
        let state = get_debugger_state().await.data.unwrap();
        if !state.session_active && !state.cleanup_pending {
            assert!(!state.paused);
            assert!(state.stop_token.is_none());
            assert!(state.active_relative_path.is_none());
            break;
        }
        if tokio::time::Instant::now() >= deadline {
            let stopped = deactivate_deep_trace().await;
            panic!(
                "natural exit was not observed; explicit cleanup: {:?}",
                stopped.error
            );
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    std::fs::remove_dir_all(root).unwrap();
}
