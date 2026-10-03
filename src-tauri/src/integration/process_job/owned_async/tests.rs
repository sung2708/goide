use super::*;
async fn test_gate() -> tokio::sync::MutexGuard<'static, ()> {
    static GATE: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    GATE.get_or_init(Default::default).lock().await
}

use std::{
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    path::PathBuf,
    process::Stdio,
    time::Instant,
};
use windows_sys::Win32::{
    Foundation::{HANDLE, WAIT_OBJECT_0},
    System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
};
fn fixture() -> (PathBuf, PathBuf, tokio::process::Command) {
    let root = std::env::temp_dir().join(format!("goide-suspended-async-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let script = root.join("first.ps1");
    let marker = root.join("marker");
    std::fs::write(&script, "param([string]$MarkerPath)\nSet-Content -LiteralPath $MarkerPath -Value ran\nStart-Sleep -Seconds 60\n").unwrap();
    let mut command = crate::integration::command::tokio_command("powershell.exe");
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
fn remove_fixture(root: PathBuf) {
    std::fs::remove_file(root.join("first.ps1")).unwrap();
    if root.join("marker").exists() {
        std::fs::remove_file(root.join("marker")).unwrap();
    }
    std::fs::remove_dir(root).unwrap();
}
fn pin(process: std::os::windows::io::RawHandle) -> OwnedHandle {
    // SAFETY: The original child's process handle stays pinned/alive while opening a wait-only handle.
    let pid = unsafe { windows_sys::Win32::System::Threading::GetProcessId(process as HANDLE) };
    let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
    assert!(!handle.is_null());
    unsafe { OwnedHandle::from_raw_handle(handle) }
}
fn assert_exited(handle: &OwnedHandle) {
    // SAFETY: This uniquely owned wait handle identifies the original test process.
    assert_eq!(
        unsafe { WaitForSingleObject(handle.as_raw_handle() as HANDLE, 0) },
        WAIT_OBJECT_0
    );
}
#[tokio::test]
async fn async_child_first_instruction_follows_job_registration_and_resume_check() {
    let _guard = test_gate().await;
    retry_cleanup().await.unwrap();
    let (root, marker, mut command) = fixture();
    let mut owned = OwnedChild::spawn_registered(
        &mut command,
        |job, process| {
            std::thread::sleep(Duration::from_millis(100));
            assert!(!marker.exists());
            job.assign(process)
        },
        || {
            assert!(!marker.exists());
            Ok(())
        },
    )
    .unwrap();
    let started = Instant::now();
    while !marker.exists() {
        assert!(started.elapsed() < Duration::from_secs(15));
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    owned.stop().await.unwrap();
    owned.stop().await.unwrap();
    assert!(owned.try_wait().unwrap().is_some());
    drop(owned);
    assert!(!is_pending());
    remove_fixture(root);
}
#[tokio::test]
async fn failed_async_registration_retains_exact_child_until_confirmed_cleanup() {
    let _guard = test_gate().await;
    retry_cleanup().await.unwrap();
    let (root, marker, mut command) = fixture();
    let mut handle = None;
    let result = OwnedChild::spawn_registered(
        &mut command,
        |_, process| {
            handle = Some(pin(process));
            Err("Injected registration failure".into())
        },
        || panic!("failed registration cannot resume"),
    );
    assert!(result.is_err());
    assert!(is_pending());
    assert!(!marker.exists());
    retry_cleanup().await.unwrap();
    assert_exited(&handle.unwrap());
    assert!(!marker.exists());
    assert!(!is_pending());
    remove_fixture(root);
}
#[tokio::test]
async fn cancellation_before_async_resumption_prevents_project_code() {
    let _guard = test_gate().await;
    retry_cleanup().await.unwrap();
    let (root, marker, mut command) = fixture();
    let id = uuid::Uuid::new_v4().to_string();
    let startup = crate::integration::language_requests::StartupRequest::begin(
        &root,
        &id,
        Duration::from_secs(15),
    )
    .unwrap();
    let mut handle = None;
    let result = OwnedChild::spawn_registered(
        &mut command,
        |job, process| {
            handle = Some(pin(process));
            job.assign(process)?;
            crate::integration::language_requests::cancel(&root, &id).map_err(|e| e.to_string())?;
            Ok(())
        },
        || startup.check(),
    );
    assert!(crate::integration::language_requests::is_stopped(
        &result.unwrap_err()
    ));
    assert!(is_pending());
    retry_cleanup().await.unwrap();
    assert_exited(&handle.unwrap());
    assert!(!marker.exists());
    drop(startup);
    remove_fixture(root);
}
#[tokio::test]
async fn abandoned_async_owner_and_failed_retry_preserve_unrelated_process() {
    let _guard = test_gate().await;
    retry_cleanup().await.unwrap();
    let mut unrelated = crate::integration::command::tokio_command("ping.exe");
    let mut unrelated = unrelated
        .args(["-n", "60", "127.0.0.1"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let (root, marker, mut command) = fixture();
    let owned = OwnedChild::spawn(&mut command, || Ok(())).await.unwrap();
    let handle = pin(owned.child_handle().unwrap());
    let identity = owned.identity();
    drop(owned);
    assert_eq!(pending().lock().unwrap().last().unwrap().identity, identity);
    pending().lock().unwrap().last_mut().unwrap().fail_stops = 1;
    assert!(retry_cleanup().await.is_err());
    assert!(is_pending());
    assert!(unrelated.try_wait().unwrap().is_none());
    retry_cleanup().await.unwrap();
    assert!(!is_pending());
    assert_exited(&handle);
    assert!(unrelated.try_wait().unwrap().is_none());
    unrelated.kill().await.unwrap();
    unrelated.wait().await.unwrap();
    let _ = marker;
    remove_fixture(root);
}

#[tokio::test]
async fn cancelled_cleanup_future_returns_all_handles_to_pending_ownership() {
    let _guard = test_gate().await;
    retry_cleanup().await.unwrap();
    let (root, _, mut command) = fixture();
    let owned = OwnedChild::spawn(&mut command, || Ok(())).await.unwrap();
    let handle = pin(owned.child_handle().unwrap());
    drop(owned);
    pending()
        .lock()
        .unwrap()
        .last_mut()
        .unwrap()
        .pause_next_stop = true;
    assert!(
        tokio::time::timeout(Duration::from_millis(20), retry_cleanup())
            .await
            .is_err()
    );
    assert!(is_pending());
    assert_eq!(pending().lock().unwrap().len(), 1);
    retry_cleanup().await.unwrap();
    assert!(!is_pending());
    assert_exited(&handle);
    remove_fixture(root);
}
