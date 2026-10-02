use anyhow::{anyhow, Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, OnceLock};
use tauri::Emitter;
use tokio::sync::Mutex;

use crate::ui_bridge::types::{ShellHealthDto, ShellOutputPayloadDto};
mod exit;
mod lifecycle;
mod owned_child;
pub use lifecycle::dispose_shell_session_inner;

/// Maximum number of bytes retained in a session's scrollback buffer.
/// 256 KiB is more than enough to fill a typical terminal viewport many times.
const SCROLLBACK_LIMIT: usize = 256 * 1024;

/// Response returned by `ensure_shell_session_inner` and test helpers.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EnsureShellSessionResponse {
    pub shell_session_id: String,
    pub reused: bool,
    pub shell_health: ShellHealthDto,
    pub selected_shell: Option<String>,
    /// Buffered PTY output to replay into a fresh xterm surface.
    /// Non-empty when `reused == true` and the session has prior output.
    /// Empty string for brand-new sessions.
    pub replay: String,
}

/// Thread-safe store shared between the Tauri commands.
pub type ShellSessionStore = Arc<Mutex<ShellSessionState>>;

/// Inner state: a map from surface key -> session id, and session id -> handle.
#[derive(Default)]
pub struct ShellSessionState {
    /// Maps `surface_key` to an active `shell_session_id`.
    pub surface_to_shell: HashMap<String, String>,
    /// Maps `shell_session_id` to the live session handle.
    pub sessions: HashMap<String, ShellSessionHandle>,
}

/// Holds the live resources for one interactive shell session.
///
/// Call `terminate` explicitly from `dispose_shell_session_inner` for
/// deterministic cleanup before the struct is dropped.
pub struct ShellSessionHandle {
    pub writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    pub master: Arc<Mutex<Option<Box<dyn MasterPty + Send>>>>,
    /// Handle to the spawned child process so we can kill it on dispose.
    child: Box<dyn portable_pty::Child + Send + Sync>,
    /// Reader is joined after closing the PTY, including after IPC timeouts.
    reader_task: Option<std::thread::JoinHandle<()>>,
    /// Bounded scrollback buffer for session replay on fresh frontend mounts.
    /// Shared with the reader task so the task can append without locking the
    /// outer store.
    pub scrollback: Arc<Mutex<String>>,
    pub shell_health: ShellHealthDto,
    pub selected_shell: String,
}

impl ShellSessionHandle {
    /// Terminate the owned child, close the PTY and join its reader.
    pub fn terminate(&mut self) -> Result<()> {
        if self
            .child
            .try_wait()
            .context("failed to inspect shell process")?
            .is_none()
        {
            if let Err(error) = self.child.kill() {
                // A natural exit can race with kill. Only an observed exit
                // permits treating that error as an already-completed stop.
                if self
                    .child
                    .try_wait()
                    .context("failed to inspect shell after stop failure")?
                    .is_none()
                {
                    return Err(error).context("failed to terminate shell process");
                }
            }
        }
        self.child.wait().context("failed to reap shell process")?;
        self.writer.blocking_lock().take();
        self.master.blocking_lock().take();
        if let Some(reader) = self.reader_task.take() {
            reader
                .join()
                .map_err(|_| anyhow!("Shell reader failed during teardown"))?;
        }
        Ok(())
    }
}

/// Returns the shell command appropriate for the current OS.
#[cfg(not(windows))]
fn shell_command() -> CommandBuilder {
    #[cfg(windows)]
    {
        CommandBuilder::new(resolve_windows_shell())
    }
    #[cfg(not(windows))]
    {
        let mut cmd = CommandBuilder::new("bash");
        cmd.arg("-l");
        cmd
    }
}

#[cfg(windows)]
const WINDOWS_SHELL_FALLBACK_ORDER: [&str; 3] = ["pwsh", "powershell.exe", "cmd"];

#[cfg(windows)]
static WINDOWS_SHELL_CACHE: OnceLock<&'static str> = OnceLock::new();

#[cfg(windows)]
fn resolve_windows_shell() -> &'static str {
    resolve_windows_shell_with_cached(&WINDOWS_SHELL_CACHE, is_windows_shell_available)
}

#[cfg(windows)]
fn resolve_windows_shell_with_cached<F>(
    cache: &OnceLock<&'static str>,
    is_available: F,
) -> &'static str
where
    F: Fn(&str) -> bool,
{
    cache.get_or_init(|| resolve_windows_shell_with(is_available))
}

