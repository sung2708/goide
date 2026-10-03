use crate::integration::command::tokio_command;
use crate::integration::process_job::OwnedChild;
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio::time::timeout;

const DAP_READY_TIMEOUT: Duration = Duration::from_secs(5);
const DAP_CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
mod execution;
pub mod inspection;
pub mod ownership;
#[cfg(test)]
mod session_tests;
use execution::Execution;
const SUPPORTED_WAIT_REASONS: &[&str] = &[
    "chan receive",
    "chan send",
    "semacquire",
    "select",
    "sleep",
    "io wait",
];

#[derive(Debug, Clone)]
pub enum LaunchMode {
    /// Debug a single file (legacy path; uses the file's parent directory as the package).
    #[cfg_attr(not(test), allow(dead_code))]
    Debug,
    /// Debug a test file.
    Test,
    /// Debug a Go package given by a package pattern such as `./cmd/app`.
    /// The `cwd` field is the absolute path to the workspace root so that the
    /// relative pattern is resolved correctly.
    Package { package: String, cwd: String },
}

pub fn serialize_dap_path(path: &Path) -> String {
    normalize_platform_path_for_dap(&path.to_string_lossy())
}

#[cfg(windows)]
fn normalize_platform_path_for_dap(path: &str) -> String {
    if let Some(stripped) = path.strip_prefix("\\\\?\\UNC\\") {
        return format!("\\\\{stripped}");
    }
    if let Some(stripped) = path.strip_prefix("\\\\?\\") {
        return stripped.to_string();
    }
    path.to_string()
}

#[cfg(not(windows))]
fn normalize_platform_path_for_dap(path: &str) -> String {
    path.to_string()
}

