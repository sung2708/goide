use anyhow::{anyhow, Context, Result};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Arc, OnceLock};
use tauri::Emitter;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::ui_bridge::types::{ShellExitPayloadDto, ShellOutputPayloadDto};

/// Maximum number of bytes retained in a session's scrollback buffer.
/// 256 KiB is more than enough to fill a typical terminal viewport many times.
const SCROLLBACK_LIMIT: usize = 256 * 1024;

/// Response returned by `ensure_shell_session_inner` and test helpers.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EnsureShellSessionResponse {
    pub shell_session_id: String,
    pub reused: bool,
    /// Buffered PTY output to replay into a fresh xterm surface.
    /// Non-empty when `reused == true` and the session has prior output.
    /// Empty string for brand-new sessions.
    pub replay: String,
}

/// Thread-safe store shared between the Tauri commands.
pub type ShellSessionStore = Arc<Mutex<ShellSessionState>>;

/// Inner state: a map from editor key -> session id, and session id -> handle.
#[derive(Default)]
pub struct ShellSessionState {
    /// Maps `editor_session_key` to an active `shell_session_id`.
    pub editor_to_shell: HashMap<String, String>,
    /// Maps `shell_session_id` to the live session handle.
    pub sessions: HashMap<String, ShellSessionHandle>,
}

/// Holds the live resources for one interactive shell session.
///
/// Call `terminate` explicitly from `dispose_shell_session_inner` for
/// deterministic cleanup before the struct is dropped.
pub struct ShellSessionHandle {
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    /// Handle to the spawned child process so we can kill it on dispose.
    child: Box<dyn portable_pty::Child + Send + Sync>,
    /// Task that relays PTY output to the frontend; aborted on dispose.
    reader_task: JoinHandle<()>,
    /// Bounded scrollback buffer for session replay on fresh frontend mounts.
    /// Shared with the reader task so the task can append without locking the
    /// outer store.
    pub scrollback: Arc<Mutex<String>>,
}

impl ShellSessionHandle {
    /// Terminate the child process and abort the reader task.
    pub fn terminate(mut self) {
        self.reader_task.abort();
        // Best-effort kill; ignore errors (process may have already exited).
        let _ = self.child.kill();
    }
}

