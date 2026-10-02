use super::*;

#[test]
fn parameter_offsets_use_utf16_and_signature_overrides_the_active_parameter() {
    let result = parse(&json!({ "activeSignature": 1, "activeParameter": 0, "signatures": [
        {"label": "other()"},
        {"label": "F(😀, value int)", "activeParameter": 1, "parameters": [{"label": [2,4]}, {"label": [6,15], "documentation": {"kind":"markdown", "value":"actual docs"}}]}
    ] })).unwrap().unwrap();
    assert_eq!(result.active_signature, 1);
    let signature = &result.signatures[1];
    assert_eq!(signature.active_parameter, Some(1));
    assert_eq!(signature.parameters[0].label, "😀");
    assert_eq!(signature.parameters[1].label, "value int");
    assert_eq!(
        signature.parameters[1].documentation.as_deref(),
        Some("actual docs")
    );
    assert!(
        parse(&json!({"signatures":[{"label":"F(😀)","parameters":[{"label":[2,3]}]}]})).is_err()
    );
}

#[test]
fn missing_and_out_of_range_active_values_follow_protocol_defaults_without_faking_ranges() {
    let result = parse(
        &json!({"activeSignature": 99, "activeParameter": 99, "signatures":[
            {"label":"F(int, int)","parameters":[{"label":"int"},{"label":"int"}]}
        ]}),
    )
    .unwrap()
    .unwrap();
    assert_eq!(result.active_signature, 0);
    assert_eq!(result.signatures[0].active_parameter, Some(0));
    assert!(result.signatures[0].parameters[0].range.is_none());
    assert!(parse(&Value::Null).unwrap().is_none());
    assert!(parse(&json!({"signatures":[]})).unwrap().is_none());
    assert!(parse(&json!({"signatures":[{"label":"F()"}]}))
        .unwrap()
        .unwrap()
        .signatures[0]
        .active_parameter
        .is_none());
    assert!(
        parse(&json!({"signatures":[{"label":"F()","parameters":[{"label":[4,2]}]}]})).is_err()
    );
    assert!(parse(&json!({"signatures":[{"label":"x".repeat(17000)}]})).is_err());
}

struct Workspace(std::path::PathBuf);
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
        for path in ["main.go", "go.mod"] {
            let _ = std::fs::remove_file(self.0.join(path));
        }
        let _ = std::fs::remove_dir(&self.0);
    }
}

#[test]
#[ignore = "requires installed Go and gopls; run explicitly with --include-ignored"]
fn real_gopls_signature_tracks_the_current_argument_in_unsaved_text_without_writing_disk() {
    let path = std::env::temp_dir().join(format!("goide-signature Ω {}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&path).unwrap();
    let workspace = Workspace(super::super::gopls::normalize_platform_pathbuf(
        path.canonicalize().unwrap(),
    ));
    std::fs::write(
        workspace.0.join("go.mod"),
        "module example.com/signatures\n\ngo 1.22\n",
    )
    .unwrap();
    let disk = "package main\nfunc main() {}\n";
    std::fs::write(workspace.0.join("main.go"), disk).unwrap();
    let source = "package main\nfunc Add(left, right int) int { return left + right }\nfunc main() { Add(1, ) }\n";
    let column = source.lines().nth(2).unwrap().find("1, ").unwrap() + 4;
    let result = query(language::Query {
        request_id: Some(uuid::Uuid::new_v4().to_string()),
        workspace_root: workspace.0.to_string_lossy().into_owned(),
        relative_path: "main.go".into(),
        line: 3,
        column,
        kind: language::QueryKind::Hover,
        buffers: vec![language::Buffer {
            path: "main.go".into(),
            content: source.into(),
        }],
    })
    .unwrap()
    .unwrap();
    let signature = &result.signatures[result.active_signature];
    assert!(signature.label.contains("Add"));
    assert_eq!(signature.active_parameter, Some(1));
    assert!(signature.parameters[1].label.contains("right"));
    assert_eq!(
        std::fs::read_to_string(workspace.0.join("main.go")).unwrap(),
        disk
    );
}
