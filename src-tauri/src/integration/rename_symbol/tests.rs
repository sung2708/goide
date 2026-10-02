use super::*;

struct Workspace(PathBuf);
impl Workspace {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "goide-rename # tiếng Việt {}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir(&root).unwrap();
        std::fs::write(
            root.join("go.mod"),
            "module example.com/rename\n\ngo 1.22\n",
        )
        .unwrap();
        std::fs::write(root.join("main.go"), "package main\nfunc main() {}\n").unwrap();
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
        for file in ["main.go", "helper.go", "go.mod"] {
            let _ = std::fs::remove_file(self.0.join(file));
        }
        let _ = std::fs::remove_dir(&self.0);
    }
}

#[test]
fn rename_names_and_workspace_edit_boundaries_are_validated_before_review() {
    for name in ["Renamed", "Δοκιμή", "_value2"] {
        assert!(valid_name(name));
    }
    for name in ["", "_", "func", "1value", "bad name", "name()", "😀"] {
        assert!(!valid_name(name));
    }
    let workspace = Workspace::new();
    let outside = Workspace::new();
    let uri = lsp_manager::path_to_file_uri(&workspace.0.join("main.go")).unwrap();
    let external = lsp_manager::path_to_file_uri(&outside.0.join("main.go")).unwrap();
    assert!(group_edits(
        &workspace.0,
        &json!({"documentChanges": [{"kind": "rename", "oldUri": uri, "newUri": external}]})
    )
    .is_err());
    assert!(group_edits(&workspace.0, &json!({"changes": {external: []}})).is_err());
    assert!(group_edits(
        &workspace.0,
        &json!({"documentChanges": [{"textDocument": {"uri": uri, "version": "bad"}, "edits": []}]})
    )
    .is_err());
}

#[test]
#[ignore = "requires installed Go and gopls; run explicitly with --include-ignored"]
fn real_gopls_rename_captures_closed_files_and_keeps_unsaved_source_and_disk_independent() {
    let workspace = Workspace::new();
    let before = "package main\nfunc main() { println(Greeting) }\n";
    let plan = preview(RenameRequest {
        query: language::Query {
            workspace_root: workspace.0.to_string_lossy().to_string(),
            relative_path: "main.go".into(),
            line: 2,
            column: 24,
            kind: language::QueryKind::References,
            buffers: vec![language::Buffer {
                path: "main.go".into(),
                content: before.into(),
            }],
        },
        new_name: "RenamedGreeting".into(),
    })
    .unwrap();
    assert_eq!(plan.rename.old_name, "Greeting");
    assert_eq!(plan.rename.new_name, "RenamedGreeting");
    assert_eq!(plan.files.len(), 2);
    let main = plan
        .files
        .iter()
        .find(|file| file.path == "main.go")
        .unwrap();
    let helper = plan
        .files
        .iter()
        .find(|file| file.path == "helper.go")
        .unwrap();
    assert_eq!(main.before, before);
    assert!(main.after.contains("println(RenamedGreeting)"));
    assert!(helper.before.contains("const Greeting"));
    assert!(helper.after.contains("const RenamedGreeting"));
    assert_eq!(
        std::fs::read_to_string(workspace.0.join("main.go")).unwrap(),
        "package main\nfunc main() {}\n"
    );
    assert!(std::fs::read_to_string(workspace.0.join("helper.go"))
        .unwrap()
        .contains("const Greeting"));
}