#[cfg(windows)]
fn is_windows_shell_available(shell: &str) -> bool {
    std::process::Command::new("where")
        .arg(shell)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(windows)]
fn resolve_windows_shell_with<F>(is_available: F) -> &'static str
where
    F: Fn(&str) -> bool,
{
    if is_available("pwsh") {
        return "pwsh";
    }
    if is_available("powershell.exe") {
        return "powershell.exe";
    }
    "cmd"
}

#[cfg(windows)]
fn windows_shell_spawn_order(preferred: &'static str) -> [&'static str; 3] {
    match preferred {
        "pwsh" => WINDOWS_SHELL_FALLBACK_ORDER,
        "powershell.exe" => ["powershell.exe", "cmd", "pwsh"],
        "cmd" => ["cmd", "pwsh", "powershell.exe"],
        _ => WINDOWS_SHELL_FALLBACK_ORDER,
    }
}

#[cfg(windows)]
fn spawn_windows_shell_with_fallback<T, F>(
    preferred: &'static str,
    mut spawn: F,
) -> Result<(T, &'static str)>
where
    F: FnMut(&'static str) -> Result<T>,
{
    let mut errors = Vec::new();
    for shell in windows_shell_spawn_order(preferred) {
        match spawn(shell) {
            Ok(child) => return Ok((child, shell)),
            Err(err) => errors.push(format!("{shell}: {err:#}")),
        }
    }

    Err(anyhow!(
        "failed to spawn shell; attempted {}",
        errors.join(" | ")
    ))
}

/// Public entry-point for Tauri commands.
///
/// The store lock is held across PTY creation **and** the insert so that two
/// concurrent calls for the same `surface_key` cannot each decide the
/// session is absent, then both spawn a PTY.
pub async fn ensure_shell_session_inner<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    store: ShellSessionStore,
    workspace_root: &str,
    surface_key: &str,
    cwd_relative_path: Option<&str>,
) -> Result<EnsureShellSessionResponse> {
    // --- Validate workspace_root before any PTY work ---
    let root_path = Path::new(workspace_root);
    if !root_path.exists() {
        return Err(anyhow!("workspace root does not exist: {}", workspace_root));
    }
    if !root_path.is_dir() {
        return Err(anyhow!(
            "workspace root is not a directory: {}",
            workspace_root
        ));
    }

    // Acquire the lock and hold it for the entire create+insert sequence.
    let mut guard = store.lock().await;

    // Fast-path: session already exists for this surface key.
    if let Some(existing_id) = guard.surface_to_shell.get(surface_key).cloned() {
        if let Some(existing_handle) = guard.sessions.get(&existing_id) {
            // Snapshot the scrollback for replay without holding the full store lock.
            let replay = existing_handle.scrollback.lock().await.clone();
            return Ok(EnsureShellSessionResponse {
                shell_session_id: existing_id,
                reused: true,
                shell_health: existing_handle.shell_health.clone(),
                selected_shell: Some(existing_handle.selected_shell.clone()),
                replay,
            });
        }
    }

    // Slow-path: create a new PTY session while holding the lock so no
    // concurrent call can race to create a duplicate.
    let shell_session_id = format!("shell:{}", uuid::Uuid::new_v4());

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 40,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .context("failed to create pseudo terminal")?;

    let cwd = match cwd_relative_path {
        Some(rel) if !rel.is_empty() && rel != "." => root_path.join(rel),
        _ => root_path.to_path_buf(),
    };

    #[cfg(windows)]
    let (child, shell_health, selected_shell) = {
        let preferred_shell = resolve_windows_shell();
        let (child, selected_shell) =
            spawn_windows_shell_with_fallback(preferred_shell, |shell| {
                let mut command = CommandBuilder::new(shell);
                command.cwd(&cwd);
                pair.slave
                    .spawn_command(command)
                    .with_context(|| format!("failed to spawn shell `{shell}`"))
            })?;
        let shell_health = if selected_shell == preferred_shell {
            ShellHealthDto::Launch
        } else {
            ShellHealthDto::Degraded
        };
        (child, shell_health, selected_shell.to_string())
    };

    #[cfg(not(windows))]
    let (child, shell_health, selected_shell) = {
        let mut command = shell_command();
        command.cwd(&cwd);
        let child = pair
            .slave
            .spawn_command(command)
            .context("failed to spawn shell")?;
        (child, ShellHealthDto::Launch, "bash".to_string())
    };

    let child = owned_child::own(child)?;

    let writer = pair
        .master
        .take_writer()
        .context("failed to take shell writer")?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .context("failed to clone shell reader")?;

    // Scrollback buffer shared with the reader task below.
    let scrollback: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let scrollback_writer = scrollback.clone();

    // A native thread can be joined; aborting an already-started blocking task
    // cannot interrupt a PTY read. Cleanup closes the PTY before joining it.
    let output_session_id = shell_session_id.clone();
    let output_app = app_handle.clone();
    let exit_store = store.clone();
    let exit_selected_shell = selected_shell.clone();
    let reader_task = std::thread::Builder::new()
        .name("terminal-reader".into())
        .spawn(move || {
            let mut buffer = [0_u8; 4096];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buffer[..n]).to_string();

                        // Append to the bounded scrollback buffer.
                        // This native reader runs outside the async runtime.
                        {
                            let mut sb = scrollback_writer.blocking_lock();
                            sb.push_str(&data);
                            // Trim the oldest bytes when the buffer exceeds the limit.
                            if sb.len() > SCROLLBACK_LIMIT {
                                let excess = sb.len() - SCROLLBACK_LIMIT;
                                // Advance to the next valid UTF-8 char boundary.
                                let trim_at = sb
                                    .char_indices()
                                    .find(|(i, _)| *i >= excess)
                                    .map(|(i, _)| i)
                                    .unwrap_or(sb.len());
                                *sb = sb[trim_at..].to_string();
                            }
                        }

                        let _ = output_app.emit(
                            "shell-output",
                            ShellOutputPayloadDto {
                                shell_session_id: output_session_id.clone(),
                                data,
                            },
                        );
                    }
                }
            }

            // Cleanup runs elsewhere so it can join this thread without self-joining.
            tauri::async_runtime::spawn(exit::finish(
                output_app,
                exit_store,
                output_session_id,
                exit_selected_shell,
            ));
        })
        .context("Unable to create terminal reader thread")?;

    let handle = ShellSessionHandle {
        writer: Arc::new(Mutex::new(Some(writer))),
        master: Arc::new(Mutex::new(Some(pair.master))),
        child,
        reader_task: Some(reader_task),
        scrollback,
        shell_health: shell_health.clone(),
        selected_shell: selected_shell.clone(),
    };

    guard
        .surface_to_shell
        .insert(surface_key.to_string(), shell_session_id.clone());
    guard.sessions.insert(shell_session_id.clone(), handle);

    exit::monitor(
        app_handle,
        store.clone(),
        shell_session_id.clone(),
        selected_shell.clone(),
    );

    Ok(EnsureShellSessionResponse {
        shell_session_id,
        reused: false,
        shell_health,
        selected_shell: Some(selected_shell),
        replay: String::new(),
    })
}

