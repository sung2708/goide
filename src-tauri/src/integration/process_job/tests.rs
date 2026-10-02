use super::Job;
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
    let mut unrelated = std_command("ping.exe")
        .args(["-n", "90", "127.0.0.1"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let job = Job::new().unwrap();
    let mut parent = std_command("powershell.exe")
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
    job.assign(parent.as_raw_handle()).unwrap();
    std::fs::write(&start, b"start").unwrap();
    let started = Instant::now();
    while !pid_file.exists() && started.elapsed() < Duration::from_secs(10) {
        std::thread::sleep(Duration::from_millis(10));
    }
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
    let parent_exit = parent.wait().unwrap();
    assert!(parent_exit.success());
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
