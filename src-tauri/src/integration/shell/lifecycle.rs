use super::ShellSessionStore;
use anyhow::{anyhow, Context, Result};
use std::time::Duration;

/// Remove a session only after its root has been stopped and reaped.
pub async fn dispose_shell_session_inner(store: ShellSessionStore, id: &str) -> Result<()> {
    dispose_with_timeout(store, id, Duration::from_secs(10)).await
}
async fn dispose_with_timeout(store: ShellSessionStore, id: &str, timeout: Duration) -> Result<()> {
    // This guard stays owned by the blocking cleanup after an IPC timeout.
    // A replacement session cannot race with unfinished teardown.
    let mut guard = tokio::time::timeout(timeout, store.lock_owned())
        .await
        .map_err(|_| anyhow!("Shell cleanup is still pending; the session remains owned."))?;
    let id = id.to_string();
    let cleanup = tokio::task::spawn_blocking(move || {
        let Some(mut handle) = guard.sessions.remove(&id) else {
            guard.surface_to_shell.retain(|_, value| value != &id);
            return Ok(());
        };
        match handle.terminate() {
            Ok(()) => {
                guard.surface_to_shell.retain(|_, value| value != &id);
                Ok(())
            }
            Err(error) => {
                guard.sessions.insert(id, handle);
                Err(error)
            }
        }
    });
    tokio::time::timeout(timeout, cleanup).await
        .map_err(|_| anyhow!("Shell teardown has not completed; the session remains owned and the window must stay open."))?
        .context("shell cleanup task failed")?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::integration::shell::{ensure_shell_session_for_test, NullChild};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    };

    #[derive(Debug)]
    struct ControlledChild {
        fail: Arc<AtomicBool>,
        wait: Option<Arc<Mutex<mpsc::Receiver<()>>>>,
    }
    impl portable_pty::ChildKiller for ControlledChild {
        fn kill(&mut self) -> std::io::Result<()> {
            if self.fail.load(Ordering::Acquire) {
                Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "stop denied",
                ))
            } else {
                Ok(())
            }
        }
        fn clone_killer(&self) -> Box<dyn portable_pty::ChildKiller + Send + Sync> {
            Box::new(NullChild)
        }
    }
    impl portable_pty::Child for ControlledChild {
        fn try_wait(&mut self) -> std::io::Result<Option<portable_pty::ExitStatus>> {
            Ok(None)
        }
        fn wait(&mut self) -> std::io::Result<portable_pty::ExitStatus> {
            if let Some(wait) = &self.wait {
                wait.lock().unwrap().recv().unwrap();
            }
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

    #[tokio::test]
    async fn failed_stop_keeps_the_session_mapping_and_scrollback_for_retry() {
        let store = ShellSessionStore::default();
        let created = ensure_shell_session_for_test(&store, "repo", "surface", None)
            .await
            .unwrap();
        let fail = Arc::new(AtomicBool::new(true));
        {
            let mut state = store.lock().await;
            let session = state.sessions.get_mut(&created.shell_session_id).unwrap();
            session.child = Box::new(ControlledChild {
                fail: fail.clone(),
                wait: None,
            });
            session.scrollback.lock().await.push_str("valuable output");
        }
        assert!(
            dispose_shell_session_inner(store.clone(), &created.shell_session_id)
                .await
                .unwrap_err()
                .to_string()
                .contains("failed to terminate")
        );
        let reused = ensure_shell_session_for_test(&store, "repo", "surface", None)
            .await
            .unwrap();
        assert!(reused.reused);
        assert_eq!(reused.shell_session_id, created.shell_session_id);
        assert_eq!(reused.replay, "valuable output");
        fail.store(false, Ordering::Release);
        dispose_shell_session_inner(store.clone(), &created.shell_session_id)
            .await
            .unwrap();
        dispose_shell_session_inner(store.clone(), &created.shell_session_id)
            .await
            .unwrap();
        assert!(store.lock().await.sessions.is_empty());
    }

    #[tokio::test]
    async fn timed_out_reaping_stays_owned_and_serialized_until_the_worker_finishes() {
        let store = ShellSessionStore::default();
        let created = ensure_shell_session_for_test(&store, "repo", "surface", None)
            .await
            .unwrap();
        let (release, receiver) = mpsc::channel();
        store
            .lock()
            .await
            .sessions
            .get_mut(&created.shell_session_id)
            .unwrap()
            .child = Box::new(ControlledChild {
            fail: Arc::new(AtomicBool::new(false)),
            wait: Some(Arc::new(Mutex::new(receiver))),
        });
        let result = dispose_with_timeout(
            store.clone(),
            &created.shell_session_id,
            Duration::from_millis(100),
        )
        .await;
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("session remains owned"));
        assert!(store.try_lock().is_err());
        release.send(()).unwrap();
        let state = tokio::time::timeout(Duration::from_secs(2), store.lock())
            .await
            .unwrap();
        assert!(state.sessions.is_empty());
        assert!(state.surface_to_shell.is_empty());
    }
}
