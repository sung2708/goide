//! Organize Imports uses actual gopls code actions and the reviewed edit path.
use super::{
    fs,
    gopls::normalize_platform_pathbuf,
    language,
    language_edits::{self, EditPlan, FileEdit, FormatRequest},
    lsp_manager,
};
use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use std::path::Path;

pub fn organize(request: FormatRequest) -> Result<EditPlan> {
    let path = request.relative_path.clone();
    let query = language::Query {
        request_id: request.request_id,
        workspace_root: request.workspace_root,
        relative_path: request.relative_path,
        line: 1,
        column: 1,
        kind: language::QueryKind::Hover,
        buffers: request.buffers,
    };
    language::with_documents(query, |root, session, target, before| {
        let info = fs::file_info(&root.to_string_lossy(), &path)?;
        if info.read_only {
            return Err(anyhow!("Cannot organize imports in a read-only file."));
        }
        let response = language::request_method(
            session,
            "textDocument/codeAction",
            json!({ "textDocument": { "uri": lsp_manager::path_to_file_uri(target)? }, "range": {"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 0}}, "context": { "diagnostics": [], "only": ["source.organizeImports"], "triggerKind": 1 } }),
        )?;
        if response.is_null() {
            return Ok(EditPlan { files: Vec::new() });
        }
        let actions = response
            .as_array()
            .ok_or_else(|| anyhow!("Language server returned an invalid code action list."))?;
        let candidates: Vec<_> = actions
            .iter()
            .filter(|action| {
                action["kind"] == "source.organizeImports" && action["disabled"].is_null()
            })
            .collect();
        if candidates.is_empty() {
            if let Some(reason) = actions
                .iter()
                .filter(|action| action["kind"] == "source.organizeImports")
                .find_map(|action| action["disabled"]["reason"].as_str())
            {
                return Err(anyhow!("Organize Imports is unavailable: {reason}"));
            }
            return Ok(EditPlan { files: Vec::new() });
        }
        if candidates.len() != 1 {
            return Err(anyhow!(
                "Multiple Organize Imports actions require individual action selection."
            ));
        }
        let mut action = candidates[0].clone();
        if action.get("edit").is_none() && action.get("data").is_some() {
            action = language::request_method(session, "codeAction/resolve", action)?;
        }
        let edit = action.get("edit").ok_or_else(|| anyhow!("This Organize Imports action requires a command that is not supported by the reviewed edit path yet."))?;
        let uri = lsp_manager::path_to_file_uri(target)?;
        let after = apply_single_document_edit(
            root,
            target,
            session.open_file_versions.get(&uri).copied(),
            before,
            edit,
        )?;
        Ok(EditPlan {
            files: if after == before {
                Vec::new()
            } else {
                vec![FileEdit {
                    path: path.replace('\\', "/"),
                    before: before.to_string(),
                    after,
                    read_only: info.read_only,
                }]
            },
        })
    })
}

fn same_target(root: &Path, target: &Path, uri: &str) -> Result<()> {
    let parsed = tauri::Url::parse(uri)?;
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(anyhow!("Workspace edit contains an invalid file URI."));
    }
    let file = normalize_platform_pathbuf(
        parsed
            .to_file_path()
            .map_err(|_| anyhow!("Workspace edit URI is not a file."))?
            .canonicalize()?,
    );
    if !file.starts_with(root) || file != target {
        return Err(anyhow!(
            "Organize Imports returned edits outside the requested document."
        ));
    }
    Ok(())
}

fn apply_single_document_edit(
    root: &Path,
    target: &Path,
    version: Option<i64>,
    before: &str,
    edit: &Value,
) -> Result<String> {
    let mut edits = Vec::new();
    if let Some(changes) = edit.get("changes") {
        for (uri, values) in changes
            .as_object()
            .ok_or_else(|| anyhow!("Invalid workspace edit changes."))?
        {
            same_target(root, target, uri)?;
            edits.extend(
                values
                    .as_array()
                    .ok_or_else(|| anyhow!("Invalid workspace edit list."))?
                    .iter()
                    .cloned(),
            );
        }
    }
    if let Some(changes) = edit.get("documentChanges") {
        for document in changes
            .as_array()
            .ok_or_else(|| anyhow!("Invalid workspace document changes."))?
        {
            if document.get("kind").is_some() {
                return Err(anyhow!(
                    "Workspace resource operations require a separate reviewed workflow."
                ));
            }
            let uri = document["textDocument"]["uri"]
                .as_str()
                .ok_or_else(|| anyhow!("Invalid workspace edit URI."))?;
            same_target(root, target, uri)?;
            if !document["textDocument"]["version"].is_null() {
                let received = document["textDocument"]["version"]
                    .as_i64()
                    .ok_or_else(|| {
                        anyhow!("Language server returned an invalid document version.")
                    })?;
                if Some(received) != version {
                    return Err(anyhow!(
                        "Language server returned edits for a stale document version."
                    ));
                }
            }
            edits.extend(
                document["edits"]
                    .as_array()
                    .ok_or_else(|| anyhow!("Invalid workspace edit list."))?
                    .iter()
                    .cloned(),
            );
        }
    }
    if edit.get("changes").is_none() && edit.get("documentChanges").is_none() {
        return Err(anyhow!(
            "Language server returned an invalid workspace edit."
        ));
    }
    language_edits::apply_text_edits(before, &Value::Array(edits))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reviewed_workspace_edits_require_the_requested_file_and_current_version() {
        let root = std::env::temp_dir().join(format!("goide-import-edit-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("main.go"), "source\n").unwrap();
        std::fs::write(root.join("other.go"), "other\n").unwrap();
        let canonical = normalize_platform_pathbuf(root.canonicalize().unwrap());
        let target = normalize_platform_pathbuf(root.join("main.go").canonicalize().unwrap());
        let uri = lsp_manager::path_to_file_uri(&target).unwrap();
        let edit = json!({"range": {"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 0}}, "newText": "import "});
        let valid = json!({"documentChanges": [{"textDocument": {"uri": uri, "version": 23}, "edits": [edit]}]});
        assert_eq!(
            apply_single_document_edit(&canonical, &target, Some(23), "source\n", &valid).unwrap(),
            "import source\n"
        );
        assert!(
            apply_single_document_edit(&canonical, &target, Some(24), "source\n", &valid).is_err()
        );
        let other_uri = lsp_manager::path_to_file_uri(&root.join("other.go")).unwrap();
        assert!(apply_single_document_edit(
            &canonical,
            &target,
            Some(23),
            "source\n",
            &json!({"changes": {other_uri: [edit]}})
        )
        .is_err());
        assert!(apply_single_document_edit(
            &canonical,
            &target,
            Some(23),
            "source\n",
            &json!({"documentChanges": [{"kind": "delete", "uri": uri}]})
        )
        .is_err());
        assert_eq!(
            std::fs::read_to_string(root.join("main.go")).unwrap(),
            "source\n"
        );
        std::fs::remove_file(root.join("main.go")).unwrap();
        std::fs::remove_file(root.join("other.go")).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    #[ignore = "requires installed Go and gopls; run explicitly with --include-ignored"]
    fn real_gopls_organizes_unsaved_imports_without_writing_disk() {
        let root = std::env::temp_dir().join(format!(
            "goide-imports # tiếng Việt {}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir(&root).unwrap();
        std::fs::write(
            root.join("go.mod"),
            "module example.com/imports\n\ngo 1.22\n",
        )
        .unwrap();
        let disk = "package main\nfunc main() {}\n";
        std::fs::write(root.join("main.go"), disk).unwrap();
        let before = "package main\nimport \"os\"\nfunc main() { fmt.Println(\"hello\") }\n";
        let result = organize(FormatRequest {
            request_id: None,
            workspace_root: root.to_string_lossy().to_string(),
            relative_path: "main.go".into(),
            buffers: vec![language::Buffer {
                path: "main.go".into(),
                content: before.into(),
            }],
        });
        assert_eq!(std::fs::read_to_string(root.join("main.go")).unwrap(), disk);
        {
            let handle = lsp_manager::get_lsp_session();
            handle.lock().unwrap().take();
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
}
