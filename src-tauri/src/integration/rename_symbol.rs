//! Rename proposals synchronize captured source before accepting cross-file edits.
use super::{
    fs,
    gopls::normalize_platform_pathbuf,
    language,
    language_edits::{self, FileEdit},
    lsp_manager,
};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameRequest {
    pub query: language::Query,
    pub new_name: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameDescription {
    pub old_name: String,
    pub new_name: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamePlan {
    pub files: Vec<FileEdit>,
    pub rename: RenameDescription,
}
struct Captured {
    path: String,
    before: String,
}
struct FileEdits {
    path: PathBuf,
    version: Option<i64>,
    edits: Vec<Value>,
}

fn valid_name(name: &str) -> bool {
    let mut characters = name.chars();
    name != "_"
        && name.len() <= 256
        && characters
            .next()
            .is_some_and(|scalar| scalar == '_' || scalar.is_alphabetic())
        && characters.all(|scalar| scalar == '_' || scalar.is_alphanumeric())
        && ![
            "break",
            "default",
            "func",
            "interface",
            "select",
            "case",
            "defer",
            "go",
            "map",
            "struct",
            "chan",
            "else",
            "goto",
            "package",
            "switch",
            "const",
            "fallthrough",
            "if",
            "range",
            "type",
            "continue",
            "for",
            "import",
            "return",
            "var",
        ]
        .contains(&name)
}

fn file_from_uri(root: &Path, uri: &str) -> Result<PathBuf> {
    let uri = tauri::Url::parse(uri)?;
    if uri.query().is_some() || uri.fragment().is_some() {
        return Err(anyhow!("Rename returned an invalid file URI."));
    }
    let path = normalize_platform_pathbuf(
        uri.to_file_path()
            .map_err(|_| anyhow!("Rename location is not a file."))?
            .canonicalize()?,
    );
    if !path.starts_with(root)
        || !path.is_file()
        || path.extension().is_none_or(|extension| extension != "go")
    {
        return Err(anyhow!(
            "Rename would change files outside the workspace or unsupported file types."
        ));
    }
    Ok(path)
}

fn group_edits(root: &Path, edit: &Value) -> Result<Vec<FileEdits>> {
    if edit.is_null() {
        return Ok(Vec::new());
    }
    let mut files = BTreeMap::<PathBuf, FileEdits>::new();
    let mut insert = |uri: &str, version: Option<i64>, values: &Value| -> Result<()> {
        let path = file_from_uri(root, uri)?;
        let edits = values
            .as_array()
            .ok_or_else(|| anyhow!("Rename returned an invalid edit list."))?
            .clone();
        if files
            .insert(
                path.clone(),
                FileEdits {
                    path,
                    version,
                    edits,
                },
            )
            .is_some()
        {
            return Err(anyhow!("Rename returned duplicate document edits."));
        }
        if files.len() > 100 {
            return Err(anyhow!("Rename exceeds the 100 document review limit."));
        }
        Ok(())
    };
    if let Some(changes) = edit.get("changes") {
        for (uri, values) in changes
            .as_object()
            .ok_or_else(|| anyhow!("Rename returned invalid changes."))?
        {
            insert(uri, None, values)?;
        }
    }
    if let Some(changes) = edit.get("documentChanges") {
        for change in changes
            .as_array()
            .ok_or_else(|| anyhow!("Rename returned invalid document changes."))?
        {
            if change.get("kind").is_some() {
                return Err(anyhow!(
                    "This rename requires unsupported file/folder resource operations."
                ));
            }
            let uri = change["textDocument"]["uri"]
                .as_str()
                .ok_or_else(|| anyhow!("Rename returned an invalid document URI."))?;
            let version = if change["textDocument"]["version"].is_null() {
                None
            } else {
                Some(
                    change["textDocument"]["version"]
                        .as_i64()
                        .ok_or_else(|| anyhow!("Rename returned an invalid document version."))?,
                )
            };
            insert(uri, version, &change["edits"])?;
        }
    }
    if edit.get("changes").is_none() && edit.get("documentChanges").is_none() {
        return Err(anyhow!("Rename returned an invalid workspace edit."));
    }
    Ok(files.into_values().collect())
}

pub fn preview(request: RenameRequest) -> Result<RenamePlan> {
    if !valid_name(&request.new_name) {
        return Err(anyhow!("Enter a Go identifier of at most 256 bytes that is not a keyword or the blank identifier."));
    }
    let query = request.query.clone();
    language::with_documents(request.query, |root, session, target, before| {
        if fs::file_info(&root.to_string_lossy(), &query.relative_path)?.read_only {
            return Err(anyhow!("Cannot rename from a read-only document."));
        }
        let position = json!({ "line": query.line - 1, "character": query.column - 1 });
        let uri = lsp_manager::path_to_file_uri(target)?;
        let prepared = language::request_method(
            session,
            "textDocument/prepareRename",
            json!({"textDocument": {"uri": uri}, "position": position}),
        )?;
        if prepared.is_null() {
            return Err(anyhow!("The symbol at this position cannot be renamed."));
        }
        let range = prepared.get("range").unwrap_or(&prepared);
        let old_name = language_edits::text_in_range(before, range)?.to_string();
        if !valid_name(&old_name) {
            return Err(anyhow!(
                "This rename does not identify a supported Go symbol."
            ));
        }
        let params = json!({"textDocument": {"uri": uri}, "position": position, "newName": request.new_name});
        let mut captured = BTreeMap::<PathBuf, Captured>::new();
        for buffer in &query.buffers {
            let path = normalize_platform_pathbuf(root.join(&buffer.path).canonicalize()?);
            captured.insert(
                path,
                Captured {
                    path: buffer.path.replace('\\', "/"),
                    before: buffer.content.clone(),
                },
            );
        }
        captured
            .entry(target.to_path_buf())
            .or_insert_with(|| Captured {
                path: query.relative_path.replace('\\', "/"),
                before: before.to_string(),
            });
        let mut response =
            language::request_method(session, "textDocument/rename", params.clone())?;
        for _ in 0..3 {
            let groups = group_edits(root, &response)?;
            let mut added = false;
            for group in &groups {
                if !captured.contains_key(&group.path) {
                    let path = group
                        .path
                        .strip_prefix(root)?
                        .to_string_lossy()
                        .replace('\\', "/");
                    let content = fs::read_file(&root.to_string_lossy(), &path)?;
                    captured.insert(
                        group.path.clone(),
                        Captured {
                            path,
                            before: content,
                        },
                    );
                    added = true;
                }
            }
            if captured.len() > 100
                || captured
                    .values()
                    .map(|source| source.before.len())
                    .sum::<usize>()
                    > 4 * 1024 * 1024
            {
                return Err(anyhow!("Rename exceeds the 100 document / 4 MiB source budget. Close unrelated tabs or use a smaller workspace."));
            }
            if added {
                // Discard the first proposal. Closed files are captured, opened
                // as immutable overlays, then renamed again against that source.
                let buffers: Vec<_> = captured
                    .iter()
                    .map(|(path, source)| (path.clone(), source.before.clone()))
                    .collect();
                language::synchronize_documents(session, &buffers)?;
                response =
                    language::request_method(session, "textDocument/rename", params.clone())?;
                continue;
            }
            let mut files = Vec::new();
            let mut preview_bytes = 0;
            for group in groups {
                let source = &captured[&group.path];
                let info = fs::file_info(&root.to_string_lossy(), &source.path)?;
                if info.read_only {
                    return Err(anyhow!("Rename affects read-only file: {}", source.path));
                }
                let uri = lsp_manager::path_to_file_uri(&group.path)?;
                if group.version.is_some()
                    && group.version != session.open_file_versions.get(&uri).copied()
                {
                    return Err(anyhow!("Rename returned a stale document version."));
                }
                let values = Value::Array(group.edits);
                let edits = language_edits::parse_text_edits(&source.before, &values)?;
                if edits.iter().any(|edit| {
                    source.before[edit.from..edit.to] != old_name || edit.insert != request.new_name
                }) {
                    return Err(anyhow!("This rename contains broader edits that require a separate reviewed refactoring workflow."));
                }
                let after = language_edits::apply_validated_edits(&source.before, &edits)?;
                preview_bytes += source.before.len() + after.len();
                if preview_bytes > 8 * 1024 * 1024 {
                    return Err(anyhow!("Rename preview exceeds the 8 MiB budget."));
                }
                if after != source.before {
                    files.push(FileEdit {
                        path: source.path.clone(),
                        before: source.before.clone(),
                        after,
                        read_only: info.read_only,
                    });
                }
            }
            return Ok(RenamePlan {
                files,
                rename: RenameDescription {
                    old_name,
                    new_name: request.new_name.clone(),
                },
            });
        }
        Err(anyhow!(
            "Rename keeps discovering additional files. Request a new preview."
        ))
    })
}

#[cfg(test)]
mod tests;
