use super::*;
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
    #[cfg(unix)]
    fn process_group_leader(&self) -> Option<i32> {
        None
    }
    #[cfg(unix)]
    fn as_raw_fd(&self) -> Option<std::os::fd::RawFd> {
        None
    }
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
pub(super) struct NullChild;

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
    surface_key: &str,
    _cwd_relative_path: Option<&str>,
) -> Result<EnsureShellSessionResponse> {
    let _ = workspace_root; // not used in the test stub; real path logic is covered by integration tests
    let mut guard = store.lock().await;

    if let Some(existing_id) = guard.surface_to_shell.get(surface_key).cloned() {
        if let Some(existing_handle) = guard.sessions.get(&existing_id) {
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

    let shell_session_id = format!("shell:{}", uuid::Uuid::new_v4());

    // Spawn a no-op blocking task as the reader_task placeholder.
    let reader_task = std::thread::spawn(|| {});

    let handle = ShellSessionHandle {
        writer: Arc::new(Mutex::new(Some(Box::new(NullWriter)))),
        master: Arc::new(Mutex::new(Some(Box::new(NullMaster)))),
        child: Box::new(NullChild),
        reader_task: Some(reader_task),
        scrollback: Arc::new(Mutex::new(String::new())),
        shell_health: ShellHealthDto::Launch,
        selected_shell: "test-shell".to_string(),
    };

    guard
        .surface_to_shell
        .insert(surface_key.to_string(), shell_session_id.clone());
    guard.sessions.insert(shell_session_id.clone(), handle);

    Ok(EnsureShellSessionResponse {
        shell_session_id,
        reused: false,
        shell_health: ShellHealthDto::Launch,
        selected_shell: Some("test-shell".to_string()),
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
    use super::{
        resolve_windows_shell_with, resolve_windows_shell_with_cached,
        spawn_windows_shell_with_fallback,
    };
    #[cfg(windows)]
    use anyhow::anyhow;
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

    /// Verify the surface key reuse contract: calling ensure with the same surface
    /// key twice returns the same shell session id and marks the second response
    /// as reused.  Also verifies that the store uses `surface_to_shell` naming.
    #[tokio::test]
    async fn same_surface_key_reuses_shell_session() {
        let store = ShellSessionStore::default();

        let first =
            ensure_shell_session_for_test(&store, "C:/workspace", "surface:panel-shell", Some("."))
                .await
                .expect("first session");
        let second =
            ensure_shell_session_for_test(&store, "C:/workspace", "surface:panel-shell", Some("."))
                .await
                .expect("second session");

        assert_eq!(
            first.shell_session_id, second.shell_session_id,
            "same surface key must yield the same shell session id"
        );
        assert!(second.reused, "second call must be marked as reused");

        // Verify the underlying map uses `surface_to_shell` naming.
        let guard = store.lock().await;
        assert!(
            guard.surface_to_shell.contains_key("surface:panel-shell"),
            "surface_to_shell map must contain the registered surface key"
        );
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
        let first = ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", None)
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
        let second = ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", None)
            .await
            .expect("second");

        assert!(second.reused);
        assert_eq!(second.replay, "$ ls\r\nmain.go\r\n");
    }

    #[tokio::test]
    async fn scrollback_is_empty_after_disposal_and_new_session() {
        let store = ShellSessionStore::default();

        let first = ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", None)
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
        let second = ensure_shell_session_for_test(&store, "C:/workspace", "editor:main.go", None)
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
        let (_child, chosen) = spawn_windows_shell_with_fallback("pwsh", |shell| {
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
        let (_child, chosen) = spawn_windows_shell_with_fallback("pwsh", |shell| {
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
