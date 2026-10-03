use super::*;
use crate::ui_bridge::types::DebuggerControlContextDto;

async fn observed_stop(previous: Option<&str>) -> Result<DebuggerStateDto, String> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    loop {
        let state = get_debugger_state().await.data.ok_or("No debugger state")?;
        if state.paused
            && state
                .stop_token
                .as_deref()
                .is_some_and(|token| Some(token) != previous)
        {
            return Ok(state);
        }
        if !state.session_active || tokio::time::Instant::now() >= deadline {
            return Err("No new observed stop before deadline".into());
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

#[tokio::test]
#[ignore = "requires installed Go and Delve; starts only an isolated fixture"]
async fn debugger_controls_reject_wrong_owners_and_old_stops_before_actual_step_continue_pause() {
    let root = std::env::temp_dir().join(format!("goide-control-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir_all(root.join("other")).unwrap();
    std::fs::write(
        root.join("go.mod"),
        "module example.com/control\n\ngo 1.22\n",
    )
    .unwrap();
    std::fs::write(root.join("main.go"), "package main\nimport \"time\"\nfunc main() {\n value := 1\n value++\n time.Sleep(time.Duration(value)*time.Minute)\n}\n").unwrap();
    let result = async {
        let breakpoint = debugger_toggle_breakpoint(ToggleBreakpointRequestDto {
            workspace_root: root.to_string_lossy().into(),
            session_id: None,
            relative_path: "main.go".into(),
            line: 4,
        })
        .await;
        if !breakpoint.ok {
            return Err(format!("Breakpoint failed: {:?}", breakpoint.error));
        }
        let started = start_debug_session(StartDebugSessionRequestDto {
            request_id: uuid::Uuid::new_v4().to_string(),
            test_name: None,
            workspace_root: root.to_string_lossy().into(),
            relative_path: "main.go".into(),
        })
        .await;
        if !started.ok {
            return Err(format!("Startup failed: {:?}", started.error));
        }
        let state = observed_stop(None).await?;
        let context = DebuggerControlContextDto {
            workspace_root: root.to_string_lossy().into(),
            session_id: state.session_id.ok_or("No owner UUID")?,
            stop_token: state.stop_token,
        };
        if deactivate_deep_trace(crate::ui_bridge::types::DebuggerStopContextDto {
            session_id: None,
        })
        .await
        .ok
        {
            return Err("Unidentified Stop was accepted for an active owner".into());
        }
        if deactivate_deep_trace(crate::ui_bridge::types::DebuggerStopContextDto {
            session_id: Some(uuid::Uuid::new_v4().to_string()),
        })
        .await
        .ok
        {
            return Err("Wrong Stop owner was accepted".into());
        }
        let mut stale = context.clone();
        stale.session_id = uuid::Uuid::new_v4().to_string();
        if debugger_continue(stale).await.ok {
            return Err("Wrong owner was accepted".into());
        }
        let mut foreign = context.clone();
        foreign.workspace_root = root.join("other").to_string_lossy().into();
        if debugger_step_over(foreign).await.ok {
            return Err("Wrong workspace was accepted".into());
        }
        let wrong_breakpoint = debugger_toggle_breakpoint(ToggleBreakpointRequestDto {
            workspace_root: root.to_string_lossy().into(),
            session_id: Some(uuid::Uuid::new_v4().to_string()),
            relative_path: "main.go".into(),
            line: 5,
        })
        .await;
        if wrong_breakpoint.ok {
            return Err("Wrong breakpoint owner was accepted".into());
        }
        let stepped = debugger_step_over(context.clone()).await;
        if !stepped.ok {
            return Err(format!("Step failed: {:?}", stepped.error));
        }
        let next = observed_stop(context.stop_token.as_deref()).await?;
        if next.active_line != Some(5) {
            return Err(format!(
                "Unexpected actual step line: {:?}",
                next.active_line
            ));
        }
        let obsolete = debugger_continue(context.clone()).await;
        if obsolete.ok {
            return Err("Old stop was accepted after step".into());
        }
        if obsolete.data.and_then(|observation| observation.stop_token) != next.stop_token {
            return Err("Rejected control did not retain the actual newer stop observation".into());
        }
        let resumed = DebuggerControlContextDto {
            stop_token: next.stop_token,
            ..context
        };
        let continued = debugger_continue(resumed.clone()).await;
        if !continued.ok {
            return Err(format!("Continue failed: {:?}", continued.error));
        }
        if debugger_step_into(resumed.clone()).await.ok {
            return Err("Old stop was accepted after Continue".into());
        }
        let paused = debugger_pause(DebuggerControlContextDto {
            stop_token: None,
            ..resumed
        })
        .await;
        if !paused.ok {
            return Err(format!("Pause failed: {:?}", paused.error));
        }
        let final_state = observed_stop(None).await?;
        if final_state.stop_token.is_none() {
            return Err("Pause did not produce an observed stop".into());
        }
        Ok::<(), String>(())
    }
    .await;
    let stopped = deactivate_deep_trace(crate::ui_bridge::types::DebuggerStopContextDto {
        session_id: get_debugger_state()
            .await
            .data
            .and_then(|state| state.session_id),
    })
    .await;
    assert!(stopped.ok, "fixture teardown failed: {:?}", stopped.error);
    let retired = get_debugger_state().await.data.unwrap();
    assert!(
        !retired.session_active && !retired.cleanup_pending,
        "fixture still owns a process after Stop"
    );
    // Windows can briefly retain an executable's filesystem handle after its
    // owned job is empty. Retry deletion only for this freshly created fixture.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        match std::fs::remove_dir_all(&root) {
            Ok(()) => break,
            Err(error) if tokio::time::Instant::now() < deadline => {
                if error.kind() != std::io::ErrorKind::PermissionDenied {
                    panic!("fixture removal failed: {error}");
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            Err(error) => panic!("fixture removal deadline exceeded: {error}"),
        }
    }
    result.unwrap();
}

#[test]
fn breakpoint_templates_do_not_cross_workspace_boundaries() {
    let mut store = RuntimeSignalStore::default();
    scope_breakpoints(&mut store, Path::new("first"));
    toggle_breakpoint_in_store(&mut store, "main.go", 4);
    scope_breakpoints(&mut store, Path::new("first"));
    assert_eq!(store.breakpoints.get("main.go"), Some(&vec![4]));
    scope_breakpoints(&mut store, Path::new("second"));
    assert!(store.breakpoints.is_empty());
}