/// Returns the shell command appropriate for the current OS.
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
    *cache.get_or_init(|| resolve_windows_shell_with(is_available))
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
fn spawn_windows_shell_with_fallback<T, F>(preferred: &'static str, mut spawn: F) -> Result<T>
where
    F: FnMut(&'static str) -> Result<T>,
{
    let mut errors = Vec::new();
    for shell in windows_shell_spawn_order(preferred) {
        match spawn(shell) {
            Ok(child) => return Ok(child),
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
/// concurrent calls for the same `editor_session_key` cannot each decide the
/// session is absent, then both spawn a PTY.
pub async fn ensure_shell_session_inner<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    store: ShellSessionStore,
    workspace_root: &str,
    editor_session_key: &str,
    cwd_relative_path: Option<&str>,
) -> Result<EnsureShellSessionResponse> {
    // --- Validate workspace_root before any PTY work ---
    let root_path = Path::new(workspace_root);
    if !root_path.exists() {
        return Err(anyhow!(
            "workspace root does not exist: {}",
            workspace_root
        ));
    }
    if !root_path.is_dir() {
        return Err(anyhow!(
            "workspace root is not a directory: {}",
            workspace_root
        ));
    }

    // Acquire the lock and hold it for the entire create+insert sequence.
    let mut guard = store.lock().await;

    // Fast-path: session already exists for this editor key.
    if let Some(existing_id) = guard.editor_to_shell.get(editor_session_key).cloned() {
        if let Some(existing_handle) = guard.sessions.get(&existing_id) {
            // Snapshot the scrollback for replay without holding the full store lock.
            let replay = existing_handle.scrollback.lock().await.clone();
            return Ok(EnsureShellSessionResponse {
                shell_session_id: existing_id,
                reused: true,
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
    let child = spawn_windows_shell_with_fallback(resolve_windows_shell(), |shell| {
        let mut command = CommandBuilder::new(shell);
        command.cwd(&cwd);
        pair.slave
            .spawn_command(command)
            .with_context(|| format!("failed to spawn shell `{shell}`"))
    })?;

    #[cfg(not(windows))]
    let child = {
        let mut command = shell_command();
        command.cwd(&cwd);
        pair.slave
            .spawn_command(command)
            .context("failed to spawn shell")?
    };

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

    // Spawn a blocking task that relays PTY output to the frontend.
    // Using spawn_blocking gives us a JoinHandle we can abort() on dispose.
    //
    // When the PTY exits naturally (shell command finished), the read loop
    // breaks.  The task then attempts to remove the session from the store.
    // If the session was still present (natural exit), it removes it and emits
    // a `shell-exit` event so the frontend can show a retry UI.
    // If the session was already removed (explicit dispose path), no event is
    // emitted — the user requested the teardown explicitly.
    let output_session_id = shell_session_id.clone();
    let output_app = app_handle.clone();
    let exit_store = store.clone();
    let reader_task = tokio::task::spawn_blocking(move || {
        let mut buffer = [0_u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();

                    // Append to the bounded scrollback buffer.
                    // We use block_on here because spawn_blocking runs outside
                    // the async runtime's thread pool — we need to drive the
                    // Mutex future synchronously.
                    if let Ok(handle) = tokio::runtime::Handle::try_current() {
                        handle.block_on(async {
                            let mut sb = scrollback_writer.lock().await;
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
                        });
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

        // Natural exit: attempt to clean up the store.  Use block_on so we
        // can drive the async store lock from within a blocking context.
        let removed = tokio::runtime::Handle::try_current()
            .ok()
            .map(|handle| {
                handle.block_on(async {
                    let mut guard = exit_store.lock().await;
                    guard
                        .editor_to_shell
                        .retain(|_, v| v != &output_session_id);
                    guard.sessions.remove(&output_session_id).is_some()
                })
            })
            .unwrap_or(false);

        if removed {
            // Session was still in the store — this is a natural/unexpected exit.
            // Signal the frontend so it can present a retry UI.
            let _ = output_app.emit(
                "shell-exit",
                ShellExitPayloadDto {
                    shell_session_id: output_session_id,
                },
            );
        }
        // If not removed, the session was already disposed explicitly — no event needed.
    });

    let handle = ShellSessionHandle {
        writer: Arc::new(Mutex::new(writer)),
        master: Arc::new(Mutex::new(pair.master)),
        child,
        reader_task,
        scrollback,
    };

    guard
        .editor_to_shell
        .insert(editor_session_key.to_string(), shell_session_id.clone());
    guard.sessions.insert(shell_session_id.clone(), handle);

    Ok(EnsureShellSessionResponse {
        shell_session_id,
        reused: false,
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
    m.resize(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })
    .context("failed to resize shell")?;
    Ok(())
}

/// Remove a session from the store and cleanly terminate the child process and
/// reader task.
pub async fn dispose_shell_session_inner(
    store: ShellSessionStore,
    shell_session_id: &str,
) -> Result<()> {
    let mut guard = store.lock().await;
    guard
        .editor_to_shell
        .retain(|_, v| v != shell_session_id);
    if let Some(handle) = guard.sessions.remove(shell_session_id) {
        // Release the store lock before running potentially-blocking cleanup.
        drop(guard);
        handle.terminate();
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Test helpers – avoid real PTY / app-handle dependencies
// ---------------------------------------------------------------------------

/// A no-op writer used exclusively in tests to avoid spawning a real PTY.
#[cfg(test)]
struct NullWriter;

#[cfg(test)]
impl Write for NullWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// A no-op MasterPty used exclusively in tests.
#[cfg(test)]
struct NullMaster;

#[cfg(test)]
impl portable_pty::MasterPty for NullMaster {
    fn resize(&self, _size: PtySize) -> anyhow::Result<()> {
        Ok(())
    }
    fn get_size(&self) -> anyhow::Result<PtySize> {
        Ok(PtySize {
            rows: 40,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
    }
    fn try_clone_reader(&self) -> anyhow::Result<Box<dyn Read + Send>> {
        Ok(Box::new(std::io::empty()))
    }
    fn take_writer(&self) -> anyhow::Result<Box<dyn Write + Send>> {
        Ok(Box::new(NullWriter))
    }
}

/// A no-op Child and ChildKiller used exclusively in tests.
#[cfg(test)]
#[derive(Debug)]
struct NullChild;

#[cfg(test)]
impl portable_pty::ChildKiller for NullChild {
    fn kill(&mut self) -> std::io::Result<()> {
        Ok(())
    }
    fn clone_killer(&self) -> Box<dyn portable_pty::ChildKiller + Send + Sync> {
        Box::new(NullChild)
    }
}

#[cfg(test)]
impl portable_pty::Child for NullChild {
    fn try_wait(&mut self) -> std::io::Result<Option<portable_pty::ExitStatus>> {
        Ok(None)
    }
    fn wait(&mut self) -> std::io::Result<portable_pty::ExitStatus> {
        Ok(portable_pty::ExitStatus::with_exit_code(0))
    }
    fn process_id(&self) -> Option<u32> {
        None
    }
    #[cfg(windows)]
    fn as_raw_handle(&self) -> Option<std::os::windows::io::RawHandle> {
        None
    }
}

/// Insert a fake shell session into the store without spawning a real PTY.
/// This lets tests verify the mapping logic (reuse, disposal) in isolation.
#[cfg(test)]
pub async fn ensure_shell_session_for_test(
    store: &ShellSessionStore,
    workspace_root: &str,
    editor_session_key: &str,
    _cwd_relative_path: Option<&str>,
) -> Result<EnsureShellSessionResponse> {
    let _ = workspace_root; // not used in the test stub; real path logic is covered by integration tests
    let mut guard = store.lock().await;

    if let Some(existing_id) = guard.editor_to_shell.get(editor_session_key).cloned() {
        if let Some(existing_handle) = guard.sessions.get(&existing_id) {
            let replay = existing_handle.scrollback.lock().await.clone();
            return Ok(EnsureShellSessionResponse {
                shell_session_id: existing_id,
                reused: true,
                replay,
            });
        }
    }

    let shell_session_id = format!("shell:{}", uuid::Uuid::new_v4());

    // Spawn a no-op blocking task as the reader_task placeholder.
    let reader_task = tokio::task::spawn_blocking(|| {});

    let handle = ShellSessionHandle {
        writer: Arc::new(Mutex::new(Box::new(NullWriter))),
        master: Arc::new(Mutex::new(Box::new(NullMaster))),
        child: Box::new(NullChild),
        reader_task,
        scrollback: Arc::new(Mutex::new(String::new())),
    };

    guard
        .editor_to_shell
        .insert(editor_session_key.to_string(), shell_session_id.clone());
    guard.sessions.insert(shell_session_id.clone(), handle);

    Ok(EnsureShellSessionResponse {
        shell_session_id,
        reused: false,
        replay: String::new(),
    })
}

/// Dispose a shell session from a test context.
#[cfg(test)]
pub async fn dispose_shell_session_for_test(
    store: &ShellSessionStore,
    shell_session_id: &str,
) -> Result<()> {
    dispose_shell_session_inner(store.clone(), shell_session_id).await
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{
        dispose_shell_session_for_test, ensure_shell_session_for_test, ShellSessionStore,
        SCROLLBACK_LIMIT,
    };
    #[cfg(windows)]
    use anyhow::anyhow;
    #[cfg(windows)]
    use super::{
        resolve_windows_shell_with, resolve_windows_shell_with_cached,
        spawn_windows_shell_with_fallback,
    };
    #[cfg(windows)]
    use std::sync::atomic::{AtomicUsize, Ordering};
    #[cfg(windows)]
    use std::sync::OnceLock;

    #[tokio::test]
    async fn reuses_existing_shell_session_for_the_same_editor_key() {
        let store = ShellSessionStore::default();

        let first =
            ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", Some("."))
                .await
                .expect("first session");
        let second =
            ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", Some("."))
                .await
                .expect("second session");

        assert_eq!(first.shell_session_id, second.shell_session_id);
        assert!(second.reused);
    }

    #[tokio::test]
    async fn disposing_a_shell_session_removes_the_editor_mapping() {
        let store = ShellSessionStore::default();
        let created =
            ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", Some("."))
                .await
                .expect("created session");

        dispose_shell_session_for_test(&store, &created.shell_session_id)
            .await
            .expect("dispose succeeds");

        let recreated =
            ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", Some("."))
                .await
                .expect("recreated session");

        assert_ne!(created.shell_session_id, recreated.shell_session_id);
        assert!(!recreated.reused);
    }

    #[tokio::test]
    async fn new_session_has_empty_replay() {
        let store = ShellSessionStore::default();
        let response =
            ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", None)
                .await
                .expect("new session");

        assert!(!response.reused);
        assert!(response.replay.is_empty());
    }

    #[tokio::test]
    async fn reused_session_returns_scrollback_as_replay() {
        let store = ShellSessionStore::default();

        // Create the session.
        let first =
            ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", None)
                .await
                .expect("first");

        // Manually populate the scrollback buffer to simulate PTY output.
        {
            let guard = store.lock().await;
            let handle = guard
                .sessions
                .get(&first.shell_session_id)
                .expect("handle present");
            let mut sb = handle.scrollback.lock().await;
            sb.push_str("$ ls\r\nmain.go\r\n");
        }

        // Ensure again — should reuse and carry the scrollback as replay.
        let second =
            ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", None)
                .await
                .expect("second");

        assert!(second.reused);
        assert_eq!(second.replay, "$ ls\r\nmain.go\r\n");
    }

    #[tokio::test]
    async fn scrollback_is_empty_after_disposal_and_new_session() {
        let store = ShellSessionStore::default();

        let first =
            ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", None)
                .await
                .expect("first");

        // Populate scrollback.
        {
            let guard = store.lock().await;
            let handle = guard.sessions.get(&first.shell_session_id).expect("handle");
            handle.scrollback.lock().await.push_str("old output\r\n");
        }

        dispose_shell_session_for_test(&store, &first.shell_session_id)
            .await
            .expect("dispose");

        // New session: replay must be empty.
        let second =
            ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", None)
                .await
                .expect("second");

        assert!(!second.reused);
        assert!(second.replay.is_empty());
    }

    /// The scrollback buffer is bounded; appending beyond the limit trims the
    /// oldest bytes.  This test exercises the trimming logic directly on the
    /// buffer to verify the invariant without spawning a real PTY.
    #[tokio::test]
    async fn scrollback_buffer_is_bounded() {
        // Build a string that is slightly larger than the limit.
        let big = "X".repeat(SCROLLBACK_LIMIT + 100);

        // Simulate what the reader loop does: push_str then trim.
        let mut sb = String::new();
        sb.push_str(&big);
        if sb.len() > SCROLLBACK_LIMIT {
            let excess = sb.len() - SCROLLBACK_LIMIT;
            let trim_at = sb
                .char_indices()
                .find(|(i, _)| *i >= excess)
                .map(|(i, _)| i)
                .unwrap_or(sb.len());
            sb = sb[trim_at..].to_string();
        }

        assert!(sb.len() <= SCROLLBACK_LIMIT);
    }

    #[cfg(windows)]
    #[test]
    fn resolves_pwsh_first_when_available() {
        let shell = resolve_windows_shell_with(|name| matches!(name, "pwsh"));
        assert_eq!(shell, "pwsh");
    }

    #[cfg(windows)]
    #[test]
    fn falls_back_to_windows_powershell_when_pwsh_missing() {
        let shell = resolve_windows_shell_with(|name| matches!(name, "powershell.exe"));
        assert_eq!(shell, "powershell.exe");
    }

    #[cfg(windows)]
    #[test]
    fn falls_back_to_cmd_when_no_powershell_is_available() {
        let shell = resolve_windows_shell_with(|_| false);
        assert_eq!(shell, "cmd");
    }

    #[cfg(windows)]
    #[test]
    fn retries_next_windows_candidate_when_preferred_fails_to_spawn() {
        let mut attempts = Vec::new();
        let chosen = spawn_windows_shell_with_fallback("pwsh", |shell| {
            attempts.push(shell);
            if shell == "powershell.exe" {
                Ok(shell)
            } else {
                Err(anyhow!("spawn failed"))
            }
        })
        .expect("powershell should be retried and selected");

        assert_eq!(chosen, "powershell.exe");
        assert_eq!(attempts, vec!["pwsh", "powershell.exe"]);
    }

    #[cfg(windows)]
    #[test]
    fn retries_to_cmd_when_both_powershell_variants_fail_to_spawn() {
        let mut attempts = Vec::new();
        let chosen = spawn_windows_shell_with_fallback("pwsh", |shell| {
            attempts.push(shell);
            if shell == "cmd" {
                Ok(shell)
            } else {
                Err(anyhow!("spawn failed"))
            }
        })
        .expect("cmd should be the final retry candidate");

        assert_eq!(chosen, "cmd");
        assert_eq!(attempts, vec!["pwsh", "powershell.exe", "cmd"]);
    }

    #[cfg(windows)]
    #[test]
    fn caches_windows_shell_resolution_after_first_lookup() {
        let cache = OnceLock::new();
        let checks = AtomicUsize::new(0);

        let first = resolve_windows_shell_with_cached(&cache, |name| {
            checks.fetch_add(1, Ordering::SeqCst);
            name == "pwsh"
        });
        let second = resolve_windows_shell_with_cached(&cache, |_name| {
            checks.fetch_add(100, Ordering::SeqCst);
            false
        });

        assert_eq!(first, "pwsh");
        assert_eq!(second, "pwsh");
        assert_eq!(checks.load(Ordering::SeqCst), 1);
    }
}

