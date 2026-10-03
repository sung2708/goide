//! Windows async children register ownership before their first instruction.
use super::Job;
use anyhow::{anyhow, Result};
use std::{
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex, OnceLock,
    },
    time::Duration,
};

#[derive(Debug)]
struct Resources {
    identity: uuid::Uuid,
    stopped: bool,
    child: tokio::process::Child,
    tree: Option<Job>,
    pending: bool,
    #[cfg(test)]
    fail_stops: usize,
    #[cfg(test)]
    pause_next_stop: bool,
}
impl Drop for Resources {
    fn drop(&mut self) {
        if self.pending {
            CLEANING.fetch_sub(1, Ordering::AcqRel);
        }
    }
}
#[derive(Debug)]
pub struct OwnedChild {
    resources: Option<Resources>,
}
static CLEANING: AtomicUsize = AtomicUsize::new(0);
static PENDING: OnceLock<Mutex<Vec<Resources>>> = OnceLock::new();
fn pending() -> &'static Mutex<Vec<Resources>> {
    PENDING.get_or_init(Default::default)
}
pub fn is_pending() -> bool {
    CLEANING.load(Ordering::Acquire) > 0
}
pub async fn retry_cleanup() -> Result<(), String> {
    static GATE: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    let _guard = GATE.get_or_init(Default::default).lock().await;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    loop {
        let resource = pending().lock().unwrap_or_else(|e| e.into_inner()).pop();
        let Some(resources) = resource else {
            return if is_pending() {
                Err("Owned process cleanup is transferring; retain ownership and retry.".into())
            } else {
                Ok(())
            };
        };
        // Cancellation at any await drops this owner back into the retained pool.
        let mut owner = OwnedChild {
            resources: Some(resources),
        };
        if tokio::time::Instant::now() >= deadline {
            return Err("Owned process cleanup is still pending; retry Stop.".into());
        }
        if let Err(error) = owner.stop().await {
            drop(owner);
            let mut retained = pending().lock().unwrap_or_else(|e| e.into_inner());
            if retained.len() > 1 {
                retained.rotate_right(1);
            }
            return Err(error);
        }
    }
}
impl OwnedChild {
    fn wrap(child: tokio::process::Child, tree: Option<Job>) -> Self {
        Self {
            resources: Some(Resources {
                identity: uuid::Uuid::new_v4(),
                stopped: false,
                child,
                tree,
                pending: false,
                #[cfg(test)]
                fail_stops: 0,
                #[cfg(test)]
                pause_next_stop: false,
            }),
        }
    }
    #[cfg(test)]
    pub async fn new(child: tokio::process::Child) -> Result<Self, String> {
        let mut owned = Self::wrap(child, None);
        let job = Job::new()?;
        job.assign(owned.child_handle()?)?;
        owned.resources.as_mut().unwrap().tree = Some(job);
        Ok(owned)
    }
    pub async fn spawn(
        command: &mut tokio::process::Command,
        before_resume: impl FnOnce() -> Result<()>,
    ) -> Result<Self> {
        retry_cleanup().await.map_err(|e| anyhow!(e))?;
        Self::spawn_registered(command, Job::assign, before_resume)
    }
    fn child_handle(&self) -> Result<std::os::windows::io::RawHandle, String> {
        self.resources
            .as_ref()
            .expect("owned process resources")
            .child
            .raw_handle()
            .ok_or_else(|| "Owned child has no process handle.".into())
    }
    fn spawn_registered(
        command: &mut tokio::process::Command,
        register: impl FnOnce(&Job, std::os::windows::io::RawHandle) -> Result<(), String>,
        before_resume: impl FnOnce() -> Result<()>,
    ) -> Result<Self> {
        use std::os::windows::process::CommandExt;
        use windows_sys::Win32::System::Threading::{CREATE_NO_WINDOW, CREATE_SUSPENDED};
        let tree = Job::new().map_err(|e| anyhow!(e))?;
        command
            .as_std_mut()
            .creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
        command.kill_on_drop(true);
        let owned = Self::wrap(command.spawn()?, Some(tree));
        let process = owned.child_handle().map_err(|e| anyhow!(e))?;
        let tree = owned.resources.as_ref().unwrap().tree.as_ref().unwrap();
        register(tree, process).map_err(|e| anyhow!(e))?;
        before_resume()?;
        tree.resume_registered(process).map_err(|e| anyhow!(e))?;
        Ok(owned)
    }
    pub async fn stop(&mut self) -> Result<(), String> {
        let resources = self.resources.as_mut().expect("owned process resources");
        if resources.stopped {
            return Ok(());
        }
        #[cfg(test)]
        if resources.fail_stops > 0 {
            resources.fail_stops -= 1;
            return Err("Injected owned async cleanup failure".into());
        }
        #[cfg(test)]
        if resources.pause_next_stop {
            resources.pause_next_stop = false;
            std::future::pending::<()>().await;
        }
        // Registration can fail, so an empty job alone never proves root cleanup.
        let tree_stop = resources.tree.as_ref().map_or(Ok(()), Job::terminate);
        if resources
            .child
            .try_wait()
            .map_err(|e| e.to_string())?
            .is_none()
        {
            if let Err(error) = resources.child.start_kill() {
                if resources
                    .child
                    .try_wait()
                    .map_err(|e| e.to_string())?
                    .is_none()
                {
                    return Err(error.to_string());
                }
            }
        }
        tree_stop?;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        tokio::time::timeout_at(deadline, resources.child.wait())
            .await
            .map_err(|_| {
                "Owned process is still stopping; retain its handle and retry cleanup.".to_string()
            })?
            .map_err(|e| e.to_string())?;
        while !resources.tree.as_ref().map_or(Ok(true), Job::is_empty)? {
            if tokio::time::Instant::now() >= deadline {
                return Err(
                    "Owned descendants are still stopping; retain their job and retry cleanup."
                        .into(),
                );
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        // Keep the child available for existing try_wait callers, but retire pending accounting.
        if resources.pending {
            resources.pending = false;
            CLEANING.fetch_sub(1, Ordering::AcqRel);
        }
        resources.stopped = true;
        resources.tree = None;
        Ok(())
    }
    pub fn identity(&self) -> uuid::Uuid {
        self.resources
            .as_ref()
            .expect("owned process resources")
            .identity
    }
}
impl std::ops::Deref for OwnedChild {
    type Target = tokio::process::Child;
    fn deref(&self) -> &Self::Target {
        &self
            .resources
            .as_ref()
            .expect("owned process resources")
            .child
    }
}
impl std::ops::DerefMut for OwnedChild {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self
            .resources
            .as_mut()
            .expect("owned process resources")
            .child
    }
}
impl Drop for OwnedChild {
    fn drop(&mut self) {
        let Some(resources) = self.resources.as_mut() else {
            return;
        };
        if resources.stopped {
            return;
        }
        // Count retained authority before transferring it out of the active owner.
        if !resources.pending {
            resources.pending = true;
            CLEANING.fetch_add(1, Ordering::AcqRel);
        }
        let mut resources = self.resources.take().unwrap();
        if let Some(tree) = resources.tree.as_ref() {
            let _ = tree.terminate();
        }
        let _ = resources.child.start_kill();
        pending()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(resources);
    }
}

#[cfg(test)]
mod tests;
