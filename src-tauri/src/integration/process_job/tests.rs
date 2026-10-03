use super::Job;
use super::OwnedChild;
use crate::integration::command::std_command;
use std::{
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    process::Stdio,
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::{HANDLE, WAIT_OBJECT_0},
    System::Threading::{
        OpenProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE,
        PROCESS_TERMINATE,
    },
};
struct TestChild(std::process::Child);
struct HandoffChild(OwnedHandle);
impl Drop for HandoffChild {
    fn drop(&mut self) {
        // SAFETY: This fixture owns the handle of only its explicitly created descendant.
        unsafe {
            windows_sys::Win32::System::Threading::TerminateProcess(
                self.0.as_raw_handle() as HANDLE,
                1,
            );
            WaitForSingleObject(self.0.as_raw_handle() as HANDLE, 5000);
        }
    }
}

#[test]
fn installer_handoff_allows_new_child_to_survive_without_disabling_kill_on_close() {
    use windows_sys::Win32::System::JobObjects::{
        JobObjectExtendedLimitInformation, QueryInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK,
    };
    let root = std::env::temp_dir().join(format!("goro-handoff-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let script = root.join("parent.ps1");
    let start = root.join("start");
    let pid_file = root.join("pid");
    std::fs::write(&script, r#"param([string]$StartPath, [string]$PidPath)
while (-not (Test-Path -LiteralPath $StartPath)) { Start-Sleep -Milliseconds 10 }
$FixtureChild = Start-Process ping.exe -ArgumentList @('-n','90','127.0.0.1') -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $PidPath -Value $FixtureChild.Id
"#).unwrap();
    let job = Job::new().unwrap();
    let parent = std_command("powershell.exe")
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
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut parent = TestChild(parent);
    job.assign(parent.as_raw_handle()).unwrap();
    job.installer_handoff(true).unwrap();
    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    let handle = job.handle();
    // SAFETY: Live job handle and initialized, correctly sized output structure.
    assert_ne!(
        unsafe {
            QueryInformationJobObject(
                handle.as_raw_handle() as HANDLE,
                JobObjectExtendedLimitInformation,
                &mut limits as *mut _ as *mut _,
                std::mem::size_of_val(&limits) as u32,
                std::ptr::null_mut(),
            )
        },
        0
    );
    assert_ne!(
        limits.BasicLimitInformation.LimitFlags & JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        0
    );
    assert_ne!(
        limits.BasicLimitInformation.LimitFlags & JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK,
        0
    );
    std::fs::write(&start, b"start").unwrap();
    assert!(parent.wait().unwrap().success());
    let pid = std::fs::read_to_string(&pid_file)
        .unwrap()
        .trim()
        .parse::<u32>()
        .unwrap();
    // SAFETY: PID was created by this isolated fixture; its handle is owned and reaped on Drop.
    let raw = unsafe {
        OpenProcess(
            PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE,
            0,
            pid,
        )
    };
    assert!(!raw.is_null());
    let descendant = HandoffChild(unsafe { OwnedHandle::from_raw_handle(raw) });
    assert!(job.is_empty().unwrap());
    job.installer_handoff(false).unwrap();
    drop(handle);
    drop(job);
    assert_ne!(
        unsafe { WaitForSingleObject(descendant.0.as_raw_handle() as HANDLE, 0) },
        WAIT_OBJECT_0
    );
    drop(descendant);
    assert!(root.starts_with(std::env::temp_dir()));
    std::fs::remove_dir_all(root).unwrap();
}
impl std::ops::Deref for TestChild {
    type Target = std::process::Child;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl std::ops::DerefMut for TestChild {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}
impl Drop for TestChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[test]
fn job_stops_descendant_after_parent_exit_and_keeps_unrelated_process_alive() {
    let root = std::env::temp_dir().join(format!("goide-job-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let script = root.join("parent.ps1");
    let start = root.join("start");
    let pid_file = root.join("pid");
    std::fs::write(&script, r#"param([string]$StartPath, [string]$PidPath)
while (-not (Test-Path -LiteralPath $StartPath)) { Start-Sleep -Milliseconds 10 }
$OwnedDescendant = Start-Process ping.exe -ArgumentList @('-n','90','127.0.0.1') -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $PidPath -Value $OwnedDescendant.Id
"#).unwrap();
    let unrelated = std_command("ping.exe")
        .args(["-n", "90", "127.0.0.1"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut unrelated = TestChild(unrelated);
    let job = Job::new().unwrap();
    let parent = std_command("powershell.exe")
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
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut parent = TestChild(parent);
    job.assign(parent.as_raw_handle()).unwrap();
    std::fs::write(&start, b"start").unwrap();
    let started = Instant::now();
    while !pid_file.exists() && started.elapsed() < Duration::from_secs(10) {
        std::thread::sleep(Duration::from_millis(10));
    }
    let parent_exit = parent.wait().unwrap();
    assert!(parent_exit.success());
    let pid = std::fs::read_to_string(&pid_file)
        .unwrap()
        .trim()
        .parse::<u32>()
        .unwrap();
    // SAFETY: OpenProcess owns a new handle, and the PID comes from our isolated fixture.
    let raw = unsafe {
        OpenProcess(
            PROCESS_SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE,
            0,
            pid,
        )
    };
    assert!(!raw.is_null());
    let descendant = unsafe { OwnedHandle::from_raw_handle(raw) };
    assert_ne!(
        unsafe { WaitForSingleObject(descendant.as_raw_handle() as HANDLE, 0) },
        WAIT_OBJECT_0
    );
    drop(job);
    let descendant_exit =
        unsafe { WaitForSingleObject(descendant.as_raw_handle() as HANDLE, 5000) };
    let unrelated_alive = unrelated.try_wait().unwrap().is_none();
    let _ = unrelated.kill();
    let _ = unrelated.wait();
    assert_eq!(descendant_exit, WAIT_OBJECT_0);
    assert!(unrelated_alive);
    assert!(root.starts_with(std::env::temp_dir()));
    std::fs::remove_dir_all(root).unwrap();
}
#[tokio::test]
async fn owned_async_child_stops_and_reaps_without_stopping_an_unrelated_child() {
    let spawn = || {
        let mut command = crate::integration::command::tokio_command("ping.exe");
        command
            .args(["-n", "60", "127.0.0.1"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        command.spawn().unwrap()
    };
    let mut owned = OwnedChild::new(spawn()).await.unwrap();
    let mut unrelated = spawn();
    let result = owned.stop().await;
    let exited = owned.try_wait().unwrap().is_some();
    let unrelated_alive = unrelated.try_wait().unwrap().is_none();
    let _ = unrelated.kill().await;
    let _ = unrelated.wait().await;
    assert!(result.is_ok());
    assert!(exited);
    assert!(unrelated_alive);
}
#[tokio::test]
async fn completion_uses_owner_identity_and_cannot_retire_a_replacement_run() {
    use std::sync::Arc;
    use tokio::sync::Mutex;
    let spawn = || {
        let mut command = crate::integration::command::tokio_command("ping.exe");
        command
            .args(["-n", "60", "127.0.0.1"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        command.spawn().unwrap()
    };
    let mut old = OwnedChild::new(spawn()).await.unwrap();
    let old_identity = old.identity();
    old.stop().await.unwrap();
    drop(old);
    let current = OwnedChild::new(spawn()).await.unwrap();
    let current_identity = current.identity();
    let handle = Arc::new(Mutex::new(Some(
        crate::integration::process::OwnedRun::new(
            current,
            std::path::PathBuf::from("test"),
            uuid::Uuid::new_v4(),
        ),
    )));
    let result = crate::integration::process::wait_for_owned_exit(&handle, old_identity)
        .await
        .unwrap();
    let mut guard = handle.lock().await;
    let current = guard.as_mut().unwrap();
    let preserved = current.identity() == current_identity && current.try_wait().unwrap().is_none();
    current.stop().await.unwrap();
    *guard = None;
    assert_eq!(result, None);
    assert!(preserved);
}
#[tokio::test]
async fn completion_reaps_and_retires_a_naturally_exited_owned_process() {
    use std::sync::Arc;
    use tokio::sync::Mutex;
    let child = crate::integration::command::tokio_command("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Sleep -Milliseconds 100; exit 13",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let child = OwnedChild::new(child).await.unwrap();
    let identity = child.identity();
    let handle = Arc::new(Mutex::new(Some(
        crate::integration::process::OwnedRun::new(
            child,
            std::path::PathBuf::from("test"),
            uuid::Uuid::new_v4(),
        ),
    )));
    let code = tokio::time::timeout(
        Duration::from_secs(10),
        crate::integration::process::wait_for_owned_exit(&handle, identity),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(code, Some(13));
    assert!(handle.lock().await.is_none());
}