/// Write raw bytes into the shell's stdin via the PTY writer.
pub async fn write_shell_input_inner(
    store: ShellSessionStore,
    shell_session_id: &str,
    data: &str,
) -> Result<()> {
    let writer = {
        let guard = store.lock().await;
        let session = guard
            .sessions
            .get(shell_session_id)
            .ok_or_else(|| anyhow!("shell session not found: {}", shell_session_id))?;
        session.writer.clone()
    };

    let mut w = writer.lock().await;
    let w = w
        .as_mut()
        .ok_or_else(|| anyhow!("Shell writer is closed"))?;
    w.write_all(data.as_bytes())
        .context("failed to write shell input")?;
    w.flush().context("failed to flush shell input")?;
    Ok(())
}

/// Resize the PTY for a given session.
pub async fn resize_shell_session_inner(
    store: ShellSessionStore,
    shell_session_id: &str,
    cols: u16,
    rows: u16,
) -> Result<()> {
    let master = {
        let guard = store.lock().await;
        let session = guard
            .sessions
            .get(shell_session_id)
            .ok_or_else(|| anyhow!("shell session not found: {}", shell_session_id))?;
        session.master.clone()
    };

    let m = master.lock().await;
    m.as_ref()
        .ok_or_else(|| anyhow!("Shell PTY is closed"))?
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .context("failed to resize shell")?;
    Ok(())
}

#[cfg(test)]
mod test_support;
#[cfg(test)]
use test_support::{ensure_shell_session_for_test, NullChild};
