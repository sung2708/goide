//! Synchronous native tools own their descendants until teardown finishes.
use std::process::{Child, Command};

pub struct OwnedSyncChild {
    child: Child,
    #[cfg(windows)]
    tree: crate::integration::process_job::Job,
    #[cfg(unix)]
    process_group: u32,
    stopped: bool,
}

impl OwnedSyncChild {
    pub fn spawn(command: &mut Command) -> std::io::Result<Self> {
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        #[allow(unused_mut)]
        let mut child = command.spawn()?;
        #[cfg(windows)]
        let tree = {
            use std::os::windows::io::AsRawHandle;
            match crate::integration::process_job::Job::new().and_then(|job| {
                job.assign(child.as_raw_handle())?;
                Ok(job)
            }) {
                Ok(tree) => tree,
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(std::io::Error::other(error));
                }
            }
        };
        Ok(Self {
            #[cfg(unix)]
            process_group: child.id(),
            child,
            #[cfg(windows)]
            tree,
            stopped: false,
        })
    }

    pub fn stop(&mut self) -> std::io::Result<()> {
        if self.stopped {
            return Ok(());
        }
        #[cfg(windows)]
        self.tree.terminate().map_err(std::io::Error::other)?;
        #[cfg(unix)]
        {
            // The group was created by this owner at spawn, never discovered by name.
            crate::integration::command::std_command("kill")
                .args(["-KILL", "--", &format!("-{}", self.process_group)])
                .output()?;
        }
        if self.child.try_wait()?.is_none() {
            self.child.kill()?;
        }
        self.child.wait()?;
        self.stopped = true;
        Ok(())
    }
}

impl std::ops::Deref for OwnedSyncChild {
    type Target = Child;
    fn deref(&self) -> &Child {
        &self.child
    }
}

impl std::ops::DerefMut for OwnedSyncChild {
    fn deref_mut(&mut self) -> &mut Child {
        &mut self.child
    }
}

impl Drop for OwnedSyncChild {
    fn drop(&mut self) {
        if let Err(error) = self.stop() {
            eprintln!("Unable to stop owned synchronous tool: {error}");
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use crate::integration::command::std_command;
    use std::{
        os::windows::io::{FromRawHandle, OwnedHandle},
        process::Stdio,
        time::{Duration, Instant},
    };
    use windows_sys::Win32::{
        Foundation::WAIT_OBJECT_0,
        System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
    };

    #[test]
    fn teardown_reaps_descendants_after_root_exit_and_is_scoped_and_idempotent() {
        let root = std::env::temp_dir().join(format!("goide-sync-child-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let script = root.join("parent.ps1");
        let start = root.join("start");
        let pid_file = root.join("pid");
        std::fs::write(&script, r#"param([string]$StartPath, [string]$PidPath)
while (-not (Test-Path -LiteralPath $StartPath)) { Start-Sleep -Milliseconds 10 }
$OwnedDescendant = Start-Process ping.exe -ArgumentList @('-n','90','127.0.0.1') -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $PidPath -Value $OwnedDescendant.Id
"#).unwrap();
        let mut unrelated = OwnedSyncChild::spawn(
            std_command("ping.exe")
                .args(["-n", "90", "127.0.0.1"])
                .stdout(Stdio::null())
                .stderr(Stdio::null()),
        )
        .unwrap();
        let mut owned = OwnedSyncChild::spawn(
            std_command("powershell.exe")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                ])
                .arg(&script)
                .arg(&start)
                .arg(&pid_file)
                .stdout(Stdio::null())
                .stderr(Stdio::null()),
        )
        .unwrap();
        std::fs::write(&start, "start").unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        let pid = loop {
            if let Ok(text) = std::fs::read_to_string(&pid_file) {
                if let Ok(pid) = text.trim().parse::<u32>() {
                    break pid;
                }
            }
            assert!(Instant::now() < deadline, "descendant did not start");
            std::thread::sleep(Duration::from_millis(20));
        };
        // SAFETY: Request only a wait handle for the PID reported by our isolated child.
        let raw = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
        assert!(!raw.is_null());
        // SAFETY: OpenProcess returned a new owned kernel handle.
        let _handle = unsafe { OwnedHandle::from_raw_handle(raw as _) };
        owned.wait().unwrap();
        owned.stop().unwrap();
        owned.stop().unwrap();
        // SAFETY: The handle above remains open for this wait.
        assert_eq!(unsafe { WaitForSingleObject(raw, 2000) }, WAIT_OBJECT_0);
        assert!(unrelated.try_wait().unwrap().is_none());
        unrelated.stop().unwrap();
        std::fs::remove_file(script).unwrap();
        std::fs::remove_file(start).unwrap();
        std::fs::remove_file(pid_file).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}
