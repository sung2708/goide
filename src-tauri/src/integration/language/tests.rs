use super::*;

#[test]
#[ignore = "requires installed Go and gopls; run explicitly with --include-ignored"]
fn cancelling_a_wait_keeps_the_real_gopls_session_reusable() {
    let workspace = Workspace::new();
    let base = Query {
        request_id: None,
        workspace_root: workspace.0.to_string_lossy().into_owned(),
        relative_path: "helper.go".into(),
        line: 2,
        column: 8,
        kind: QueryKind::Hover,
        buffers: vec![],
    };
    assert!(query(base.clone())
        .unwrap()
        .text
        .unwrap()
        .contains("Greeting"));
    let handle = lsp_manager::get_lsp_session();
    let pid = handle.lock().unwrap().as_ref().unwrap()._child.id();
    let id = uuid::Uuid::new_v4().to_string();
    let root = workspace.0.clone();
    let cancel_id = id.clone();
    let (ready, started) = std::sync::mpsc::channel();
    let canceller = std::thread::spawn(move || {
        started.recv_timeout(Duration::from_secs(5)).unwrap();
        super::super::language_requests::cancel(&root, &cancel_id).unwrap();
    });
    let result = with_documents(
        Query {
            request_id: Some(id),
            ..base.clone()
        },
        |_, session, _, _| {
            ready.send(()).unwrap();
            // Exercise a pending receive deterministically, without depending on package-load timing.
            lsp_manager::wait_lsp_response_until_sync(
                &session.rx,
                -10,
                Instant::now() + Duration::from_secs(5),
            )
        },
    );
    canceller.join().unwrap();
    assert!(super::super::language_requests::is_stopped(
        &result.unwrap_err()
    ));
    assert_eq!(handle.lock().unwrap().as_ref().unwrap()._child.id(), pid);
    assert!(query(base).unwrap().text.unwrap().contains("Greeting"));
    assert_eq!(
        std::fs::read_to_string(workspace.0.join("helper.go")).unwrap(),
        "package main\nconst Greeting = \"hello\"\n"
    );
}

#[test]
fn queued_completion_cancels_without_starting_a_cli_fallback() {
    let workspace = Workspace::new();
    let handle = lsp_manager::get_lsp_session();
    let guard = handle.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let root = workspace.0.clone();
    let worker_id = id.clone();
    let (sender, receiver) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        let _scope = super::super::language_requests::begin(&root, Some(&worker_id)).unwrap();
        sender
            .send(super::super::gopls::get_file_completions(
                &root.to_string_lossy(),
                "main.go",
                1,
                1,
                None,
                None,
            ))
            .unwrap();
    });
    std::thread::sleep(Duration::from_millis(50));
    super::super::language_requests::cancel(&workspace.0, &id).unwrap();
    let result = receiver.recv_timeout(Duration::from_secs(1));
    drop(guard);
    worker.join().unwrap();
    assert!(super::super::language_requests::is_stopped(
        &result.unwrap().unwrap_err()
    ));
}

