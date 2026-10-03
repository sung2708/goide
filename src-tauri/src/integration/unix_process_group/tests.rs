use super::*;
use std::{
    os::unix::process::CommandExt,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

fn unrelated() -> std::process::Child {
    Command::new("sleep")
        .arg("60")
        .process_group(0)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap()
}
#[test]
fn natural_exit_remains_unreaped_until_group_signal_and_cannot_signal_a_reused_identifier() {
    let mut foreign = unrelated();
    let mut child = Command::new("sh")
        .args(["-c", "exit 7"])
        .process_group(0)
        .spawn()
        .unwrap();
    let pid = child.id();
    let mut group = Group::new(pid);
    let deadline = Instant::now() + Duration::from_secs(10);
    while !group.exited().unwrap() {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    }
    // Repeat WNOWAIT successfully: status remains owned/unconsumed. Darwin's
    // getpgid cannot look up zombies, so it cannot establish this invariant.
    assert!(group.exited().unwrap());
    assert_eq!(group.try_wait(&mut child).unwrap().unwrap().code(), Some(7));
    assert!(group.signal_consumed && group.reaped);
    assert!(group.is_empty().unwrap());
    // Fault injection models identifier reuse after retirement; no signal is sent.
    group.pid = foreign.id();
    group.signal_once().unwrap();
    assert!(foreign.try_wait().unwrap().is_none());
    foreign.kill().unwrap();
    foreign.wait().unwrap();
}
#[test]
fn lost_wait_authority_fails_closed_without_signalling_an_unrelated_group() {
    let mut foreign = unrelated();
    let mut child = Command::new("sh")
        .args(["-c", "exit 0"])
        .process_group(0)
        .spawn()
        .unwrap();
    let mut group = Group::new(child.id());
    child.wait().unwrap(); // Deliberately bypass ownership to exercise ECHILD.
    assert!(group.signal_once().is_err());
    assert!(!group.signal_consumed);
    assert!(foreign.try_wait().unwrap().is_none());
    foreign.kill().unwrap();
    foreign.wait().unwrap();
}
#[test]
fn root_exit_stops_immediate_descendants_before_reaping_and_keeps_foreign_process_alive() {
    let root = std::env::temp_dir().join(format!("goide-unix-group-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let marker = root.join("started");
    let mut foreign = unrelated();
    let mut child = Command::new("sh")
        .args(["-c", "sleep 60 & printf started > \"$1\"; exit 0", "sh"])
        .arg(&marker)
        .process_group(0)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut group = Group::new(child.id());
    let deadline = Instant::now() + Duration::from_secs(10);
    while group.try_wait(&mut child).unwrap().is_none() {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(marker.exists());
    while !group.is_empty().unwrap() {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(foreign.try_wait().unwrap().is_none());
    foreign.kill().unwrap();
    foreign.wait().unwrap();
    std::fs::remove_file(marker).unwrap();
    std::fs::remove_dir(root).unwrap();
}

#[test]
fn permission_denial_with_a_live_leader_retains_signal_authority_for_retry() {
    let mut child = unrelated();
    let mut group = Group::new(child.id());
    group.group_signal_error = Some(libc::EPERM);
    assert_eq!(
        group.signal_once().unwrap_err().raw_os_error(),
        Some(libc::EPERM)
    );
    assert!(!group.signal_consumed && !group.reaped);
    assert!(child.try_wait().unwrap().is_none());
    group.signal_once().unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    while group.try_wait(&mut child).unwrap().is_none() {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(group.is_empty().unwrap());
}
#[test]
fn exited_leader_does_not_turn_denied_live_descendant_into_success() {
    let root = std::env::temp_dir().join(format!("goide-unix-denied-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).unwrap();
    let release = root.join("release");
    let ready = root.join("ready");
    let mut foreign = unrelated();
    // The fixture descendant has its own release protocol; cleanup never needs
    // to signal an orphan's saved PID after consuming the original leader.
    let mut child = Command::new("sh")
        .args([
            "-c",
            "(printf ready > \"$2\"; while [ ! -f \"$1\" ]; do sleep 0.05; done) & exit 4",
            "sh",
        ])
        .arg(&release)
        .arg(&ready)
        .process_group(0)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut group = Group::new(child.id());
    let deadline = Instant::now() + Duration::from_secs(10);
    while !group.exited().unwrap() || !ready.exists() {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    }
    group.group_signal_error = Some(libc::EPERM);
    assert_eq!(group.try_wait(&mut child).unwrap().unwrap().code(), Some(4));
    assert!(group.signal_consumed && group.reaped);
    assert!(!matches!(group.is_empty(), Ok(true)));
    // A retry cannot mutate this group after its leader was reaped.
    group.signal_once().unwrap();
    assert!(!matches!(group.is_empty(), Ok(true)));
    assert!(foreign.try_wait().unwrap().is_none());
    std::fs::write(&release, "release").unwrap();
    while !matches!(group.is_empty(), Ok(true)) {
        assert!(Instant::now() < deadline);
        std::thread::sleep(Duration::from_millis(10));
    }
    foreign.kill().unwrap();
    foreign.wait().unwrap();
    std::fs::remove_file(release).unwrap();
    std::fs::remove_file(ready).unwrap();
    std::fs::remove_dir(root).unwrap();
}
