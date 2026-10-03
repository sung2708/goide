//! A debugger owner remains accountable for its process and pipe readers until
//! teardown succeeds, including abandoned startup futures and failed Stop calls.
use crate::integration::process_job::OwnedChild;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
static CLEANING: AtomicUsize = AtomicUsize::new(0);
use std::time::Duration;
use tokio::task::JoinHandle;

#[derive(Debug)]
pub struct Owner {
    resources: Option<Resources>,
}

#[derive(Debug)]
struct Resources {
    child: OwnedChild,
    readers: Vec<JoinHandle<()>>,
    cleanup_pending: bool,
    #[cfg(test)]
    fail_stops: usize,
}

fn pending() -> &'static Mutex<Vec<Resources>> {
    static PENDING: OnceLock<Mutex<Vec<Resources>>> = OnceLock::new();
    PENDING.get_or_init(Default::default)
}

fn cleanup_gate() -> &'static tokio::sync::Mutex<()> {
    static GATE: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    GATE.get_or_init(Default::default)
}

impl Owner {
    pub(super) fn new(child: OwnedChild, readers: Vec<JoinHandle<()>>) -> Self {
        Self {
            resources: Some(Resources {
                child,
                readers,
                cleanup_pending: false,
                #[cfg(test)]
                fail_stops: 0,
            }),
        }
    }

    pub fn identity(&self) -> uuid::Uuid {
        self.resources
            .as_ref()
            .expect("live debugger owner")
            .child
            .identity()
    }

    pub fn attach_worker(&mut self, worker: JoinHandle<()>) {
        self.resources
            .as_mut()
            .expect("live debugger owner")
            .readers
            .push(worker);
    }

    pub fn mark_cleanup_pending(&mut self) {
        if let Some(resources) = self.resources.as_mut() {
            if !resources.cleanup_pending {
                resources.cleanup_pending = true;
                CLEANING.fetch_add(1, Ordering::AcqRel);
            }
        }
    }

    pub async fn stop(mut self) -> Result<(), String> {
        self.mark_cleanup_pending();
        let _gate = cleanup_gate().lock().await;
        self.stop_inner().await
    }

    pub async fn cleanup_failure(self, message: &str) -> String {
        match self.stop().await {
            Ok(()) => message.to_string(),
            Err(error) => format!(
                "{message}; debugger cleanup pending: {error}. Retry Stop or debug startup."
            ),
        }
    }

    async fn stop_inner(&mut self) -> Result<(), String> {
        let Some(resources) = self.resources.as_mut() else {
            return Ok(());
        };
        #[cfg(test)]
        if resources.fail_stops > 0 {
            resources.fail_stops -= 1;
            return Err("injected debugger teardown failure".into());
        }
        // On failure, Drop below retains the child, job and readers together.
        resources.child.stop().await?;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(1);
        while let Some(reader) = resources.readers.last_mut() {
            if tokio::time::timeout_at(deadline, &mut *reader)
                .await
                .is_err()
            {
                reader.abort();
                let _ = (&mut *reader).await;
            }
            resources.readers.pop();
        }
        self.resources.take();
        Ok(())
    }
}

impl Drop for Owner {
    fn drop(&mut self) {
        self.mark_cleanup_pending();
        if let Some(resources) = self.resources.take() {
            pending()
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .push(resources);
        }
    }
}

impl Drop for Resources {
    fn drop(&mut self) {
        if self.cleanup_pending {
            CLEANING.fetch_sub(1, Ordering::AcqRel);
        }
    }
}

pub fn is_pending() -> bool {
    CLEANING.load(Ordering::Acquire) > 0 || crate::integration::process_job::async_cleanup_pending()
}

pub async fn retry_cleanup() -> Result<(), String> {
    crate::integration::process_job::retry_async_cleanup().await?;
    let _gate = cleanup_gate().lock().await;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    loop {
        let resource = pending()
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .pop();
        let Some(resource) = resource else {
            if CLEANING.load(Ordering::Acquire) > 0 {
                return Err("Debugger cleanup is transferring ownership; retry Stop before starting another operation.".into());
            }
            return Ok(());
        };
        let mut owner = Owner {
            resources: Some(resource),
        };
        if tokio::time::Instant::now() >= deadline {
            return Err(
                "Debugger cleanup is still pending; retry Stop before starting another operation."
                    .into(),
            );
        }
        if let Err(error) = owner.stop_inner().await {
            drop(owner);
            let mut retained = pending().lock().unwrap_or_else(|error| error.into_inner());
            if retained.len() > 1 {
                retained.rotate_right(1);
            }
            return Err(error);
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    async fn child() -> OwnedChild {
        let child = crate::integration::command::tokio_command("powershell.exe")
            .args(["-NoProfile", "-Command", "Start-Sleep -Seconds 60"])
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        OwnedChild::new(child).await.unwrap()
    }

    #[tokio::test]
    async fn debugger_failed_stop_retains_owner_and_reader_until_retry() {
        retry_cleanup().await.unwrap();
        let mut unrelated = child().await;
        let completed = Arc::new(AtomicBool::new(false));
        let flag = completed.clone();
        let reader = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            flag.store(true, Ordering::Release);
        });
        let mut owner = Owner::new(child().await, vec![reader]);
        owner.resources.as_mut().unwrap().fail_stops = 1;
        assert!(owner.stop().await.is_err());
        assert!(is_pending());
        retry_cleanup().await.unwrap();
        assert!(!is_pending());
        assert!(completed.load(Ordering::Acquire));
        assert!(unrelated.try_wait().unwrap().is_none());
        unrelated.stop().await.unwrap();
        retry_cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn abandoned_debugger_startup_remains_owned_until_cleanup() {
        retry_cleanup().await.unwrap();
        let mut owner = Owner::new(child().await, vec![]);
        owner.mark_cleanup_pending();
        // The process has left the active slot but has not entered the retry pool.
        assert!(is_pending());
        assert!(retry_cleanup().await.is_err());
        drop(owner);
        assert!(is_pending());
        retry_cleanup().await.unwrap();
        assert!(!is_pending());
    }

    #[tokio::test]
    async fn cancelled_stop_retains_pipe_reader_until_retry_aborts_and_joins_it() {
        struct ReaderDropped(Arc<AtomicBool>);
        impl Drop for ReaderDropped {
            fn drop(&mut self) {
                self.0.store(true, Ordering::Release);
            }
        }
        retry_cleanup().await.unwrap();
        let dropped = Arc::new(AtomicBool::new(false));
        let flag = dropped.clone();
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let reader = tokio::spawn(async move {
            let _guard = ReaderDropped(flag);
            let _ = started_tx.send(());
            std::future::pending::<()>().await;
        });
        started_rx.await.unwrap();
        let owner = Owner::new(child().await, vec![reader]);
        let stop = tokio::spawn(owner.stop());
        tokio::time::sleep(Duration::from_millis(50)).await;
        stop.abort();
        let _ = stop.await;
        assert!(is_pending());
        assert!(!dropped.load(Ordering::Acquire));
        retry_cleanup().await.unwrap();
        assert!(dropped.load(Ordering::Acquire));
        assert!(!is_pending());
    }
}
