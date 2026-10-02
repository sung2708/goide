use super::*;
#[test]
fn lists_only_real_actions_and_marks_commands_unavailable() {
    let result = descriptions(&json!([
        {"title": "Actual fix", "kind": "quickfix", "edit": {"changes": {}}, "isPreferred": true},
        {"title": "Lazy fix", "kind": "refactor.rewrite", "data": {"command": "gopls.apply_fix", "arguments": [{"ResolveEdits": true}]}},
        {"title": "Run task", "command": "gopls.test"},
        {"title": "Unavailable", "disabled": {"reason": "Generated source"}}
    ]))
    .unwrap();
    assert_eq!(result.len(), 4);
    assert!(result[0].preferred && result[0].disabled_reason.is_none());
    assert!(result[1].disabled_reason.is_none());
    assert!(result[2]
        .disabled_reason
        .as_ref()
        .unwrap()
        .contains("not supported"));
    assert_eq!(
        result[3].disabled_reason.as_deref(),
        Some("Generated source")
    );
    assert!(descriptions(&json!([{"title": ""}])).is_err());
    assert!(descriptions(&json!({"fake": true})).is_err());
    assert!(descriptions(&Value::Array(vec![json!({"title": "too many"}); 257])).is_err());
    assert!(descriptions(&Value::Null).unwrap().is_empty());
}
#[test]
fn shared_edit_validation_rejects_resource_operations_and_duplicate_files() {
    let root = std::env::temp_dir().join(format!("goide-actions-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let target = root.join("main.go");
    std::fs::write(&target, "package main\n").unwrap();
    let root = normalize_platform_pathbuf(root.canonicalize().unwrap());
    let uri = lsp_manager::path_to_file_uri(&target).unwrap();
    assert!(group_edits(
        &root,
        &json!({"documentChanges": [{"kind": "delete", "uri": uri}]})
    )
    .is_err());
    assert!(group_edits(&root, &json!({"changes": {uri.clone(): []}, "documentChanges": [{"textDocument": {"uri": uri}, "edits": []}]})).is_err());
    std::fs::remove_file(target).unwrap();
    std::fs::remove_dir(root).unwrap();
}
#[test]
#[ignore = "requires installed Go and gopls; run explicitly with --include-ignored"]
fn real_gopls_actions_are_resolved_and_reviewed_without_writing_disk() {
    let root = std::env::temp_dir().join(format!(
        "goide actions # tiếng Việt {}",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir(&root).unwrap();
    std::fs::write(
        root.join("go.mod"),
        "module example.com/actions\n\ngo 1.22\n",
    )
    .unwrap();
    let disk = "package main\nfunc main() {}\n";
    std::fs::write(root.join("main.go"), disk).unwrap();
    let before = "package main\nimport \"os\"\nfunc main() { fmt.Println(\"hello\") }\n";
    let query = language::Query {
        request_id: None,
        workspace_root: root.to_string_lossy().into(),
        relative_path: "main.go".into(),
        line: 3,
        column: 27,
        kind: language::QueryKind::Hover,
        buffers: vec![language::Buffer {
            path: "main.go".into(),
            content: before.into(),
        }],
    };
    let result = (|| -> Result<EditPlan> {
        let actions = list(QueryRequest {
            query: query.clone(),
            diagnostics: vec![],
        })?;
        let action = actions
            .into_iter()
            .find(|action| {
                action.kind.as_deref() == Some("source.organizeImports")
                    && action.disabled_reason.is_none()
            })
            .ok_or_else(|| anyhow!("gopls returned no reviewable Organize Imports action"))?;
        preview(PreviewRequest {
            query: QueryRequest {
                query,
                diagnostics: vec![],
            },
            action,
        })
    })();
    assert_eq!(std::fs::read_to_string(root.join("main.go")).unwrap(), disk);
    {
        lsp_manager::get_lsp_session().lock().unwrap().take();
    }
    std::fs::remove_file(root.join("main.go")).unwrap();
    std::fs::remove_file(root.join("go.mod")).unwrap();
    std::fs::remove_dir(root).unwrap();
    let plan = result.unwrap();
    assert_eq!(plan.files.len(), 1);
    assert_eq!(plan.files[0].before, before);
    assert!(plan.files[0].after.contains("\"fmt\""));
    assert!(!plan.files[0].after.contains("\"os\""));
}

#[test]
fn selection_is_revalidated_against_actual_server_actions() {
    let actual = json!({"title": "Fix", "kind": "quickfix", "edit": {"changes": {}}});
    let mut selected = descriptions(&json!([actual])).unwrap().remove(0);
    selected.preferred = false;
    assert_eq!(select_action(&json!([actual]), &selected).unwrap(), actual);
    assert!(select_action(&json!([]), &selected).is_err());
    assert!(select_action(&json!([actual, actual]), &selected).is_err());
    assert!(select_action(
        &json!([{"title": "Fix", "kind": "quickfix", "disabled": {"reason": "Not available"}}]),
        &selected
    )
    .is_err());
    selected.title = "Invented fix".into();
    assert!(select_action(&json!([actual]), &selected).is_err());
}
#[test]
fn diagnostic_context_preserves_utf16_coordinates_and_rejects_invalid_ranges() {
    let mut request = QueryRequest {
        query: language::Query {
            request_id: None,
            workspace_root: "unused".into(),
            relative_path: "main.go".into(),
            line: 1,
            column: 1,
            kind: language::QueryKind::Hover,
            buffers: vec![language::Buffer {
                path: "main.go".into(),
                content: "x😀y\n".into(),
            }],
        },
        diagnostics: vec![crate::ui_bridge::types::EditorDiagnosticDto {
            severity: crate::ui_bridge::types::DiagnosticSeverityDto::Warning,
            message: "actual diagnostic".into(),
            source: Some("gopls".into()),
            code: None,
            range: crate::ui_bridge::types::DiagnosticRangeDto {
                start_line: 1,
                start_column: 2,
                end_line: 1,
                end_column: 4,
            },
        }],
    };
    assert_eq!(
        diagnostic_context(&request).unwrap()[0]["range"]["end"]["character"],
        3
    );
    request.diagnostics[0].range.end_column = 3;
    assert!(diagnostic_context(&request).is_err());
    request.diagnostics[0].range.end_column = 0;
    assert!(diagnostic_context(&request).is_err());
}

#[test]
fn lazy_resolution_is_limited_to_editor_only_fixes() {
    assert!(reviewable_data(
        &json!({"data": {"command": "gopls.apply_fix", "arguments": [{"ResolveEdits": true}]}})
    ));
    for data in [
        json!({"command": "gopls.apply_fix", "arguments": [{"ResolveEdits": false}]}),
        json!({"command": "gopls.run_tests", "arguments": []}),
        json!({"opaque": true}),
    ] {
        assert!(!reviewable_data(&json!({"data": data})));
        assert!(
            descriptions(&json!([{"title": "Unsupported lazy action", "data": data}])).unwrap()[0]
                .disabled_reason
                .is_some()
        );
    }
}

#[test]
#[ignore = "requires installed Go and gopls; run explicitly with --include-ignored"]
fn real_gopls_lazy_fill_struct_returns_an_edit_without_saving() {
    let root = std::env::temp_dir().join(format!("goide-lazy-action-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    std::fs::write(root.join("go.mod"), "module example.com/lazy\n\ngo 1.22\n").unwrap();
    let before = "package main\ntype Thing struct { Value int }\nfunc main() { _ = Thing{} }\n";
    std::fs::write(root.join("main.go"), before).unwrap();
    let query = QueryRequest {
        query: language::Query {
            request_id: None,
            workspace_root: root.to_string_lossy().into(),
            relative_path: "main.go".into(),
            line: 3,
            column: 23,
            kind: language::QueryKind::Hover,
            buffers: vec![language::Buffer {
                path: "main.go".into(),
                content: before.into(),
            }],
        },
        diagnostics: vec![],
    };
    let result = (|| -> Result<EditPlan> {
        let actions = list(query.clone())?;
        let action = actions
            .iter()
            .find(|action| {
                action.title.to_lowercase().contains("fill") && action.disabled_reason.is_none()
            })
            .cloned()
            .ok_or_else(|| anyhow!("No reviewable fill struct action: {actions:?}"))?;
        preview(PreviewRequest { query, action })
    })();
    assert_eq!(
        std::fs::read_to_string(root.join("main.go")).unwrap(),
        before
    );
    {
        lsp_manager::get_lsp_session().lock().unwrap().take();
    }
    std::fs::remove_file(root.join("main.go")).unwrap();
    std::fs::remove_file(root.join("go.mod")).unwrap();
    std::fs::remove_dir(root).unwrap();
    let plan = result.unwrap();
    assert_eq!(plan.files.len(), 1);
    assert!(plan.files[0].after.contains("Value:"));
}
