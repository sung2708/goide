//! Synchronous native tools retain ownership until their entire tree is confirmed stopped.
use std::{
    process::{Child, Command},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

struct SyncProcess {
    child: Child,
    #[cfg(windows)]
    tree: crate::integration::process_job::Job,
    #[cfg(unix)]
    process_group: u32,
    #[cfg(unix)]
    group_signalled: bool,
    #[cfg(test)]
    fail_stops: usize,
}
impl SyncProcess {
    fn stop(&mut self) -> std::io::Result<()> {
        self.stop_until(Instant::now() + Duration::from_secs(2))
    }
    fn stop_until(&mut self, deadline: Instant) -> std::io::Result<()> {
        #[cfg(test)]
        if self.fail_stops > 0 {
            self.fail_stops -= 1;
            return Err(std::io::Error::other("Injected teardown failure"));
        }
        #[cfg(windows)]
        self.tree.terminate().map_err(std::io::Error::other)?;
        #[cfg(unix)]
        if !self.group_signalled {
            // SAFETY: This negative group ID was established by this owner at spawn.
            if unsafe { libc::kill(-(self.process_group as i32), libc::SIGKILL) } != 0 {
                let error = std::io::Error::last_os_error();
                if error.raw_os_error() != Some(libc::ESRCH) {
                    return Err(error);
                }
            }
            // Never re-send a numeric group signal after its leader has been reaped.
            // Retried teardown probes completion and keeps ownership while it is uncertain.
            self.group_signalled = true;
        }
        if self.child.try_wait()?.is_none() {
            self.child.kill()?;
        }
        loop {
            let root_stopped = self.child.try_wait()?.is_some();
            #[cfg(windows)]
            let tree_stopped = self.tree.is_empty().map_err(std::io::Error::other)?;
            #[cfg(unix)]
            let tree_stopped = {
                // SAFETY: Probe only the process group created and retained by this owner.
                if unsafe { libc::kill(-(self.process_group as i32), 0) } == 0 {
                    false
                } else {
                    let error = std::io::Error::last_os_error();
                    if error.raw_os_error() == Some(libc::ESRCH) {
                        true
                    } else {
                        return Err(error);
                    }
                }
            };
            if root_stopped && tree_stopped {
                return Ok(());
            }
            if Instant::now() >= deadline {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::TimedOut,
                    "Owned process tree is still stopping; retain ownership and retry cleanup.",
                ));
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}
static PENDING: OnceLock<Mutex<Vec<SyncProcess>>> = OnceLock::new();
fn cleanup(pending: &mut Vec<SyncProcess>) -> std::io::Result<()> {
    let deadline = Instant::now() + Duration::from_secs(2);
    let mut last_error = None;
    pending.retain_mut(|process| {
        if Instant::now() >= deadline {
            last_error = Some(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                "Owned cleanup is pending; retain remaining handles.",
            ));
            return true;
        }
        match process.stop_until(deadline) {
            Ok(()) => false,
            Err(error) => {
                last_error = Some(error);
                true
            }
        }
    });
    if last_error.is_some() && !pending.is_empty() {
        pending.rotate_left(1);
    }
    last_error.map_or(Ok(()), Err)
}
pub(crate) fn retry_pending_cleanup() -> std::io::Result<()> {
    let mut pending = match PENDING.get_or_init(Default::default).try_lock() {
        Ok(pending) => pending,
        Err(std::sync::TryLockError::Poisoned(error)) => error.into_inner(),
        Err(std::sync::TryLockError::WouldBlock) => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::WouldBlock,
                "Owned cleanup is already running; retain ownership and retry.",
            ))
        }
    };
    cleanup(&mut pending)
}

