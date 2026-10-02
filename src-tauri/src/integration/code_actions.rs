//! Only server-returned edits may enter the reviewed, editor-only apply path.
use super::{
    fs,
    gopls::normalize_platform_pathbuf,
    language,
    language_edits::{self, EditPlan, FileEdit},
    lsp_manager,
    workspace_edits::group_edits,
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
pub struct Action {
    pub title: String,
    pub kind: Option<String>,
    pub preferred: bool,
    pub disabled_reason: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryRequest {
    pub query: language::Query,
    pub diagnostics: Vec<crate::ui_bridge::types::EditorDiagnosticDto>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRequest {
    pub query: QueryRequest,
    pub action: Action,
}
fn diagnostic_context(request: &QueryRequest) -> Result<Vec<Value>> {
    let before = request
        .query
        .buffers
        .iter()
        .find(|buffer| buffer.path == request.query.relative_path)
        .map(|buffer| buffer.content.as_str());
    if request.diagnostics.len() > 1000 {
        return Err(anyhow!("Code action diagnostics exceed 1000 entries."));
    }
    let mut total = 0;
    request.diagnostics.iter().map(|diagnostic| {
        total += diagnostic.message.len();
        if diagnostic.message.len() > 8192 || total > 256 * 1024 || diagnostic.source.as_ref().is_some_and(|source| source.len() > 256) || diagnostic.code.as_ref().is_some_and(|code| code.len() > 256) { return Err(anyhow!("Code action diagnostic context exceeds its text budget.")); }
        let range = &diagnostic.range;
        if [range.start_line, range.start_column, range.end_line, range.end_column].contains(&0) { return Err(anyhow!("Code action diagnostic coordinates must be positive.")); }
        let range = json!({"start": {"line": range.start_line - 1, "character": range.start_column - 1}, "end": {"line": range.end_line - 1, "character": range.end_column - 1}});
        if let Some(before) = before { language_edits::text_in_range(before, &range)?; }
        let severity = match diagnostic.severity { crate::ui_bridge::types::DiagnosticSeverityDto::Error => 1, crate::ui_bridge::types::DiagnosticSeverityDto::Warning => 2, crate::ui_bridge::types::DiagnosticSeverityDto::Info => 3 };
        let mut value = json!({"range": range, "message": diagnostic.message, "severity": severity});
        if let Some(source) = &diagnostic.source { value["source"] = json!(source); }
        if let Some(code) = &diagnostic.code { value["code"] = json!(code); }
        Ok(value)
    }).collect()
}
// gopls promises editor-only edits for ApplyFix with ResolveEdits=true.
// Other lazy commands need their own lifecycle/review integration.
fn reviewable_data(value: &Value) -> bool {
    let data = &value["data"];
    data["command"] == "gopls.apply_fix"
        && data["arguments"]
            .as_array()
            .is_some_and(|args| args.len() == 1 && args[0]["ResolveEdits"] == true)
}
fn descriptions(response: &Value) -> Result<Vec<Action>> {
    if response.is_null() {
        return Ok(Vec::new());
    }
    let values = response
        .as_array()
        .ok_or_else(|| anyhow!("gopls returned an invalid code action list."))?;
    if values.len() > 256 {
        return Err(anyhow!("Code actions exceed the 256 action limit."));
    }
    values.iter().map(|value| {
        let title = value["title"].as_str().filter(|text| !text.is_empty() && text.len() <= 4096)
            .ok_or_else(|| anyhow!("gopls returned an invalid action title."))?;
        let kind = value["kind"].as_str().map(str::to_string);
        if kind.as_ref().is_some_and(|kind| kind.len() > 256) { return Err(anyhow!("gopls returned an invalid action kind.")); }
        let mut disabled_reason = value["disabled"]["reason"].as_str().map(|reason| reason.chars().take(4096).collect());
        if disabled_reason.is_none() && !value["command"].is_null() {
            disabled_reason = Some("Command-based actions require a separate reviewed workflow and are not supported yet.".into());
        } else if disabled_reason.is_none() && value["edit"].is_null() && value.get("data").is_none() {
            disabled_reason = Some("gopls returned no reviewable edit or resolvable action.".into());
        }
        if disabled_reason.is_none() && value["edit"].is_null() && !reviewable_data(value) { disabled_reason = Some("This lazy action is not supported by the reviewed edit workflow yet.".into()); }
        Ok(Action { title: title.into(), kind, preferred: value["isPreferred"] == true, disabled_reason })
    }).collect()
}
fn request_actions(
    session: &mut lsp_manager::LspSession,
    target: &Path,
    request: &QueryRequest,
) -> Result<Value> {
    let query = &request.query;
    let point = json!({"line": query.line - 1, "character": query.column - 1});
    language::request_method(
        session,
        "textDocument/codeAction",
        json!({
            "textDocument": {"uri": lsp_manager::path_to_file_uri(target)?},
            "range": {"start": point, "end": point},
            "context": {"diagnostics": diagnostic_context(request)?, "triggerKind": 1}
        }),
    )
}
fn select_action(response: &Value, selected: &Action) -> Result<Value> {
    let descriptions = descriptions(response)?;
    let matches: Vec<_> = descriptions
        .iter()
        .enumerate()
        .filter(|(_, action)| action.title == selected.title && action.kind == selected.kind)
        .collect();
    if matches.len() != 1 {
        return Err(anyhow!(
            "The selected code action is unavailable or ambiguous. Request actions again."
        ));
    }
    let (index, description) = matches[0];
    if let Some(reason) = &description.disabled_reason {
        return Err(anyhow!("{reason}"));
    }
    Ok(response[index].clone())
}
fn selected_edit(
    session: &mut lsp_manager::LspSession,
    response: &Value,
    selected: &Action,
) -> Result<Value> {
    let mut value = select_action(response, selected)?;
    if value["edit"].is_null() && value.get("data").is_some() {
        value = language::request_method(session, "codeAction/resolve", value)?;
    }
    if value["title"].as_str() != Some(selected.title.as_str())
        || value["kind"].as_str() != selected.kind.as_deref()
    {
        return Err(anyhow!(
            "gopls resolved a different code action. Request actions again."
        ));
    }
    if let Some(reason) = value["disabled"]["reason"].as_str() {
        return Err(anyhow!("{reason}"));
    }
    if !value["command"].is_null() {
        return Err(anyhow!(
            "This action requires a command that cannot enter the reviewed edit path yet."
        ));
    }
    value
        .get("edit")
        .filter(|edit| !edit.is_null())
        .cloned()
        .ok_or_else(|| anyhow!("This action returned no reviewable workspace edit."))
}
pub fn list(request: QueryRequest) -> Result<Vec<Action>> {
    let captured = request.clone();
    language::with_documents(request.query, |_, session, target, _| {
        descriptions(&request_actions(session, target, &captured)?)
    })
}
pub fn preview(request: PreviewRequest) -> Result<EditPlan> {
    let context = request.query.clone();
    let query = context.query.clone();
    language::with_documents(request.query.query, |root, session, target, before| {
        let mut captured = BTreeMap::<PathBuf, (String, String)>::new();
        for buffer in &query.buffers {
            captured.insert(
                normalize_platform_pathbuf(root.join(&buffer.path).canonicalize()?),
                (buffer.path.replace('\\', "/"), buffer.content.clone()),
            );
        }
        captured
            .entry(target.to_path_buf())
            .or_insert((query.relative_path.replace('\\', "/"), before.into()));
        for _ in 0..3 {
            let response = request_actions(session, target, &context)?;
            let edit = selected_edit(session, &response, &request.action)?;
            let groups = group_edits(root, &edit)?;
            let mut added = false;
            for group in &groups {
                if !captured.contains_key(&group.path) {
                    let path = group
                        .path
                        .strip_prefix(root)?
                        .to_string_lossy()
                        .replace('\\', "/");
                    let source = fs::read_file(&root.to_string_lossy(), &path)?;
                    captured.insert(group.path.clone(), (path, source));
                    added = true;
                }
            }
            if captured.len() > 100
                || captured
                    .values()
                    .map(|(_, source)| source.len())
                    .sum::<usize>()
                    > 4 * 1024 * 1024
            {
                return Err(anyhow!(
                    "Code action exceeds the 100 document / 4 MiB source budget."
                ));
            }
            if added {
                // Re-query against captured immutable overlays before trusting ranges.
                language::synchronize_documents(
                    session,
                    &captured
                        .iter()
                        .map(|(path, (_, source))| (path.clone(), source.clone()))
                        .collect::<Vec<_>>(),
                )?;
                continue;
            }
            let mut files = Vec::new();
            let mut bytes = 0;
            for group in groups {
                let (path, before) = &captured[&group.path];
                let info = fs::file_info(&root.to_string_lossy(), path)?;
                if info.read_only {
                    return Err(anyhow!("Code action affects a read-only document: {path}"));
                }
                let uri = lsp_manager::path_to_file_uri(&group.path)?;
                if group.version.is_some()
                    && group.version != session.open_file_versions.get(&uri).copied()
                {
                    return Err(anyhow!("Code action returned a stale document version."));
                }
                let after = language_edits::apply_text_edits(before, &Value::Array(group.edits))?;
                bytes += before.len() + after.len();
                if bytes > 8 * 1024 * 1024 {
                    return Err(anyhow!("Code action preview exceeds the 8 MiB budget."));
                }
                if after != *before {
                    files.push(FileEdit {
                        path: path.clone(),
                        before: before.clone(),
                        after,
                        read_only: false,
                    });
                }
            }
            return Ok(EditPlan { files });
        }
        Err(anyhow!(
            "Code action keeps discovering additional files. Request a new preview."
        ))
    })
}
#[cfg(test)]
mod tests;
