use super::*;
use std::{
    io::Read,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    process::Stdio,
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::{HANDLE, WAIT_OBJECT_0},
    System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
};

#[test]
fn terminal_owner_stops_descendants_after_root_exit_without_touching_other_processes() {
    for stop_by_drop in [false, true] {
        let root = std::env::temp_dir().join(format!("goide-pty-owner-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let script = root.join("parent.ps1");
        let start = root.join("start");
        let pid_file = root.join("pid");
        std::fs::write(&script, r#"param([string]$StartPath, [string]$PidPath)
while (-not (Test-Path -LiteralPath $StartPath)) { Start-Sleep -Milliseconds 10 }
$TerminalDescendant = Start-Process ping.exe -ArgumentList @('-n','90','127.0.0.1') -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $PidPath -Value $TerminalDescendant.Id
"#).unwrap();
        let mut unrelated_command = crate::integration::command::std_command("ping.exe");
        unrelated_command
            .args(["-n", "90", "127.0.0.1"])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let mut unrelated =
            crate::integration::owned_sync_process::OwnedSyncChild::spawn(&mut unrelated_command)
                .unwrap();
        let pair = portable_pty::native_pty_system()
            .openpty(portable_pty::PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();
        let mut reader = pair.master.try_clone_reader().unwrap();
        let (done, finished) = std::sync::mpsc::channel();
        let drain = std::thread::spawn(move || {
            let mut bytes = [0; 4096];
            while reader.read(&mut bytes).is_ok_and(|count| count > 0) {}
            let _ = done.send(());
        });
        let mut command = portable_pty::CommandBuilder::new("powershell.exe");
        for argument in [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ] {
            command.arg(argument);
        }
        command.arg(&script);
        command.arg(&start);
        command.arg(&pid_file);
        let mut child = own(pair.slave.spawn_command(command).unwrap()).unwrap();
        drop(pair.slave);
        std::fs::write(&start, b"start").unwrap();
        let deadline = Instant::now() + Duration::from_secs(15);
        while !pid_file.exists() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        // File existence precedes Set-Content closing its exclusive Windows handle.
        // Observe parent completion before reading the fixture's PID file.
        while child.try_wait().unwrap().is_none() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(child.try_wait().unwrap().is_some());
        let pid: u32 = std::fs::read_to_string(&pid_file)
            .unwrap()
            .trim()
            .parse()
            .unwrap();
        // The PID comes from this isolated fixture, and the new handle is owned below.
        let raw = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
        assert!(!raw.is_null());
        let descendant = unsafe { OwnedHandle::from_raw_handle(raw) };
        while child.try_wait().unwrap().is_none() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(child.try_wait().unwrap().is_some());
        assert_ne!(
            unsafe { WaitForSingleObject(descendant.as_raw_handle() as HANDLE, 0) },
            WAIT_OBJECT_0
        );
        if !stop_by_drop {
            child.wait().unwrap();
        }
        drop(child);
        let stopped = unsafe { WaitForSingleObject(descendant.as_raw_handle() as HANDLE, 5000) };
        let unrelated_alive = unrelated.try_wait().unwrap().is_none();
        unrelated.stop().unwrap();
        drop(pair.master);
        finished.recv_timeout(Duration::from_secs(5)).unwrap();
        drain.join().unwrap();
        assert_eq!(stopped, WAIT_OBJECT_0);
        assert!(unrelated_alive);
        for file in [script, start, pid_file] {
            std::fs::remove_file(file).unwrap();
        }
        std::fs::remove_dir(root).unwrap();
    }
}