#[derive(Debug)]
pub struct DapProcess {
    pub owner: ownership::Owner,
    pub listen_addr: SocketAddr,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSignal {
    pub thread_id: i64,
    pub status: String,
    pub wait_reason: String,
    pub confidence: String,
    pub scope_key: String,
    pub scope_relative_path: String,
    pub scope_line: usize,
    pub scope_column: usize,
    pub relative_path: String,
    pub line: usize,
    pub column: usize,
    pub sample_relative_path: Option<String>,
    pub sample_line: Option<usize>,
    pub sample_column: Option<usize>,
    pub correlation_id: Option<String>,
    pub counterpart_relative_path: Option<String>,
    pub counterpart_line: Option<usize>,
    pub counterpart_column: Option<usize>,
    pub counterpart_confidence: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeSignalScope {
    pub scope_key: String,
    pub relative_path: String,
    pub line: usize,
    pub column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DapThread {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DapStackFrame {
    pub relative_path: String,
    pub line: usize,
    pub column: usize,
}

pub struct DapClient {
    reader: BufReader<tokio::net::tcp::OwnedReadHalf>,
    writer: tokio::net::tcp::OwnedWriteHalf,
    next_seq: i64,
    identity: uuid::Uuid,
    access: inspection::Access,
    execution: Execution,
    poisoned: bool,
    configuration_done_supported: bool,
}

impl DapClient {
    pub async fn connect(addr: SocketAddr) -> Result<Self> {
        if !is_local_loopback(addr) {
            return Err(anyhow!("DAP connection must stay on local loopback"));
        }

        let stream = timeout(DAP_CONNECT_TIMEOUT, TcpStream::connect(addr))
            .await
            .context("timed out connecting to DAP endpoint")?
            .with_context(|| format!("failed connecting to DAP endpoint at {addr}"))?;
        let (reader, writer) = stream.into_split();

        Ok(Self {
            reader: BufReader::new(reader),
            writer,
            next_seq: 1,
            identity: uuid::Uuid::new_v4(),
            access: inspection::Access::default(),
            execution: Execution::default(),
            poisoned: false,
            configuration_done_supported: false,
        })
    }

    pub async fn initialize(&mut self) -> Result<()> {
        let response = self
            .request(
                "initialize",
                json!({
                    "adapterID": "dlv",
                    "clientID": "goide",
                    "clientName": "goide",
                    "locale": "en-US",
                    "linesStartAt1": true,
                    "columnsStartAt1": true,
                    "pathFormat": "path",
                    "supportsVariableType": true,
                    "supportsVariablePaging": true,
                    "supportsRunInTerminalRequest": false
                }),
            )
            .await?;

        ensure_success("initialize", &response)?;
        self.configuration_done_supported =
            response["body"]["supportsConfigurationDoneRequest"].as_bool() == Some(true);
        Ok(())
    }
    pub async fn configuration_done(&mut self) -> Result<()> {
        if self.configuration_done_supported {
            let response = self.request("configurationDone", json!({})).await?;
            ensure_success("configurationDone", &response)?;
        }
        Ok(())
    }
    pub fn observed_pause(&self) -> Option<bool> {
        self.execution.paused()
    }
    pub fn observed_thread(&self) -> Option<i64> {
        self.execution.thread()
    }
    pub fn is_poisoned(&self) -> bool {
        self.poisoned
    }
    pub fn has_terminated(&self) -> bool {
        self.execution.terminated()
    }

    pub async fn launch(
        &mut self,
        mode: LaunchMode,
        workspace_root: &Path,
        target_file: &Path,
    ) -> Result<()> {
        // Package mode is self-contained: use the package pattern and cwd from the
        // variant directly, ignoring the legacy workspace_root / target_file params.
        if let LaunchMode::Package { package, cwd } = &mode {
            let response = self
                .request(
                    "launch",
                    json!({
                        "mode": "debug",
                        "program": package,
                        "cwd": normalize_platform_path_for_dap(cwd),
                        "stopOnEntry": false
                    }),
                )
                .await?;
            ensure_success("launch", &response)?;
            return Ok(());
        }

        let canonical_root = workspace_root.canonicalize().with_context(|| {
            format!(
                "workspace root does not exist: {}",
                workspace_root.display()
            )
        })?;
        let canonical_target = target_file
            .canonicalize()
            .with_context(|| format!("target file does not exist: {}", target_file.display()))?;
        if !canonical_target.starts_with(&canonical_root) {
            return Err(anyhow!(
                "target file must stay within workspace root: {}",
                canonical_target.display()
            ));
        }

        let mode_text = match mode {
            LaunchMode::Debug => "debug",
            LaunchMode::Test => "test",
            // Package is handled above; this arm is unreachable.
            LaunchMode::Package { .. } => unreachable!(),
        };
        let target_package_dir = canonical_target
            .parent()
            .ok_or_else(|| anyhow!("target file has no parent directory"))?;
        let launch_program = canonical_target.clone();

        let response = self
            .request(
                "launch",
                json!({
                    "mode": mode_text,
                    "program": serialize_dap_path(&launch_program),
                    "cwd": serialize_dap_path(target_package_dir),
                    "stopOnEntry": false
                }),
            )
            .await?;
        ensure_success("launch", &response)?;
        Ok(())
    }

    pub async fn threads(&mut self) -> Result<Vec<DapThread>> {
        let response = self.request("threads", json!({})).await?;
        ensure_success("threads", &response)?;
        let body = response
            .get("body")
            .and_then(Value::as_object)
            .ok_or_else(|| anyhow!("threads response missing body"))?;
        let threads = body
            .get("threads")
            .and_then(Value::as_array)
            .ok_or_else(|| anyhow!("threads response missing threads array"))?;

        let mut items = Vec::with_capacity(threads.len());
        for thread in threads.iter().take(512) {
            let id = thread
                .get("id")
                .and_then(Value::as_i64)
                .ok_or_else(|| anyhow!("thread item missing id"))?;
            let name = thread
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow!("thread item missing name"))?;
            items.push(DapThread {
                id,
                name: name.to_string(),
            });
        }

        Ok(items)
    }

    pub async fn continue_thread(&mut self, thread_id: i64) -> Result<()> {
        let response = self
            .request("continue", json!({ "threadId": thread_id }))
            .await?;
        ensure_success("continue", &response)?;
        Ok(())
    }

    pub async fn pause_thread(&mut self, thread_id: i64) -> Result<()> {
        let response = self
            .request("pause", json!({ "threadId": thread_id }))
            .await?;
        ensure_success("pause", &response)?;
        Ok(())
    }

    pub async fn next(&mut self, thread_id: i64) -> Result<()> {
        let response = self
            .request("next", json!({ "threadId": thread_id }))
            .await?;
        ensure_success("next", &response)?;
        Ok(())
    }

    pub async fn step_in(&mut self, thread_id: i64) -> Result<()> {
        let response = self
            .request("stepIn", json!({ "threadId": thread_id }))
            .await?;
        ensure_success("stepIn", &response)?;
        Ok(())
    }

    pub async fn step_out(&mut self, thread_id: i64) -> Result<()> {
        let response = self
            .request("stepOut", json!({ "threadId": thread_id }))
            .await?;
        ensure_success("stepOut", &response)?;
        Ok(())
    }

    pub async fn set_breakpoints(
        &mut self,
        absolute_file_path: &Path,
        lines: &[usize],
    ) -> Result<()> {
        let breakpoints = lines
            .iter()
            .map(|line| json!({ "line": line }))
            .collect::<Vec<_>>();
        let response = self
            .request(
                "setBreakpoints",
                json!({
                    "source": { "path": serialize_dap_path(absolute_file_path) },
                    "breakpoints": breakpoints
                }),
            )
            .await?;
        ensure_success("setBreakpoints", &response)?;
        Ok(())
    }

    pub async fn stack_trace(&mut self, thread_id: i64) -> Result<Option<DapStackFrame>> {
        let response = self
            .request(
                "stackTrace",
                json!({
                    "threadId": thread_id,
                    "startFrame": 0,
                    "levels": 1
                }),
            )
            .await?;
        ensure_success("stackTrace", &response)?;

        let body = response
            .get("body")
            .and_then(Value::as_object)
            .ok_or_else(|| anyhow!("stackTrace response missing body"))?;
        let frames = body
            .get("stackFrames")
            .and_then(Value::as_array)
            .ok_or_else(|| anyhow!("stackTrace response missing stackFrames array"))?;

        if frames.is_empty() {
            return Ok(None);
        }

        let frame = &frames[0];
        let line = frame
            .get("line")
            .and_then(Value::as_u64)
            .map(|l| l as usize)
            .unwrap_or(0);
        let column = frame
            .get("column")
            .and_then(Value::as_u64)
            .map(|c| c as usize)
            .unwrap_or(0);
        let source_path = frame
            .get("source")
            .and_then(|s| s.get("path"))
            .and_then(Value::as_str)
            .unwrap_or_default();

        if source_path.is_empty() || line == 0 {
            return Ok(None);
        }

        Ok(Some(DapStackFrame {
            relative_path: source_path.to_string(),
            line,
            column,
        }))
    }

    pub async fn disconnect(&mut self) -> Result<()> {
        let response = self
            .request("disconnect", json!({ "terminateDebuggee": true }))
            .await?;
        ensure_success("disconnect", &response)?;
        Ok(())
    }

    async fn request(&mut self, command: &str, arguments: Value) -> Result<Value> {
        if self.poisoned {
            return Err(anyhow!(
                "DAP transport is incomplete; stop and restart debugging."
            ));
        }
        let seq = self.next_seq;
        self.next_seq += 1;
        let mut output_messages: Vec<String> = Vec::new();

        let payload = json!({
            "seq": seq,
            "type": "request",
            "command": command,
            "arguments": arguments
        });
        let budget = if command == "launch" {
            Duration::from_secs(60)
        } else {
            Duration::from_secs(5)
        };
        let deadline = tokio::time::Instant::now() + budget;
        if let Err(error) = timeout(
            deadline.saturating_duration_since(tokio::time::Instant::now()),
            write_dap_message(&mut self.writer, &payload),
        )
        .await
        .context("DAP write deadline exceeded")
        .and_then(|result| result)
        {
            self.poisoned = true;
            return Err(error);
        }
        let revision = self.execution.revision();
        let mut messages = 0usize;
        let mut output_bytes = 0usize;

        loop {
            messages += 1;
            if messages > 1024 {
                self.poisoned = true;
                return Err(anyhow!("DAP message budget exceeded; restart debugging."));
            }
            let mut message = match read_response_until(
                &mut self.reader,
                deadline,
                command != "disconnect",
            )
            .await
            {
                Ok(message) => message,
                Err(error) => {
                    self.poisoned = true;
                    return Err(error);
                }
            };
            let message_type = message
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if message_type == "event" {
                self.execution.observe(&message);
                let event_name = message
                    .get("event")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if event_name == "output" {
                    if let Some(output) = message
                        .get("body")
                        .and_then(Value::as_object)
                        .and_then(|body| body.get("output"))
                        .and_then(Value::as_str)
                    {
                        let trimmed = output.trim();
                        if !trimmed.is_empty() {
                            output_bytes += trimmed.len();
                            if output_bytes > 64 * 1024 {
                                self.poisoned = true;
                                return Err(anyhow!(
                                    "DAP output exceeded the 64 KiB request budget."
                                ));
                            }
                            output_messages.push(trimmed.to_string());
                        }
                    }
                }
                continue;
            }
            if message_type != "response" {
                continue;
            }

            let request_seq = message
                .get("request_seq")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            if request_seq != seq {
                continue;
            }
            if message["command"].as_str() != Some(command) {
                self.poisoned = true;
                return Err(anyhow!("DAP response command does not match its request."));
            }
            if message["success"].as_bool() == Some(true) {
                self.execution.acknowledge(command, revision);
            }

            if !output_messages.is_empty() {
                if let Some(object) = message.as_object_mut() {
                    object.insert(
                        "__goide_output".to_string(),
                        Value::String(output_messages.join("\n")),
                    );
                }
            }
            return Ok(message);
        }
    }
}

// Keep one framing future pinned throughout shutdown polling. Restarting reads on
// every poll could lose a partially consumed header/body and corrupt the stream.
async fn read_response_until<R: AsyncBufRead + Unpin>(
    reader: &mut R,
    deadline: tokio::time::Instant,
    interrupt_on_shutdown: bool,
) -> Result<Value> {
    let read = read_dap_message(reader);
    tokio::pin!(read);
    loop {
        tokio::select! {
            result = &mut read => return result,
            _ = tokio::time::sleep_until(deadline) => return Err(anyhow!("DAP response deadline exceeded")),
            _ = tokio::time::sleep(Duration::from_millis(25)), if interrupt_on_shutdown => {
                if crate::integration::lifecycle::gate().is_closing() {
                    return Err(anyhow!("DAP request interrupted by app shutdown"));
                }
            }
        }
    }
}

pub async fn spawn_dlv_dap(workspace_root: &Path) -> Result<DapProcess> {
    spawn_dlv_dap_with("dlv", &["dap", "--listen=127.0.0.1:0"], workspace_root).await
}

pub fn thread_to_runtime_signal(
    thread: &DapThread,
    scope: &RuntimeSignalScope,
    real_location: Option<&DapStackFrame>,
) -> Option<RuntimeSignal> {
    let parsed = parse_thread_wait_state(&thread.name)?;
    Some(RuntimeSignal {
        thread_id: thread.id,
        status: parsed.status,
        wait_reason: parsed.wait_reason,
        confidence: "predicted".to_string(),
        scope_key: scope.scope_key.clone(),
        scope_relative_path: scope.relative_path.clone(),
        scope_line: scope.line,
        scope_column: scope.column,
        // Keep primary coordinates scoped so frontend scope filtering stays stable.
        relative_path: scope.relative_path.clone(),
        line: scope.line,
        column: scope.column,
        sample_relative_path: real_location.map(|loc| loc.relative_path.clone()),
        sample_line: real_location.map(|loc| loc.line),
        sample_column: real_location.map(|loc| loc.column),
        correlation_id: None,
        counterpart_relative_path: None,
        counterpart_line: None,
        counterpart_column: None,
        counterpart_confidence: None,
    })
}

pub fn parse_thread_wait_state(name: &str) -> Option<ParsedThreadState> {
    let start = name.find('[')?;
    let end = name[start + 1..].find(']')?;
    let status_raw = name[start + 1..start + 1 + end].trim();
    if status_raw.is_empty() {
        return None;
    }

    let lowered = status_raw.to_ascii_lowercase();
    let wait_reason = SUPPORTED_WAIT_REASONS
        .iter()
        .find(|reason| lowered.contains(**reason))
        .map(|reason| (*reason).to_string())?;

    Some(ParsedThreadState {
        status: status_raw.to_string(),
        wait_reason,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedThreadState {
    pub status: String,
    pub wait_reason: String,
}

fn ensure_success(command: &str, response: &Value) -> Result<()> {
    if response
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Ok(());
    }

    let top_level_message = response
        .get("message")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let body_message = response
        .get("body")
        .and_then(Value::as_object)
        .and_then(|body| body.get("error"))
        .and_then(|error| {
            error
                .get("format")
                .and_then(Value::as_str)
                .or_else(|| error.get("message").and_then(Value::as_str))
        })
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let output_message = response
        .get("__goide_output")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let message = match (top_level_message, body_message) {
        (Some(top), Some(body)) if top.eq_ignore_ascii_case(body) => top.to_string(),
        (Some(top), Some(body)) => format!("{top} ({body})"),
        (Some(top), None) => top.to_string(),
        (None, Some(body)) => body.to_string(),
        (None, None) => "unknown DAP failure".to_string(),
    };
    let combined = match output_message {
        Some(output) if !message.contains(output) => format!("{message}\n{output}"),
        _ => message,
    };
    Err(anyhow!("DAP command `{command}` failed: {combined}"))
}

pub(crate) async fn spawn_dlv_dap_with(
    command: &str,
    args: &[&str],
    workspace_root: &Path,
) -> Result<DapProcess> {
    let canonical_root = workspace_root.canonicalize().with_context(|| {
        format!(
            "workspace root does not exist: {}",
            workspace_root.display()
        )
    })?;

    ownership::retry_cleanup()
        .await
        .map_err(|error| anyhow!(error))?;

    let mut dap_command = tokio_command(command);
    #[cfg(unix)]
    dap_command.process_group(0);
    let child = dap_command
        .args(args)
        .current_dir(&canonical_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .with_context(|| format!("failed to spawn `{command}` — is it installed and on PATH?"))?;
    let mut child = OwnedChild::new(child)
        .await
        .map_err(|error| anyhow!(error))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    // Only the first listen address is needed. Flooding startup output must not
    // allocate an unbounded queue or block draining either pipe.
    let (tx, mut rx) = mpsc::channel::<SocketAddr>(1);

    let mut readers = Vec::new();
    if let Some(reader) = stdout {
        let tx_stdout = tx.clone();
        readers.push(tokio::spawn(async move {
            forward_lines(BufReader::new(reader), tx_stdout).await;
        }));
    }
    if let Some(reader) = stderr {
        let tx_stderr = tx.clone();
        readers.push(tokio::spawn(async move {
            forward_lines(BufReader::new(reader), tx_stderr).await;
        }));
    }
    drop(tx);
    let owner = ownership::Owner::new(child, readers);

    let listen_addr = timeout(DAP_READY_TIMEOUT, async move {
        if let Some(addr) = rx.recv().await {
            return Ok::<SocketAddr, anyhow::Error>(addr);
        }
        Err(anyhow!("`dlv dap` exited before reporting listen address"))
    })
    .await
    .context("timed out waiting for `dlv dap` listen address")
    .and_then(|result| result);
    let listen_addr = match listen_addr {
        Ok(addr) => addr,
        Err(error) => {
            let cleanup = owner.stop().await;
            return Err(match cleanup {
                Ok(()) => error,
                Err(cleanup) => anyhow!("{error:#}; debugger cleanup pending: {cleanup}"),
            });
        }
    };

    if !is_local_loopback(listen_addr) {
        owner.stop().await.map_err(|error| anyhow!(error))?;
        return Err(anyhow!(
            "refusing non-local delve endpoint: {listen_addr}; expected 127.0.0.1"
        ));
    }

    Ok(DapProcess { owner, listen_addr })
}

async fn forward_lines<R>(reader: BufReader<R>, tx: mpsc::Sender<SocketAddr>)
where
    R: AsyncRead + Unpin,
{
    let _ = super::output::stream_lines(reader, |line| {
        if let Some(addr) = extract_listen_addr(&line) {
            let _ = tx.try_send(addr);
        }
    })
    .await;
}

fn extract_listen_addr(line: &str) -> Option<SocketAddr> {
    let marker = "127.0.0.1:";
    let start = line.find(marker)?;
    let port_text = line[start + marker.len()..]
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>();
    let port = port_text.parse::<u16>().ok()?;
    Some(SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)))
}

fn is_local_loopback(addr: SocketAddr) -> bool {
    matches!(addr, SocketAddr::V4(v4) if *v4.ip() == Ipv4Addr::LOCALHOST)
}

async fn write_dap_message<W: AsyncWriteExt + Unpin>(writer: &mut W, value: &Value) -> Result<()> {
    let body = serde_json::to_vec(value)?;
    let header = format!("Content-Length: {}\r\n\r\n", body.len());
    writer.write_all(header.as_bytes()).await?;
    writer.write_all(&body).await?;
    writer.flush().await?;
    Ok(())
}

async fn read_dap_message<R: AsyncBufRead + Unpin>(reader: &mut R) -> Result<Value> {
    let mut content_length: Option<usize> = None;
    let mut header_bytes = 0usize;
    const HEADER_LIMIT: usize = 16 * 1024;
    const BODY_LIMIT: usize = 16 * 1024 * 1024;

    loop {
        let mut line = String::new();
        let read = (&mut *reader)
            .take((HEADER_LIMIT - header_bytes + 1) as u64)
            .read_line(&mut line)
            .await?;
        if read == 0 {
            return Err(anyhow!("DAP stream closed"));
        }
        header_bytes += read;
        if header_bytes > HEADER_LIMIT {
            return Err(anyhow!("DAP header exceeds 16 KiB limit"));
        }

        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some((name, value)) = trimmed.split_once(':') {
            if name.eq_ignore_ascii_case("content-length") {
                content_length = Some(value.trim().parse::<usize>()?);
            }
        }
    }

    let len = content_length.ok_or_else(|| anyhow!("DAP message missing Content-Length header"))?;
    if len > BODY_LIMIT {
        return Err(anyhow!("DAP message exceeds 16 MiB limit"));
    }
    let mut body = vec![0u8; len];
    reader.read_exact(&mut body).await?;
    let payload = serde_json::from_slice::<Value>(&body)?;
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn dap_rejects_oversized_headers_and_bodies_before_allocation() {
        let header = format!("X-Noise: {}", "x".repeat(32 * 1024));
        let mut reader = BufReader::new(header.as_bytes());
        assert!(read_dap_message(&mut reader)
            .await
            .unwrap_err()
            .to_string()
            .contains("header exceeds"));
        let mut reader = BufReader::new(b"Content-Length: 16777217\r\n\r\n".as_slice());
        assert!(read_dap_message(&mut reader)
            .await
            .unwrap_err()
            .to_string()
            .contains("message exceeds"));
    }

    #[tokio::test]
    async fn readiness_drains_noise_without_queueing_it_and_survives_closed_receiver() {
        let text = format!(
            "{}DAP server listening at: 127.0.0.1:40123\n",
            "noise\n".repeat(50_000)
        );
        let (tx, mut rx) = mpsc::channel(1);
        forward_lines(BufReader::new(text.as_bytes()), tx).await;
        assert_eq!(rx.recv().await.unwrap().to_string(), "127.0.0.1:40123");
        assert!(rx.recv().await.is_none());
        let (tx, rx) = mpsc::channel(1);
        drop(rx);
        forward_lines(BufReader::new(text.as_bytes()), tx).await;
    }

    #[test]
    fn parse_thread_wait_state_extracts_wait_reason() {
        let parsed = parse_thread_wait_state("Goroutine 1 [chan receive] main.main")
            .expect("must parse supported wait reason");
        assert_eq!(parsed.wait_reason, "chan receive");
        assert_eq!(parsed.status, "chan receive");
    }

    #[test]
    fn parse_thread_wait_state_rejects_unsupported_reason() {
        let parsed = parse_thread_wait_state("Goroutine 2 [running] main.main");
        assert!(parsed.is_none());
    }

    #[test]
    fn thread_to_runtime_signal_starts_predicted() {
        let thread = DapThread {
            id: 42,
            name: "Goroutine 42 [IO wait] netpoll".to_string(),
        };
        let signal = thread_to_runtime_signal(
            &thread,
            &RuntimeSignalScope {
                scope_key: "pkg/main.go:10:2:channel:jobs".to_string(),
                relative_path: "pkg/main.go".to_string(),
                line: 10,
                column: 2,
            },
            None,
        )
        .expect("must map supported thread");
        assert_eq!(signal.thread_id, 42);
        assert_eq!(signal.wait_reason, "io wait");
        assert_eq!(signal.confidence, "predicted");
        assert_eq!(signal.confidence, "predicted");
        assert_eq!(signal.scope_key, "pkg/main.go:10:2:channel:jobs");
        assert_eq!(signal.scope_relative_path, "pkg/main.go");
        assert_eq!(signal.relative_path, "pkg/main.go");
        assert_eq!(signal.line, 10);
        assert_eq!(signal.column, 2);
        assert!(signal.sample_relative_path.is_none());
        assert!(signal.sample_line.is_none());
        assert!(signal.sample_column.is_none());
        assert!(signal.correlation_id.is_none());
        assert!(signal.counterpart_line.is_none());
    }

    #[test]
    fn extract_listen_addr_reads_localhost() {
        let addr =
            extract_listen_addr("DAP server listening at: 127.0.0.1:39017").expect("parse addr");
        assert_eq!(addr.ip().to_string(), "127.0.0.1");
        assert_eq!(addr.port(), 39017);
    }

    #[tokio::test]
    async fn dap_client_initialize_launch_threads_disconnect() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind mock dap listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let seq_counter = std::sync::Arc::new(AtomicUsize::new(0));
        let seq_counter_server = seq_counter.clone();
        let temp_workspace = create_temp_workspace("dap_launch_workspace");
        let package_dir = temp_workspace.join("pkg");
        fs::create_dir_all(&package_dir).expect("create package dir");
        let main_go = package_dir.join("main.go");
        fs::write(&main_go, "package main\nfunc main(){}\n").expect("write go file");
        let expected_program = main_go.to_string_lossy().to_string();

        let server_task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept client");
            for expected_command in ["initialize", "launch", "threads", "disconnect"] {
                let request = read_raw_dap_message(&mut socket)
                    .await
                    .expect("read request");
                let request_seq = request
                    .get("seq")
                    .and_then(Value::as_i64)
                    .expect("request seq");
                let command = request
                    .get("command")
                    .and_then(Value::as_str)
                    .expect("command");
                assert_eq!(command, expected_command);
                if expected_command == "launch" {
                    let args = request
                        .get("arguments")
                        .and_then(Value::as_object)
                        .expect("launch arguments");
                    assert_eq!(
                        args.get("program")
                            .and_then(Value::as_str)
                            .expect("launch program"),
                        expected_program
                    );
                }
                seq_counter_server.fetch_add(1, Ordering::SeqCst);

                let response = if expected_command == "threads" {
                    json!({
                        "seq": 100 + request_seq,
                        "type": "response",
                        "request_seq": request_seq,
                        "success": true,
                        "command": expected_command,
                        "body": {
                            "threads": [
                                { "id": 1, "name": "Goroutine 1 [chan receive] main.main" },
                                { "id": 2, "name": "Goroutine 2 [running] main.worker" }
                            ]
                        }
                    })
                } else {
                    json!({
                        "seq": 100 + request_seq,
                        "type": "response",
                        "request_seq": request_seq,
                        "success": true,
                        "command": expected_command
                    })
                };
                write_raw_dap_message(&mut socket, &response)
                    .await
                    .expect("write response");
            }
        });

        let mut client = DapClient::connect(addr).await.expect("connect");
        client.initialize().await.expect("initialize");
        client
            .launch(LaunchMode::Debug, &temp_workspace, &main_go)
            .await
            .expect("launch");

        let threads = client.threads().await.expect("threads");
        assert_eq!(threads.len(), 2);
        assert_eq!(threads[0].name, "Goroutine 1 [chan receive] main.main");

        client.disconnect().await.expect("disconnect");
        server_task.await.expect("server task");

        assert_eq!(seq_counter.load(Ordering::SeqCst), 4);
    }

    #[tokio::test]
    async fn dap_client_launch_test_mode_uses_target_package_dir() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind mock dap listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let temp_workspace = create_temp_workspace("dap_test_launch_workspace");
        let package_dir = temp_workspace.join("internal").join("workers");
        fs::create_dir_all(&package_dir).expect("create package dir");
        let test_file = package_dir.join("worker_test.go");
        fs::write(&test_file, "package workers\nfunc TestX(t *testing.T){}\n")
            .expect("write go test file");
        let expected_program = test_file.to_string_lossy().to_string();

        let server_task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept client");
            for expected_command in ["initialize", "launch", "disconnect"] {
                let request = read_raw_dap_message(&mut socket)
                    .await
                    .expect("read request");
                let request_seq = request
                    .get("seq")
                    .and_then(Value::as_i64)
                    .expect("request seq");
                let command = request
                    .get("command")
                    .and_then(Value::as_str)
                    .expect("command");
                assert_eq!(command, expected_command);
                if expected_command == "launch" {
                    let args = request
                        .get("arguments")
                        .and_then(Value::as_object)
                        .expect("launch arguments");
                    assert_eq!(
                        args.get("program")
                            .and_then(Value::as_str)
                            .expect("launch program"),
                        expected_program
                    );
                    assert_eq!(
                        args.get("mode")
                            .and_then(Value::as_str)
                            .expect("launch mode"),
                        "test"
                    );
                }

                let response = json!({
                    "seq": 100 + request_seq,
                    "type": "response",
                    "request_seq": request_seq,
                    "success": true,
                    "command": expected_command
                });
                write_raw_dap_message(&mut socket, &response)
                    .await
                    .expect("write response");
            }
        });

        let mut client = DapClient::connect(addr).await.expect("connect");
        client.initialize().await.expect("initialize");
        client
            .launch(LaunchMode::Test, &temp_workspace, &test_file)
            .await
            .expect("launch test mode");
        client.disconnect().await.expect("disconnect");
        server_task.await.expect("server task");
    }

    #[tokio::test]
    async fn dap_client_launch_surfaces_output_event_details_on_failure() {
        let listener = match TcpListener::bind("127.0.0.1:0").await {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => return,
            Err(error) => panic!("bind mock dap listener: {error}"),
        };
        let addr = listener.local_addr().expect("local addr");
        let temp_workspace = create_temp_workspace("dap_launch_failure_workspace");
        let main_go = temp_workspace.join("main.go");
        fs::write(&main_go, "package main\nfunc main(){}\n").expect("write go file");

        let server_task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept client");
            let initialize_request = read_raw_dap_message(&mut socket)
                .await
                .expect("read initialize request");
            let initialize_seq = initialize_request
                .get("seq")
                .and_then(Value::as_i64)
                .expect("initialize seq");
            write_raw_dap_message(
                &mut socket,
                &json!({
                    "seq": 100 + initialize_seq,
                    "type": "response",
                    "request_seq": initialize_seq,
                    "success": true,
                    "command": "initialize"
                }),
            )
            .await
            .expect("write initialize response");

            let launch_request = read_raw_dap_message(&mut socket)
                .await
                .expect("read launch request");
            let launch_seq = launch_request
                .get("seq")
                .and_then(Value::as_i64)
                .expect("launch seq");
            write_raw_dap_message(
                &mut socket,
                &json!({
                    "seq": 200 + launch_seq,
                    "type": "event",
                    "event": "output",
                    "body": {
                        "category": "stderr",
                        "output": "go: go.mod file not found\n"
                    }
                }),
            )
            .await
            .expect("write output event");
            write_raw_dap_message(
                &mut socket,
                &json!({
                    "seq": 300 + launch_seq,
                    "type": "response",
                    "request_seq": launch_seq,
                    "success": false,
                    "command": "launch",
                    "message": "Failed to launch"
                }),
            )
            .await
            .expect("write launch failure");
        });

        let mut client = DapClient::connect(addr).await.expect("connect");
        client.initialize().await.expect("initialize");
        let error = client
            .launch(LaunchMode::Debug, &temp_workspace, &main_go)
            .await
            .expect_err("launch should fail");
        assert!(error.to_string().contains("go.mod file not found"));
        server_task.await.expect("server task");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn spawn_process_extracts_dynamic_port_from_output() {
        use std::os::unix::fs::PermissionsExt;

        let script_dir = create_temp_workspace("fake_dlv");
        let script_path = script_dir.join("fake_dlv.sh");
        fs::write(
            &script_path,
            "#!/usr/bin/env sh\necho 'DAP server listening at: 127.0.0.1:40123' 1>&2\nsleep 10\n",
        )
        .expect("write fake script");
        fs::set_permissions(&script_path, fs::Permissions::from_mode(0o755))
            .expect("make script executable");

        let process =
            spawn_dlv_dap_with(script_path.to_str().expect("script path"), &[], &script_dir)
                .await
                .expect("spawn fake dlv process");

        assert_eq!(process.listen_addr.to_string(), "127.0.0.1:40123");
        process.owner.stop().await.expect("stop fake DAP owner");
    }

    async fn read_raw_dap_message(stream: &mut tokio::net::TcpStream) -> Result<Value> {
        let mut header_bytes = Vec::new();
        let mut temp = [0u8; 1];
        loop {
            stream.read_exact(&mut temp).await?;
            header_bytes.push(temp[0]);
            if header_bytes.ends_with(b"\r\n\r\n") {
                break;
            }
        }
        let header = String::from_utf8(header_bytes)?;
        let mut content_length = 0usize;
        for line in header.lines() {
            if let Some((name, value)) = line.split_once(':') {
                if name.eq_ignore_ascii_case("content-length") {
                    content_length = value.trim().parse::<usize>()?;
                }
            }
        }
        if content_length == 0 {
            return Err(anyhow!("missing content length"));
        }

        let mut body = vec![0u8; content_length];
        stream.read_exact(&mut body).await?;
        Ok(serde_json::from_slice::<Value>(&body)?)
    }

    async fn write_raw_dap_message(
        stream: &mut tokio::net::TcpStream,
        value: &Value,
    ) -> Result<()> {
        let body = serde_json::to_vec(value)?;
        let header = format!("Content-Length: {}\r\n\r\n", body.len());
        stream.write_all(header.as_bytes()).await?;
        stream.write_all(&body).await?;
        Ok(())
    }

    fn create_temp_workspace(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock must be after unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("goide_{prefix}_{unique}"));
        fs::create_dir_all(&path).expect("create temp workspace");
        path
    }
}
