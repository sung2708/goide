//! Complete PTY authority survives teardown failures and abandoned creation.
use crate::integration::process_job::Job;
use anyhow::{anyhow, Result};
use portable_pty::{Child, ChildKiller, CommandBuilder, ExitStatus, SlavePty};
use std::{
    io,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};

#[derive(Debug)]
struct Resources {
    identity: uuid::Uuid,
    pending: bool,
    child: Box<dyn Child + Send + Sync>,
    tree: Arc<Job>,
}
#[derive(Debug)]
struct OwnedPtyChild {
    resources: Option<Resources>,
    stopped: bool,
}
static PENDING: OnceLock<Mutex<Vec<Resources>>> = OnceLock::new();
static CLEANING: AtomicUsize = AtomicUsize::new(0);
pub fn is_pending() -> bool {
    CLEANING.load(Ordering::Acquire) > 0
}
impl Drop for Resources {
    fn drop(&mut self) {
        if self.pending {
            CLEANING.fetch_sub(1, Ordering::AcqRel);
        }
    }
}
fn pending() -> &'static Mutex<Vec<Resources>> {
    PENDING.get_or_init(Default::default)
}
pub fn spawn(
    slave: &dyn SlavePty,
    command: CommandBuilder,
) -> Result<Box<dyn Child + Send + Sync>> {
    retry_cleanup().map_err(|e| anyhow!(e))?;
    let tree = Arc::new(Job::new().map_err(|e| anyhow!(e))?);
    // The owned handle stays alive through CreateProcess and attribute destruction.
    // No fallible operation intervenes between successful creation and wrapping.
    let child = slave.spawn_command_in_job(command, tree.handle())?;
    Ok(Box::new(OwnedPtyChild {
        resources: Some(Resources {
            child,
            tree,
            identity: uuid::Uuid::new_v4(),
            pending: false,
        }),
        stopped: false,
    }))
}
pub fn retry_cleanup() -> Result<(), String> {
    static GATE: OnceLock<Mutex<()>> = OnceLock::new();
    let _guard = GATE
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        let resources = pending().lock().unwrap_or_else(|e| e.into_inner()).pop();
        let Some(mut resources) = resources else {
            return if is_pending() {
                Err("Terminal cleanup is transferring; retain ownership and retry.".into())
            } else {
                Ok(())
            };
        };
        let result = resources.stop(deadline);
        if let Err(error) = result {
            pending()
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(0, resources);
            return Err(error.to_string());
        }
    }
}
impl Resources {
    fn stop(&mut self, deadline: Instant) -> io::Result<ExitStatus> {
        self.tree.terminate().map_err(io::Error::other)?;
        loop {
            let root = self.child.try_wait()?;
            let empty = self.tree.is_empty().map_err(io::Error::other)?;
            if let Some(status) = root {
                if empty {
                    return Ok(status);
                }
            }
            if Instant::now() >= deadline {
                return Err(io::Error::new(io::ErrorKind::TimedOut,
                    format!("Terminal {} is still stopping; retain its process and job handles and retry.", self.identity)));
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}
impl OwnedPtyChild {
    fn resources(&self) -> &Resources {
        self.resources.as_ref().expect("owned terminal resources")
    }
    fn resources_mut(&mut self) -> &mut Resources {
        self.resources.as_mut().expect("owned terminal resources")
    }
}
impl ChildKiller for OwnedPtyChild {
    fn kill(&mut self) -> io::Result<()> {
        self.resources().tree.terminate().map_err(io::Error::other)
    }
    fn clone_killer(&self) -> Box<dyn ChildKiller + Send + Sync> {
        Box::new(TreeKiller(self.resources().tree.clone()))
    }
}
impl Child for OwnedPtyChild {
    fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        self.resources_mut().child.try_wait()
    }
    fn wait(&mut self) -> io::Result<ExitStatus> {
        let result = self
            .resources_mut()
            .stop(Instant::now() + Duration::from_secs(2))?;
        self.stopped = true;
        Ok(result)
    }
    fn process_id(&self) -> Option<u32> {
        self.resources().child.process_id()
    }
    fn as_raw_handle(&self) -> Option<std::os::windows::io::RawHandle> {
        self.resources().child.as_raw_handle()
    }
}
impl Drop for OwnedPtyChild {
    fn drop(&mut self) {
        if self.stopped {
            return;
        }
        if let Some(resources) = self.resources.as_mut() {
            resources.pending = true;
            CLEANING.fetch_add(1, Ordering::AcqRel);
        }
        let Some(mut resources) = self.resources.take() else {
            return;
        };
        if resources
            .stop(Instant::now() + Duration::from_secs(2))
            .is_err()
        {
            // Keep both original process handle and scoped job; closing a handle is
            // never treated as confirmation that its descendants have retired.
            pending()
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(resources);
        }
    }
}
#[derive(Debug)]
struct TreeKiller(Arc<Job>);
impl ChildKiller for TreeKiller {
    fn kill(&mut self) -> io::Result<()> {
        self.0.terminate().map_err(io::Error::other)
    }
    fn clone_killer(&self) -> Box<dyn ChildKiller + Send + Sync> {
        Box::new(Self(self.0.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    #[derive(Debug)]
    struct RetainedChild(Arc<AtomicBool>);
    impl ChildKiller for RetainedChild {
        fn kill(&mut self) -> io::Result<()> {
            Ok(())
        }
        fn clone_killer(&self) -> Box<dyn ChildKiller + Send + Sync> {
            Box::new(Self(self.0.clone()))
        }
    }
    impl Child for RetainedChild {
        fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
            if self.0.load(Ordering::Acquire) {
                Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "injected retained-root inspection failure",
                ))
            } else {
                Ok(Some(ExitStatus::with_exit_code(0)))
            }
        }
        fn wait(&mut self) -> io::Result<ExitStatus> {
            self.try_wait()?.ok_or_else(|| io::Error::other("pending"))
        }
        fn process_id(&self) -> Option<u32> {
            None
        }
        fn as_raw_handle(&self) -> Option<std::os::windows::io::RawHandle> {
            None
        }
    }
    #[test]
    fn failed_terminal_teardown_retains_identity_and_retries_before_new_sdk_work() {
        retry_cleanup().unwrap();
        let fail = Arc::new(AtomicBool::new(true));
        let identity = uuid::Uuid::new_v4();
        let tree = Arc::new(Job::new().unwrap());
        let child = OwnedPtyChild {
            resources: Some(Resources {
                identity,
                pending: false,
                tree: tree.clone(),
                child: Box::new(RetainedChild(fail.clone())),
            }),
            stopped: false,
        };
        drop(child);
        assert!(is_pending());
        assert_eq!(pending().lock().unwrap().last().unwrap().identity, identity);
        assert!(Arc::ptr_eq(
            &pending().lock().unwrap().last().unwrap().tree,
            &tree
        ));
        assert!(retry_cleanup().is_err());
        assert!(is_pending());
        let mut command = crate::integration::command::std_command("go");
        command.arg("version");
        assert!(
            crate::integration::owned_sync_process::OwnedSyncChild::spawn(&mut command).is_err()
        );
        fail.store(false, Ordering::Release);
        retry_cleanup().unwrap();
        assert!(!is_pending());
        assert!(pending().lock().unwrap().is_empty());
    }
}
