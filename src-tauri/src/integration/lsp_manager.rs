use crate::integration::command::std_command;
use crate::integration::owned_sync_process::OwnedSyncChild;
use anyhow::{anyhow, Context, Result};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::Duration;

pub struct LspSession {
    pub _child: OwnedSyncChild,
    pub stdin: ChildStdin,
    pub rx: mpsc::Receiver<Value>,
    pub workspace_root: PathBuf,
    pub open_files: HashSet<String>,
    pub open_file_versions: HashMap<String, i64>,
    pub next_id: i64,
    reader_task: Option<std::thread::JoinHandle<()>>,
}

impl LspSession {
    pub fn stop(&mut self) -> Result<()> {
        // Unblock a reader waiting to send into the bounded message queue.
        let (_, replacement) = mpsc::channel();
        drop(std::mem::replace(&mut self.rx, replacement));
        self._child
            .stop()
            .context("Unable to terminate gopls process tree")?;
        if let Some(reader) = self.reader_task.take() {
            reader
                .join()
                .map_err(|_| anyhow!("The gopls reader thread failed during cleanup"))?;
        }
        Ok(())
    }
}

impl Drop for LspSession {
    fn drop(&mut self) {
        if let Err(error) = self.stop() {
            eprintln!("Unable to stop gopls: {error:#}");
        }
    }
}

static LSP_SESSION: OnceLock<Arc<Mutex<Option<LspSession>>>> = OnceLock::new();
static LSP_SHUTDOWN: AtomicBool = AtomicBool::new(false);

pub fn is_shutting_down() -> bool {
    LSP_SHUTDOWN.load(Ordering::Acquire)
}

pub fn shutdown_lsp_session() -> Result<()> {
    LSP_SHUTDOWN.store(true, Ordering::Release);
    let session = get_lsp_session();
    let mut guard = session
        .lock()
        .map_err(|_| anyhow!("LSP session lock poisoned"))?;
    if let Some(session) = guard.as_mut() {
        session.stop()?;
    }
    guard.take();
    Ok(())
}

pub fn get_lsp_session() -> Arc<Mutex<Option<LspSession>>> {
    LSP_SESSION
        .get_or_init(|| Arc::new(Mutex::new(None)))
        .clone()
}

pub fn start_new_lsp_session<'a>(
    workspace_root: &Path,
    guard: &'a mut Option<LspSession>,
) -> Result<&'a mut LspSession> {
    if is_shutting_down() {
        return Err(anyhow!("language server is shutting down"));
    }
    let mut command = std_command("gopls");
    let mut child = OwnedSyncChild::spawn(
        command
            .arg("serve")
            .current_dir(workspace_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null()),
    )
    .context("failed to start gopls language server")?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| anyhow!("gopls stdin unavailable"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow!("gopls stdout unavailable"))?;

    let (tx, rx) = mpsc::sync_channel::<Value>(128);
    let reader_task = std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        while let Ok(message) = read_lsp_message_sync(&mut reader) {
            if tx.send(message).is_err() {
                break;
            }
        }
    });

    let mut new_session = LspSession {
        _child: child,
        stdin,
        rx,
        workspace_root: workspace_root.to_path_buf(),
        open_files: HashSet::new(),
        open_file_versions: HashMap::new(),
        next_id: 1,
        reader_task: Some(reader_task),
    };

    let root_uri = path_to_file_uri(workspace_root)?;
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
                    "signatureHelp": { "signatureInformation": {
                        "documentationFormat": ["plaintext", "markdown"],
                        "parameterInformation": { "labelOffsetSupport": true },
                        "activeParameterSupport": true
                    } },
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

pub fn path_to_file_uri(path: &Path) -> Result<String> {
    tauri::Url::from_file_path(path)
        .map(|uri| uri.to_string())
        .map_err(|_| anyhow!("cannot encode file URI for {}", path.display()))
}

fn read_lsp_message_sync<R: BufRead>(reader: &mut R) -> Result<Value> {
    let mut content_length = None;
    let mut header_remaining = 16 * 1024;
    loop {
        let mut line = String::new();
        let count = (&mut *reader)
            .take(header_remaining as u64)
            .read_line(&mut line)?;
        if count == 0 {
            return Err(anyhow!("LSP connection closed inside header"));
        }
        header_remaining -= count;
        if !line.ends_with('\n') || header_remaining == 0 {
            return Err(anyhow!("LSP header exceeds the 16 KiB limit"));
        }
        if line.trim().is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            if name.eq_ignore_ascii_case("Content-Length") {
                if content_length.is_some() {
                    return Err(anyhow!("duplicate LSP Content-Length header"));
                }
                content_length = Some(value.trim().parse::<usize>()?);
            }
        }
    }
    let content_length = content_length.ok_or_else(|| anyhow!("missing Content-Length header"))?;
    if content_length == 0 {
        return Err(anyhow!("missing Content-Length header"));
    }
    if content_length > 16 * 1024 * 1024 {
        return Err(anyhow!("LSP message exceeds the 16 MiB limit"));
    }

    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body)?;
    let message = serde_json::from_slice(&body)?;
    Ok(message)
}

pub fn write_lsp_request_sync<W: Write>(
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
    if body.len() > 16 * 1024 * 1024 {
        return Err(anyhow!("LSP request exceeds the 16 MiB limit"));
    }
    write!(writer, "Content-Length: {}\r\n\r\n{}", body.len(), body)?;
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
    if body.len() > 16 * 1024 * 1024 {
        return Err(anyhow!("LSP notification exceeds the 16 MiB limit"));
    }
    write!(writer, "Content-Length: {}\r\n\r\n{}", body.len(), body)?;
    writer.flush()?;
    Ok(())
}

