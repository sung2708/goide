use super::*;
use crate::integration::delve::inspection::{Output, Query, Request};
use crate::ui_bridge::types::{DebuggerControlContextDto, DebuggerStopContextDto};
use anyhow::Context;

#[tokio::test]
#[ignore = "requires installed Go and Delve; isolated nested module fixture"]
async fn debug_test_builds_the_package_selects_one_test_and_reads_actual_locals() {
    let root = std::env::temp_dir().join(format!("goide-debug-test-{}", uuid::Uuid::new_v4()));
    let directory = root.join("module/checks");
    std::fs::create_dir_all(&directory).unwrap();
    std::fs::write(
        root.join("module/go.mod"),
        "module example.com/debugtest\n\ngo 1.22\n",
    )
    .unwrap();
    std::fs::write(
        directory.join("helpers.go"),
        "package checks\nfunc helper() int { return 41 }\n",
    )
    .unwrap();
    std::fs::write(directory.join("checks_test.go"), "package checks\nimport (\"testing\"; \"os\")\nfunc TestSelected(t *testing.T) {\n value := helper() + 1\n t.Log(value)\n if value != 42 { t.Fatal(value) }\n if err := os.WriteFile(\"selected.marker\", []byte(\"42\"), 0600); err != nil { t.Fatal(err) }\n}\nfunc TestOther(t *testing.T) { os.WriteFile(\"other.marker\", []byte(\"wrong\"), 0600); t.Fatal(\"unselected test executed\") }\n").unwrap();
    std::fs::write(directory.join("excluded_test.go"), "//go:build goide_never_selected\n\npackage checks\nimport \"testing\"\nfunc TestExcluded(t *testing.T) {}\n").unwrap();
    let result = async {
        let bp = debugger_toggle_breakpoint(ToggleBreakpointRequestDto {
            workspace_root: root.to_string_lossy().into(),
            session_id: None,
            relative_path: "module/checks/checks_test.go".into(),
            line: 5,
        })
        .await;
        anyhow::ensure!(bp.ok, "breakpoint failed: {:?}", bp.error);
        let started = start_debug_session(StartDebugSessionRequestDto {
            workspace_root: root.to_string_lossy().into(),
            relative_path: "module/checks/checks_test.go".into(),
            test_name: Some("TestSelected".into()),
        })
        .await;
        anyhow::ensure!(started.ok, "Debug Test startup failed: {:?}", started.error);
        let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
        let state = loop {
            let state = get_debugger_state()
                .await
                .data
                .context("No debugger state")?;
            if state.paused && state.stop_token.is_some() {
                break state;
            }
            anyhow::ensure!(
                tokio::time::Instant::now() < deadline && state.session_active,
                "No observed TestSelected stop"
            );
            tokio::time::sleep(Duration::from_millis(50)).await;
        };
        anyhow::ensure!(
            state.active_relative_path.as_deref() == Some("module/checks/checks_test.go")
                && state.active_line == Some(5),
            "Incorrect actual test frame: {state:?}"
        );
        let token = state.stop_token.clone().context("No stop token")?;
        let request = |query| Request {
            workspace_root: root.to_string_lossy().into(),
            stop_token: token.clone(),
            query,
        };
        dispatch_debugger_inspection(request(Query::Threads))
            .await
            .map_err(anyhow::Error::msg)?;
        let thread_id = state
            .selected_thread_id
            .context("No selected actual thread")?;
        let Output::Stack { items: frames, .. } =
            dispatch_debugger_inspection(request(Query::Stack { thread_id }))
                .await
                .map_err(anyhow::Error::msg)?
        else {
            anyhow::bail!("No stack result");
        };
        let top = frames.first().context("No actual test frame")?;
        anyhow::ensure!(
            top.name.ends_with(".TestSelected"),
            "Wrong test selected: {}",
            top.name
        );
        let Output::Scopes { items: scopes, .. } =
            dispatch_debugger_inspection(request(Query::Scopes { frame_id: top.id }))
                .await
                .map_err(anyhow::Error::msg)?
        else {
            anyhow::bail!("No scopes");
        };
        let locals = scopes
            .iter()
            .find(|scope| scope.name.starts_with("Locals"))
            .context("No locals scope")?;
        let Output::Variables {
            items: variables, ..
        } = dispatch_debugger_inspection(request(Query::Variables {
            reference: locals.reference,
            start: 0,
            indexed: false,
        }))
        .await
        .map_err(anyhow::Error::msg)?
        else {
            anyhow::bail!("No locals");
        };
        anyhow::ensure!(
            variables
                .iter()
                .any(|variable| variable.name == "value" && variable.value == "42"),
            "Missing actual helper-derived value: {variables:?}"
        );
        let continued = debugger_continue(DebuggerControlContextDto {
            workspace_root: root.to_string_lossy().into(),
            session_id: state.session_id.context("No owner UUID")?,
            stop_token: Some(token),
        })
        .await;
        anyhow::ensure!(continued.ok, "Continue failed: {:?}", continued.error);
        let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
        loop {
            let state = get_debugger_state()
                .await
                .data
                .context("No debugger state")?;
            if !state.session_active && !state.cleanup_pending {
                break;
            }
            anyhow::ensure!(
                tokio::time::Instant::now() < deadline,
                "Test exit/cleanup not observed"
            );
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        anyhow::ensure!(
            std::fs::read_to_string(directory.join("selected.marker"))? == "42",
            "Selected test did not complete"
        );
        anyhow::ensure!(
            !directory.join("other.marker").exists(),
            "Unselected test executed"
        );
        for (file, name) in [
            ("module/checks/checks_test.go", "TestMissing"),
            ("module/checks/excluded_test.go", "TestExcluded"),
        ] {
            let rejected = start_debug_session(StartDebugSessionRequestDto {
                workspace_root: root.to_string_lossy().into(),
                relative_path: file.into(),
                test_name: Some(name.into()),
            })
            .await;
            anyhow::ensure!(!rejected.ok, "Missing/excluded test accepted");
            anyhow::ensure!(
                !get_debugger_state()
                    .await
                    .data
                    .context("No state")?
                    .session_active,
                "Rejected target launched a debugger"
            );
        }
        Ok::<(), anyhow::Error>(())
    }
    .await;
    let stopped = deactivate_deep_trace(DebuggerStopContextDto {
        session_id: get_debugger_state()
            .await
            .data
            .and_then(|state| state.session_id),
    })
    .await;
    assert!(stopped.ok, "fixture cleanup failed: {:?}", stopped.error);
    let state = get_debugger_state().await.data.unwrap();
    assert!(
        !state.session_active && !state.cleanup_pending,
        "Native ownership not retired"
    );
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        match std::fs::remove_dir_all(&root) {
            Ok(()) => break,
            Err(error)
                if error.kind() == std::io::ErrorKind::PermissionDenied
                    && tokio::time::Instant::now() < deadline =>
            {
                tokio::time::sleep(Duration::from_millis(50)).await
            }
            Err(error) => panic!("fresh fixture removal failed: {error}"),
        }
    }
    result.unwrap();
}
