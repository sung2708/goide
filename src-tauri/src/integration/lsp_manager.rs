use anyhow::{anyhow, Context, Result};
use crate::integration::command::std_command;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Stdio};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::Duration;

pub struct LspSession {
    pub child: Child,
    pub stdin: ChildStdin,
    pub rx: mpsc::Receiver<Value>,
    pub workspace_root: PathBuf,
    pub open_files: HashSet<String>,
    pub next_id: i64,
}

static LSP_SESSION: OnceLock<Arc<Mutex<Option<LspSession>>>> = OnceLock::new();

pub fn get_lsp_session() -> Arc<Mutex<Option<LspSession>>> {
    LSP_SESSION.get_or_init(|| Arc::new(Mutex::new(None))).clone()
}

pub fn start_new_lsp_session<'a>(
    workspace_root: &Path,
    guard: &'a mut Option<LspSession>,
) -> Result<&'a mut LspSession> {
    let mut child = std_command("gopls")
        .arg("serve")
        .current_dir(workspace_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .context("failed to start gopls language server")?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| anyhow!("gopls stdin unavailable"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow!("gopls stdout unavailable"))?;
    
    let (tx, rx) = mpsc::channel::<Value>();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        while let Ok(message) = read_lsp_message_sync(&mut reader) {
            if tx.send(message).is_err() {
                break;
            }
        }
    });

    let mut new_session = LspSession {
        child,
        stdin,
        rx,
        workspace_root: workspace_root.to_path_buf(),
        open_files: HashSet::new(),
        next_id: 1,
    };

    let root_uri = path_to_file_uri_sync(workspace_root);
    write_lsp_request_sync(
        &mut new_session.stdin,
        0,
        "initialize",
        json!({
            "processId": null,
            "rootPath": workspace_root.to_string_lossy().to_string(),
            "rootUri": root_uri,
            "workspaceFolders": [
                {
                    "uri": root_uri,
                    "name": workspace_root
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("workspace")
                }
            ],
            "capabilities": {
                "workspace": { "workspaceFolders": true },
                "textDocument": {
                    "completion": {
                        "completionItem": {
                            "documentationFormat": ["markdown", "plaintext"],
                            "labelDetailsSupport": true,
                            "snippetSupport": false
                        }
                    }
                }
            }
        }),
    )?;
    
    ensure_lsp_response_success_sync(wait_lsp_response_sync(&new_session.rx, 0)?)?;
    write_lsp_notification_sync(&mut new_session.stdin, "initialized", json!({}))?;
    
    write_lsp_notification_sync(
        &mut new_session.stdin,
        "workspace/didChangeConfiguration",
        json!({
            "settings": {
                "gopls": {
                    "completeFunctionCalls": true,
                    "hoverKind": "SynopsisDocumentation",
                    "matcher": "Fuzzy",
                    "symbolScope": "all",
                    "usePlaceholders": true
                }
            }
        }),
    )?;

    new_session.next_id = 1;
    *guard = Some(new_session);
    Ok(guard.as_mut().unwrap())
}

// Helpers copied from gopls.rs or referenced
fn path_to_file_uri_sync(path: &Path) -> String {
    let s = path.to_string_lossy().replace("\\", "/");
    if s.starts_with('/') {
        format!("file://{}", s)
    } else {
        format!("file:///{}", s)
    }
}

fn read_lsp_message_sync<R: BufRead>(reader: &mut R) -> Result<Value> {
    let mut content_length = 0;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line)?;
        if line.trim().is_empty() {
            break;
        }
        if let Some(len) = line.strip_prefix("Content-Length: ") {
            content_length = len.trim().parse::<usize>()?;
        }
    }

    if content_length == 0 {
        return Err(anyhow!("missing Content-Length header"));
    }

    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body)?;
    let message = serde_json::from_slice(&body)?;
    Ok(message)
}

fn write_lsp_request_sync<W: Write>(
    writer: &mut W,
    id: i64,
    method: &str,
    params: Value,
) -> Result<()> {
    let message = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    });
    let body = serde_json::to_string(&message)?;
    write!(
        writer,
        "Content-Length: {}\r\n\r\n{}",
        body.len(),
        body
    )?;
    writer.flush()?;
    Ok(())
}

pub fn write_lsp_notification_sync<W: Write>(
    writer: &mut W,
    method: &str,
    params: Value,
) -> Result<()> {
    let message = json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
    });
    let body = serde_json::to_string(&message)?;
    write!(
        writer,
        "Content-Length: {}\r\n\r\n{}",
        body.len(),
        body
    )?;
    writer.flush()?;
    Ok(())
}

pub fn wait_lsp_response_sync(rx: &mpsc::Receiver<Value>, id: i64) -> Result<Value> {
    let timeout = Duration::from_secs(15);
    let start = std::time::Instant::now();
    while start.elapsed() < timeout {
        if let Ok(message) = rx.recv_timeout(Duration::from_millis(100)) {
            if message.get("id").and_then(|v| v.as_i64()) == Some(id) {
                return Ok(message);
            }
        }
    }
    Err(anyhow!("timeout waiting for LSP response for id {}", id))
}

pub fn ensure_lsp_response_success_sync(response: Value) -> Result<()> {
    if let Some(error) = response.get("error") {
        return Err(anyhow!("LSP error: {}", error));
    }
    Ok(())
}

pub fn lsp_error_message_sync(response: &Value) -> Option<&str> {
    response.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str())
}
