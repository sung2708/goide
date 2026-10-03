//! Unix async ownership observes exit before consuming the leader's identity.
use super::super::unix_process_group::Group;
use anyhow::{anyhow, Result};
use std::{
    io,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex, OnceLock,
    },
    time::Duration,
};

#[derive(Debug)]
struct Resources {
    identity: uuid::Uuid,
    child: tokio::process::Child,
    group: Group,
    pending: bool,
    stopped: bool,
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
    pub stdin: Option<tokio::process::ChildStdin>,
    pub stdout: Option<tokio::process::ChildStdout>,
    pub stderr: Option<tokio::process::ChildStderr>,
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
        let resources = pending().lock().unwrap_or_else(|e| e.into_inner()).pop();
        let Some(resources) = resources else {
            return if is_pending() {
                Err("Owned group cleanup is transferring; retry Stop.".into())
            } else {
                Ok(())
            };
        };
        let mut owner = OwnedChild {
            resources: Some(resources),
            stdin: None,
            stdout: None,
            stderr: None,
        };
        if tokio::time::Instant::now() >= deadline {
            return Err("Owned group cleanup remains pending.".into());
        }
        if let Err(error) = owner.stop().await {
            drop(owner);
            let mut pool = pending().lock().unwrap_or_else(|e| e.into_inner());
            if pool.len() > 1 {
                pool.rotate_right(1);
            }
            return Err(error);
        }
    }
}
impl OwnedChild {
    fn wrap(mut child: tokio::process::Child) -> Result<Self, String> {
        let pid = child
            .id()
            .ok_or("Owned child identity was already reaped")?;
        Ok(Self {
            stdin: child.stdin.take(),
            stdout: child.stdout.take(),
            stderr: child.stderr.take(),
            resources: Some(Resources {
                identity: uuid::Uuid::new_v4(),
                child,
                group: Group::new(pid),
                pending: false,
                stopped: false,
                #[cfg(test)]
                pause_next_stop: false,
            }),
        })
    }
    #[cfg(test)]
    pub async fn new(child: tokio::process::Child) -> Result<Self, String> {
        Self::wrap(child)
    }
    pub async fn spawn(
        command: &mut tokio::process::Command,
        before_exec: impl FnOnce() -> Result<()>,
    ) -> Result<Self> {
        retry_cleanup().await.map_err(|e| anyhow!(e))?;
        before_exec()?;
        command.process_group(0).kill_on_drop(false);
        Self::wrap(command.spawn()?).map_err(|e| anyhow!(e))
    }
    fn resources(&self) -> &Resources {
        self.resources.as_ref().expect("owned group resources")
    }
    fn resources_mut(&mut self) -> &mut Resources {
        self.resources.as_mut().expect("owned group resources")
    }
    pub fn identity(&self) -> uuid::Uuid {
        self.resources().identity
    }
    pub fn try_wait(&mut self) -> io::Result<Option<std::process::ExitStatus>> {
        let resources = self.resources_mut();
        resources.group.try_wait_async(&mut resources.child)
    }
    pub async fn wait(&mut self) -> io::Result<std::process::ExitStatus> {
        loop {
            if let Some(status) = self.try_wait()? {
                return Ok(status);
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }
    pub async fn stop(&mut self) -> Result<(), String> {
        #[cfg(test)]
        if self.resources().pause_next_stop {
            self.resources_mut().pause_next_stop = false;
            std::future::pending::<()>().await;
        }
        if self.resources().stopped {
            return Ok(());
        }
        self.resources_mut()
            .group
            .signal_once()
            .map_err(|e| e.to_string())?;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        tokio::time::timeout_at(deadline, self.wait())
            .await
            .map_err(|_| "Owned leader retirement is unconfirmed; retry Stop.".to_string())?
            .map_err(|e| e.to_string())?;
        let resources = self.resources_mut();
        while !resources.group.is_empty().map_err(|e| e.to_string())? {
            if tokio::time::Instant::now() >= deadline {
                return Err("Owned group retirement is unconfirmed; retry Stop.".into());
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        resources.stopped = true;
        if resources.pending {
            resources.pending = false;
            CLEANING.fetch_sub(1, Ordering::AcqRel);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
impl std::ops::Deref for OwnedChild {
    type Target = tokio::process::Child;
    fn deref(&self) -> &Self::Target {
        &self.resources().child
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
        if !resources.pending {
            resources.pending = true;
            CLEANING.fetch_add(1, Ordering::AcqRel);
        }
        let _ = resources.group.signal_once();
        // The unreaped child and complete group state survive failed/abandoned cleanup.
        let resources = self.resources.take().unwrap();
        pending()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(resources);
    }
}
