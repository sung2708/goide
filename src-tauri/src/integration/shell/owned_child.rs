//! A PTY child owns its Windows descendants independently of the app-wide job.
use anyhow::Result;
#[cfg(windows)]
use anyhow::{anyhow, Context};
use portable_pty::Child;
#[cfg(windows)]
use portable_pty::{ChildKiller, ExitStatus};

#[derive(Debug)]
#[cfg(windows)]
struct OwnedPtyChild {
    child: Box<dyn Child + Send + Sync>,
    #[cfg(windows)]
    tree: std::sync::Arc<crate::integration::process_job::Job>,
}

#[allow(unused_mut)] // Windows registration failure must stop the newly spawned child.
pub fn own(mut child: Box<dyn Child + Send + Sync>) -> Result<Box<dyn Child + Send + Sync>> {
    #[cfg(not(windows))]
    return Ok(child);
    #[cfg(windows)]
    let tree = match crate::integration::process_job::Job::new().and_then(|job| {
        job.assign(
            child
                .as_raw_handle()
                .ok_or("PTY child has no process handle")?,
        )?;
        Ok(std::sync::Arc::new(job))
    }) {
        Ok(tree) => tree,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(anyhow!(error)).context("Unable to own terminal process tree");
        }
    };
    #[cfg(windows)]
    Ok(Box::new(OwnedPtyChild {
        child,
        #[cfg(windows)]
        tree,
    }))
}

#[cfg(all(test, windows))]
mod tests;

#[cfg(windows)]
impl ChildKiller for OwnedPtyChild {
    fn kill(&mut self) -> std::io::Result<()> {
        #[cfg(windows)]
        self.tree.terminate().map_err(std::io::Error::other)?;
        if self.child.try_wait()?.is_none() {
            self.child.kill()?;
        }
        Ok(())
    }
    fn clone_killer(&self) -> Box<dyn ChildKiller + Send + Sync> {
        #[cfg(windows)]
        return Box::new(TreeKiller {
            tree: self.tree.clone(),
            child: self.child.clone_killer(),
        });
        #[cfg(not(windows))]
        self.child.clone_killer()
    }
}
#[cfg(windows)]
impl Child for OwnedPtyChild {
    fn try_wait(&mut self) -> std::io::Result<Option<ExitStatus>> {
        self.child.try_wait()
    }
    fn wait(&mut self) -> std::io::Result<ExitStatus> {
        // Cleanup must also stop descendants when the root already exited.
        #[cfg(windows)]
        self.tree.terminate().map_err(std::io::Error::other)?;
        self.child.wait()
    }
    fn process_id(&self) -> Option<u32> {
        self.child.process_id()
    }
    #[cfg(windows)]
    fn as_raw_handle(&self) -> Option<std::os::windows::io::RawHandle> {
        self.child.as_raw_handle()
    }
}
#[cfg(windows)]
impl Drop for OwnedPtyChild {
    fn drop(&mut self) {
        if let Err(error) = self.kill().and_then(|()| self.child.wait().map(|_| ())) {
            eprintln!("Unable to stop owned terminal process: {error}");
        }
    }
}

#[cfg(windows)]
#[derive(Debug)]
struct TreeKiller {
    tree: std::sync::Arc<crate::integration::process_job::Job>,
    child: Box<dyn ChildKiller + Send + Sync>,
}
#[cfg(windows)]
impl ChildKiller for TreeKiller {
    fn kill(&mut self) -> std::io::Result<()> {
        // Killing the job succeeds even when its root process has exited.
        self.tree.terminate().map_err(std::io::Error::other)
    }
    fn clone_killer(&self) -> Box<dyn ChildKiller + Send + Sync> {
        Box::new(Self {
            tree: self.tree.clone(),
            child: self.child.clone_killer(),
        })
    }
}
