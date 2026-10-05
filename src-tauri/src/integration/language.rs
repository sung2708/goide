//! Typed, workspace-scoped language queries using the owned persistent gopls session.
use super::{fs, gopls::normalize_platform_pathbuf, lsp_manager};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    path::{Component, Path},
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum QueryKind {
    Definition,
    References,
    Hover,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Buffer {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Query {
    #[serde(default)]
    pub request_id: Option<String>,
    pub workspace_root: String,
    pub relative_path: String,
    pub line: usize,
    pub column: usize,
    pub kind: QueryKind,
    pub buffers: Vec<Buffer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub path: String,
    pub line: usize,
    pub column: usize,
    pub end_line: usize,
    pub end_column: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub locations: Vec<Location>,
    pub text: Option<String>,
    pub outside_workspace: usize,
}

fn scoped_file(root: &Path, path: &str) -> Result<std::path::PathBuf> {
    if path.is_empty()
        || !path.ends_with(".go")
        || Path::new(path).components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(anyhow!(
            "Language queries require a relative Go file inside the workspace."
        ));
    }
    let target = normalize_platform_pathbuf(
        root.join(path)
            .canonicalize()
            .context("Language query file is unavailable")?,
    );
    if !target.starts_with(root) || !target.is_file() {
        return Err(anyhow!("Language query file is outside the workspace."));
    }
    Ok(target)
}

pub fn query(request: Query) -> Result<QueryResult> {
    let kind = request.kind.clone();
    let line = request.line;
    let column = request.column;
    with_documents(request, |root, session, target, _content| {
        let method = match kind {
            QueryKind::Definition => "textDocument/definition",
            QueryKind::References => "textDocument/references",
            QueryKind::Hover => "textDocument/hover",
        };
        let mut params = json!({"textDocument": {"uri": lsp_manager::path_to_file_uri(target)?}, "position": {"line": line - 1, "character": column - 1}});
        if matches!(kind, QueryKind::References) {
            params["context"] = json!({"includeDeclaration": true});
        }
        let result = request_method(session, method, params)?;
        parse_result(root, &kind, &result)
    })
}

pub fn with_documents<T>(
    request: Query,
    action: impl FnOnce(&Path, &mut lsp_manager::LspSession, &Path, &str) -> Result<T>,
) -> Result<T> {
    if request.buffers.len() > 100
        || request
            .buffers
            .iter()
            .map(|buffer| buffer.content.len())
            .sum::<usize>()
            > 4 * 1024 * 1024
    {
        return Err(anyhow!(
            "Language query buffers exceed the 100 document / 4 MiB budget."
        ));
    }
    let root = normalize_platform_pathbuf(Path::new(&request.workspace_root).canonicalize()?);
    let _request = super::language_requests::begin(&root, request.request_id.as_deref())?;
    super::language_requests::check()?;
    let target = scoped_file(&root, &request.relative_path)?;
    let mut buffers = Vec::new();
    let mut paths = HashSet::new();
    for buffer in &request.buffers {
        super::language_requests::check()?;
        let file = scoped_file(&root, &buffer.path)?;
        if buffer.content.contains('\0') || !paths.insert(file.clone()) {
            return Err(anyhow!("Invalid or duplicate language query buffer."));
        }
        buffers.push((file, buffer.content.clone()));
    }
    if !paths.contains(&target) {
        buffers.push((
            target.clone(),
            fs::read_file(&request.workspace_root, &request.relative_path)?,
        ));
    }
    if buffers.len() > 100
        || buffers
            .iter()
            .map(|(_, content)| content.len())
            .sum::<usize>()
            > 4 * 1024 * 1024
    {
        return Err(anyhow!(
            "Language query buffers exceed the 100 document / 4 MiB budget."
        ));
    }
    let content = &buffers.iter().find(|(path, _)| path == &target).unwrap().1;
    let line = request
        .line
        .checked_sub(1)
        .and_then(|line| content.split('\n').nth(line))
        .ok_or_else(|| anyhow!("Language query line is outside the document."))?;
    if request.column == 0
        || request.column - 1 > line.trim_end_matches('\r').encode_utf16().count()
    {
        return Err(anyhow!("Language query column is outside the document."));
    }
    let handle = lsp_manager::get_lsp_session();
    let mut guard = super::language_requests::lock(&handle)?;
    if guard
        .as_ref()
        .is_some_and(|session| session.workspace_root != root)
    {
        *guard = None;
    }
    if guard.is_none() {
        lsp_manager::start_new_lsp_session(&root, &mut guard)?;
    }
    let session = guard.as_mut().unwrap();
    let result = synchronize_documents(session, &buffers)
        .and_then(|()| action(&root, session, &target, content))
        .and_then(|data| {
            super::language_requests::check()?;
            Ok(data)
        });
    if result
        .as_ref()
        .is_err_and(|error| !super::language_requests::is_stopped(error))
    {
        *guard = None;
    }
    result
}

pub fn synchronize_documents(
    session: &mut lsp_manager::LspSession,
    buffers: &[(std::path::PathBuf, String)],
) -> Result<()> {
    let mut current = HashSet::new();
    for (path, content) in buffers {
        super::language_requests::check()?;
        let uri = lsp_manager::path_to_file_uri(path)?;
        current.insert(uri.clone());
        if session.open_file_contents.get(&uri) == Some(content) {
            continue;
        }
        let version = session.next_id;
        session.next_id += 1;
        session.open_file_versions.insert(uri.clone(), version);
        session
            .open_file_contents
            .insert(uri.clone(), content.clone());
        if session.open_files.insert(uri.clone()) {
            lsp_manager::write_lsp_notification_sync(
                &mut session.stdin,
                "textDocument/didOpen",
                json!({"textDocument": {"uri": uri, "languageId": "go", "version": version, "text": content}}),
            )?;
        } else {
            lsp_manager::write_lsp_notification_sync(
                &mut session.stdin,
                "textDocument/didChange",
                json!({"textDocument": {"uri": uri, "version": version}, "contentChanges": [{"text": content}]}),
            )?;
        }
    }
    for uri in session.open_files.difference(&current) {
        lsp_manager::write_lsp_notification_sync(
            &mut session.stdin,
            "textDocument/didClose",
            json!({"textDocument": {"uri": uri}}),
        )?;
    }
    session
        .open_file_versions
        .retain(|uri, _| current.contains(uri));
    session
        .open_file_contents
        .retain(|uri, _| current.contains(uri));
    session.open_files = current;
    Ok(())
}

pub fn request_method(
    session: &mut lsp_manager::LspSession,
    method: &str,
    params: Value,
) -> Result<Value> {
    // Cold package loading can outlive ordinary completion requests. One shared
    // deadline bounds the entire query, including any "no views" retries.
    let deadline = super::language_requests::deadline(Instant::now() + Duration::from_secs(45));
    loop {
        super::language_requests::check()?;
        let id = session.next_id;
        session.next_id += 1;
        lsp_manager::write_lsp_request_sync(&mut session.stdin, id, method, params.clone())?;
        let response = match lsp_manager::wait_lsp_response_until_sync(&session.rx, id, deadline) {
            Ok(response) => response,
            Err(error) if super::language_requests::is_stopped(&error) => {
                lsp_manager::write_lsp_notification_sync(
                    &mut session.stdin,
                    "$/cancelRequest",
                    json!({"id": id}),
                )?;
                return Err(error);
            }
            Err(error) => return Err(error),
        };
        if lsp_manager::lsp_error_message_sync(&response) == Some("no views")
            && Instant::now() < deadline
        {
            std::thread::sleep(Duration::from_millis(50));
            continue;
        }
        lsp_manager::ensure_lsp_response_success_sync(response.clone())?;
        return Ok(response["result"].clone());
    }
}

fn hover_text(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    if let Some(items) = value.as_array() {
        return Some(
            items
                .iter()
                .filter_map(hover_text)
                .collect::<Vec<_>>()
                .join("\n\n"),
        );
    }
    value
        .get("value")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn parse_result(root: &Path, kind: &QueryKind, result: &Value) -> Result<QueryResult> {
    let mut parsed = QueryResult {
        locations: Vec::new(),
        text: None,
        outside_workspace: 0,
    };
    if matches!(kind, QueryKind::Hover) {
        parsed.text = hover_text(&result["contents"]);
        return Ok(parsed);
    }
    if result.is_null() {
        return Ok(parsed);
    }
    let locations = result
        .as_array()
        .cloned()
        .unwrap_or_else(|| vec![result.clone()]);
    if locations.len() > 5000 {
        return Err(anyhow!("Language server result exceeds 5000 locations."));
    }
    for location in locations {
        let uri = location
            .get("uri")
            .or_else(|| location.get("targetUri"))
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("Language server returned an invalid location URI."))?;
        let path = normalize_platform_pathbuf(
            tauri::Url::parse(uri)?
                .to_file_path()
                .map_err(|_| anyhow!("Language server location is not a file."))?
                .canonicalize()?,
        );
        let Ok(relative) = path.strip_prefix(root) else {
            parsed.outside_workspace += 1;
            continue;
        };
        let range = location
            .get("targetSelectionRange")
            .or_else(|| location.get("range"))
            .ok_or_else(|| anyhow!("Language server returned an invalid location range."))?;
        let position = |point: &str, axis: &str| -> Result<usize> {
            range[point][axis]
                .as_u64()
                .and_then(|value| usize::try_from(value).ok())
                .and_then(|value| value.checked_add(1))
                .ok_or_else(|| anyhow!("Language server returned an invalid position."))
        };
        parsed.locations.push(Location {
            path: relative.to_string_lossy().replace('\\', "/"),
            line: position("start", "line")?,
            column: position("start", "character")?,
            end_line: position("end", "line")?,
            end_column: position("end", "character")?,
        });
    }
    Ok(parsed)
}

#[cfg(test)]
mod tests;