pub fn wait_lsp_response_sync(rx: &mpsc::Receiver<Value>, id: i64) -> Result<Value> {
    wait_lsp_response_until_sync(rx, id, std::time::Instant::now() + Duration::from_secs(15))
}

pub fn wait_lsp_response_until_sync(
    rx: &mpsc::Receiver<Value>,
    id: i64,
    deadline: std::time::Instant,
) -> Result<Value> {
    while std::time::Instant::now() < deadline {
        super::language_requests::check()?;
        if is_shutting_down() {
            return Err(anyhow!("language server is shutting down"));
        }
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(message)
                if message.get("method").is_none()
                    && message.get("id").and_then(|v| v.as_i64()) == Some(id) =>
            {
                return Ok(message)
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err(anyhow!("language server connection closed"))
            }
            _ => {}
        }
    }
    super::language_requests::check()?;
    Err(anyhow!("timeout waiting for LSP response for id {}", id))
}

pub fn ensure_lsp_response_success_sync(response: Value) -> Result<()> {
    if let Some(error) = response.get("error") {
        return Err(anyhow!("LSP error: {}", error));
    }
    Ok(())
}

pub fn lsp_error_message_sync(response: &Value) -> Option<&str> {
    response
        .get("error")
        .and_then(|e| e.get("message"))
        .and_then(|m| m.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn file_uris_round_trip_reserved_and_unicode_characters() {
        let path = std::env::temp_dir().join("goide folder #?% tiếng Việt.go");
        let uri = path_to_file_uri(&path).unwrap();
        assert!(!uri.contains(' '));
        assert!(uri.contains("%23"));
        assert!(uri.contains("%3F"));
        assert!(uri.contains("%25"));
        assert_eq!(
            tauri::Url::parse(&uri).unwrap().to_file_path().unwrap(),
            path
        );
        assert!(path_to_file_uri(Path::new("relative.go")).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn file_uris_support_windows_canonical_and_unc_paths() {
        assert_eq!(
            path_to_file_uri(Path::new(r"\\?\D:\workspace\main.go")).unwrap(),
            "file:///D:/workspace/main.go"
        );
        assert_eq!(
            path_to_file_uri(Path::new(r"\\?\UNC\server\share\main.go")).unwrap(),
            "file://server/share/main.go"
        );
    }

    #[test]
    fn closed_language_server_fails_without_waiting_for_timeout() {
        let (sender, receiver) = mpsc::channel();
        drop(sender);
        let start = std::time::Instant::now();
        assert!(wait_lsp_response_sync(&receiver, 1)
            .unwrap_err()
            .to_string()
            .contains("connection closed"));
        assert!(start.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn a_server_request_is_not_mistaken_for_a_matching_response() {
        let (sender, receiver) = mpsc::channel();
        sender
            .send(json!({"id": 1, "method": "server/request"}))
            .unwrap();
        sender
            .send(json!({"id": 1, "result": "completion"}))
            .unwrap();
        assert_eq!(
            wait_lsp_response_sync(&receiver, 1).unwrap()["result"],
            "completion"
        );
    }

    #[test]
    fn oversized_language_server_frames_are_rejected() {
        let mut reader = std::io::Cursor::new(b"Content-Length: 16777217\r\n\r\n");
        assert!(read_lsp_message_sync(&mut reader)
            .unwrap_err()
            .to_string()
            .contains("16 MiB"));
    }

    #[test]
    fn language_server_headers_are_bounded_and_unambiguous() {
        let mut reader = std::io::Cursor::new(vec![b'a'; 32 * 1024]);
        assert!(read_lsp_message_sync(&mut reader)
            .unwrap_err()
            .to_string()
            .contains("16 KiB"));
        assert_eq!(reader.position(), 16 * 1024);
        let mut duplicate =
            std::io::Cursor::new(b"Content-Length: 2\r\ncontent-length: 2\r\n\r\n{}");
        assert!(read_lsp_message_sync(&mut duplicate)
            .unwrap_err()
            .to_string()
            .contains("duplicate"));
        let mut valid = std::io::Cursor::new(b"content-length:2\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n{}");
        assert_eq!(read_lsp_message_sync(&mut valid).unwrap(), json!({}));
        let mut truncated = std::io::Cursor::new(b"Content-Length: 20\r\n\r\n{}");
        assert!(read_lsp_message_sync(&mut truncated).is_err());
    }

    #[test]
    fn dropping_session_terminates_the_child_and_reader() {
        #[cfg(windows)]
        let mut command = std_command("powershell.exe");
        #[cfg(windows)]
        command.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Sleep -Seconds 30",
        ]);
        #[cfg(not(windows))]
        let mut command = std_command("sleep");
        #[cfg(not(windows))]
        command.arg("30");
        let mut child =
            OwnedSyncChild::spawn(command.stdin(Stdio::piped()).stdout(Stdio::piped())).unwrap();
        let stdin = child.stdin.take().unwrap();
        let mut stdout = child.stdout.take().unwrap();
        let (exit_sender, exit_receiver) = mpsc::channel();
        let reader = std::thread::spawn(move || {
            let result = stdout.read_to_end(&mut Vec::new());
            exit_sender.send(result).unwrap();
        });
        let (_, rx) = mpsc::channel();
        let session = LspSession {
            _child: child,
            stdin,
            rx,
            workspace_root: PathBuf::new(),
            open_files: HashSet::new(),
            open_file_versions: HashMap::new(),
            next_id: 1,
            reader_task: Some(reader),
        };
        drop(session);
        assert_eq!(
            exit_receiver
                .recv_timeout(Duration::from_secs(2))
                .unwrap()
                .unwrap(),
            0
        );
    }
}