pub struct OwnedSyncChild {
    process: Option<SyncProcess>,
    stopped: bool,
}
impl OwnedSyncChild {
    pub fn spawn(command: &mut Command) -> std::io::Result<Self> {
        retry_pending_cleanup()?;
        crate::integration::language_requests::check()
            .map_err(crate::integration::language_requests::into_io_error)?;
        #[cfg(windows)]
        {
            Self::spawn_windows(command, crate::integration::process_job::Job::assign)
        }
        #[cfg(not(windows))]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
            let child = command.spawn()?;
            Ok(Self {
                process: Some(SyncProcess {
                    process_group: child.id(),
                    group_signalled: false,
                    child,
                    #[cfg(test)]
                    fail_stops: 0,
                }),
                stopped: false,
            })
        }
    }
    #[cfg(windows)]
    fn spawn_windows(
        command: &mut Command,
        register: impl FnOnce(
            &crate::integration::process_job::Job,
            std::os::windows::io::RawHandle,
        ) -> Result<(), String>,
    ) -> std::io::Result<Self> {
        use std::os::windows::{io::AsRawHandle, process::CommandExt};
        use windows_sys::Win32::System::Threading::{CREATE_NO_WINDOW, CREATE_SUSPENDED};
        // Create the job before the child exists; no project instruction runs before registration.
        let tree = crate::integration::process_job::Job::new().map_err(std::io::Error::other)?;
        command.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
        let child = command.spawn()?;
        let owned = Self {
            process: Some(SyncProcess {
                child,
                tree,
                #[cfg(test)]
                fail_stops: 0,
            }),
            stopped: false,
        };
        let process = owned.process.as_ref().expect("owned suspended process");
        register(&process.tree, process.child.as_raw_handle()).map_err(std::io::Error::other)?;
        crate::integration::language_requests::check()
            .map_err(crate::integration::language_requests::into_io_error)?;
        process
            .tree
            .resume_registered(process.child.as_raw_handle())
            .map_err(std::io::Error::other)?;
        // Any failure above drops `owned`: stop/reap it or retain its full resources for retry.
        Ok(owned)
    }
    pub fn stop(&mut self) -> std::io::Result<()> {
        if self.stopped {
            return Ok(());
        }
        self.process
            .as_mut()
            .expect("owned process handle")
            .stop()?;
        self.stopped = true;
        Ok(())
    }
}
impl std::ops::Deref for OwnedSyncChild {
    type Target = Child;
    fn deref(&self) -> &Child {
        &self.process.as_ref().expect("owned process handle").child
    }
}
impl std::ops::DerefMut for OwnedSyncChild {
    fn deref_mut(&mut self) -> &mut Child {
        &mut self.process.as_mut().expect("owned process handle").child
    }
}
impl Drop for OwnedSyncChild {
    fn drop(&mut self) {
        if let Err(error) = self.stop() {
            eprintln!("Owned synchronous tool cleanup pending: {error}");
            if let Some(process) = self.process.take() {
                PENDING
                    .get_or_init(Default::default)
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner)
                    .push(process);
            }
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
    fn suspended_fixture() -> (std::path::PathBuf, std::path::PathBuf, Command) {
        let root =
            std::env::temp_dir().join(format!("goide-suspended-sdk-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let script = root.join("first.ps1");
        let marker = root.join("marker");
        std::fs::write(&script, "param([string]$MarkerPath)\nSet-Content -LiteralPath $MarkerPath -Value ran\nStart-Sleep -Seconds 60\n").unwrap();
        let mut command = std_command("powershell.exe");
        command
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(script)
            .arg(&marker)
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        (root, marker, command)
    }
    fn remove_suspended_fixture(root: std::path::PathBuf) {
        // Only remove the fresh, isolated fixture created above, after ownership is retired.
        std::fs::remove_file(root.join("first.ps1")).unwrap();
        if root.join("marker").exists() {
            std::fs::remove_file(root.join("marker")).unwrap();
        }
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    fn sdk_child_runs_no_instruction_before_job_assignment() {
        let (root, marker, mut command) = suspended_fixture();
        let mut owned = OwnedSyncChild::spawn_windows(&mut command, |job, process| {
            // A running child would already be allowed to write its first-instruction marker.
            std::thread::sleep(Duration::from_millis(100));
            assert!(
                !marker.exists(),
                "SDK child ran before its job was assigned"
            );
            job.assign(process)
        })
        .unwrap();
        let deadline = Instant::now() + Duration::from_secs(15);
        while !marker.exists() {
            assert!(
                Instant::now() < deadline,
                "Registered SDK child was not resumed"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
        owned.stop().unwrap();
        assert!(owned.try_wait().unwrap().is_some());
        remove_suspended_fixture(root);
    }
    #[test]
    fn cancellation_after_job_assignment_prevents_first_instruction_and_preserves_its_cause() {
        let (root, marker, mut command) = suspended_fixture();
        let id = uuid::Uuid::new_v4().to_string();
        let scope = crate::integration::language_requests::begin_with_timeout(
            &root,
            Some(&id),
            Duration::from_secs(15),
        )
        .unwrap();
        let failed = OwnedSyncChild::spawn_windows(&mut command, |job, process| {
            job.assign(process)?;
            crate::integration::language_requests::cancel(&root, &id).unwrap();
            Ok(())
        });
        let error = match failed {
            Ok(_) => panic!("Cancelled SDK child resumed"),
            Err(error) => error,
        };
        assert!(crate::integration::language_requests::is_stopped(
            &anyhow::Error::from(error)
        ));
        retry_pending_cleanup().unwrap();
        assert!(!marker.exists(), "Cancelled SDK child ran project code");
        drop(scope);
        remove_suspended_fixture(root);
    }
    #[test]
    fn failed_sdk_job_registration_never_runs_project_code_and_reaps_the_child() {
        use std::cell::RefCell;
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::Threading::GetProcessId;
        let (root, marker, mut command) = suspended_fixture();
        let pinned = RefCell::new(None::<OwnedHandle>);
        let failed = OwnedSyncChild::spawn_windows(&mut command, |_job, process| {
            // SAFETY: The newly created Child remains pinned in spawn_windows throughout this callback.
            let pid = unsafe { GetProcessId(process as _) };
            // SAFETY: Open a wait-only handle while the pinned original process is still alive.
            let raw = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
            assert!(!raw.is_null());
            // SAFETY: OpenProcess returned a unique kernel handle, retained past failed registration.
            *pinned.borrow_mut() = Some(unsafe { OwnedHandle::from_raw_handle(raw as _) });
            Err("injected owned job registration failure".into())
        });
        assert!(failed.is_err());
        retry_pending_cleanup().unwrap();
        let handle = pinned.into_inner().unwrap();
        // SAFETY: The retained handle is the exact child created by this fixture.
        assert_eq!(
            unsafe { WaitForSingleObject(handle.as_raw_handle() as _, 2000) },
            WAIT_OBJECT_0
        );
        assert!(!marker.exists(), "Unregistered SDK child ran project code");
        remove_suspended_fixture(root);
    }
    #[test]
    fn failed_cleanup_retains_native_handles_and_retries_without_stopping_unrelated_children() {
        let mut unrelated = OwnedSyncChild::spawn(
            std_command("ping.exe")
                .args(["-n", "90", "127.0.0.1"])
                .stdout(Stdio::null())
                .stderr(Stdio::null()),
        )
        .unwrap();
        let mut owned = OwnedSyncChild::spawn(
            std_command("ping.exe")
                .args(["-n", "90", "127.0.0.1"])
                .stdout(Stdio::null())
                .stderr(Stdio::null()),
        )
        .unwrap();
        let mut process = owned.process.take().unwrap();
        owned.stopped = true;
        process.fail_stops = 2;
        let mut pending = vec![process];
        assert!(cleanup(&mut pending).is_err());
        assert_eq!(pending.len(), 1);
        assert!(pending[0].child.try_wait().unwrap().is_none());
        assert!(cleanup(&mut pending).is_err());
        assert_eq!(pending.len(), 1);
        cleanup(&mut pending).unwrap();
        assert!(pending.is_empty());
        cleanup(&mut pending).unwrap();
        assert!(unrelated.try_wait().unwrap().is_none());
        unrelated.stop().unwrap();
    }

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