#[test]
fn queued_language_query_can_cancel_without_acquiring_the_server_lock() {
    let workspace = Workspace::new();
    let handle = lsp_manager::get_lsp_session();
    let guard = handle.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let request = Query {
        request_id: Some(id.clone()),
        workspace_root: workspace.0.to_string_lossy().into_owned(),
        relative_path: "main.go".into(),
        line: 1,
        column: 1,
        kind: QueryKind::Definition,
        buffers: vec![],
    };
    let (sender, receiver) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        sender.send(query(request)).unwrap();
    });
    std::thread::sleep(Duration::from_millis(50));
    super::super::language_requests::cancel(&workspace.0, &id).unwrap();
    let result = receiver.recv_timeout(Duration::from_secs(1));
    drop(guard);
    worker.join().unwrap();
    assert!(super::super::language_requests::is_stopped(
        &result.unwrap().unwrap_err()
    ));
}
struct Workspace(std::path::PathBuf);
impl Workspace {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "goide-language # tiếng Việt {}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir(&root).unwrap();
        std::fs::write(
            root.join("go.mod"),
            "module example.com/language\n\ngo 1.22\n",
        )
        .unwrap();
        std::fs::write(
            root.join("main.go"),
            "package main\nfunc main() { println(Greeting) }\n",
        )
        .unwrap();
        std::fs::write(
            root.join("helper.go"),
            "package main\nconst Greeting = \"hello\"\n",
        )
        .unwrap();
        Self(normalize_platform_pathbuf(root.canonicalize().unwrap()))
    }
}
impl Drop for Workspace {
    fn drop(&mut self) {
        let handle = lsp_manager::get_lsp_session();
        if let Ok(mut guard) = handle.lock() {
            if guard
                .as_ref()
                .is_some_and(|session| session.workspace_root == self.0)
            {
                guard.take();
            }
        }
        for file in ["go.mod", "main.go", "helper.go"] {
            let _ = std::fs::remove_file(self.0.join(file));
        }
        let _ = std::fs::remove_dir(&self.0);
    }
}
#[test]
fn language_locations_preserve_selection_range_and_report_external_results() {
    let root = Workspace::new();
    let outside = Workspace::new();
    let range = json!({"start": {"line": 1, "character": 6}, "end": {"line": 1, "character": 14}});
    let result = parse_result(&root.0, &QueryKind::Definition, &json!([
        {"targetUri": lsp_manager::path_to_file_uri(&root.0.join("helper.go")).unwrap(), "targetSelectionRange": range},
        {"uri": lsp_manager::path_to_file_uri(&outside.0.join("main.go")).unwrap(), "range": range}
    ])).unwrap();
    assert_eq!(result.locations.len(), 1);
    assert_eq!(result.locations[0].path, "helper.go");
    assert_eq!(
        (result.locations[0].line, result.locations[0].column),
        (2, 7)
    );
    assert_eq!(result.outside_workspace, 1);
    assert!(parse_result(
        &root.0,
        &QueryKind::References,
        &json!([{"uri": "https://example.com"}])
    )
    .is_err());
    assert!(scoped_file(&root.0, "../outside.go").is_err());
    assert!(scoped_file(&root.0, "go.mod").is_err());
}
#[test]
fn hover_supports_protocol_content_shapes_without_inventing_empty_results() {
    assert_eq!(
        hover_text(&json!({"kind": "markdown", "value": "hello"})).as_deref(),
        Some("hello")
    );
    assert_eq!(
        hover_text(&json!([{"language": "go", "value": "const X = 1"}, "docs"])).as_deref(),
        Some("const X = 1\n\ndocs")
    );
    assert!(hover_text(&Value::Null).is_none());
}
#[test]
#[ignore = "requires installed Go and gopls; run explicitly with --include-ignored"]
fn real_gopls_queries_use_unsaved_buffers_across_files_without_writing_disk() {
    let workspace = Workspace::new();
    let base = Query {
        request_id: None,
        workspace_root: workspace.0.to_string_lossy().to_string(),
        relative_path: "main.go".into(),
        line: 2,
        column: 24,
        kind: QueryKind::Definition,
        buffers: vec![
            Buffer {
                path: "main.go".into(),
                content: "package main\nfunc main() { println(Changed) }\n".into(),
            },
            Buffer {
                path: "helper.go".into(),
                content: "package main\nconst Changed = \"hello\"\n".into(),
            },
        ],
    };
    let definition = query(base.clone()).unwrap();
    assert_eq!(definition.locations.len(), 1);
    assert_eq!(definition.locations[0].path, "helper.go");
    assert_eq!(definition.locations[0].line, 2);
    let references = query(Query {
        kind: QueryKind::References,
        ..base.clone()
    })
    .unwrap();
    assert!(references
        .locations
        .iter()
        .any(|location| location.path == "main.go"));
    assert!(references
        .locations
        .iter()
        .any(|location| location.path == "helper.go"));
    let hover = query(Query {
        kind: QueryKind::Hover,
        ..base
    })
    .unwrap();
    assert!(hover.text.unwrap().contains("Changed"));
    assert!(std::fs::read_to_string(workspace.0.join("helper.go"))
        .unwrap()
        .contains("Greeting"));
}
