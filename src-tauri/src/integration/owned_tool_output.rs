//! Bounded one-shot native tools share the app's shutdown authority.
use super::{lifecycle, owned_sync_process::OwnedSyncChild};
use std::{
    io::{self, Read, Write},
    process::{Command, Output, Stdio},
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc, Arc,
    },
    time::{Duration, Instant},
};

const OUTPUT_LIMIT: usize = 2 * 1024 * 1024;
static RUNNING: AtomicUsize = AtomicUsize::new(0);
struct Running;
impl Drop for Running {
    fn drop(&mut self) {
        RUNNING.fetch_sub(1, Ordering::AcqRel);
    }
}

pub fn wait_for_shutdown() -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        let cleanup = super::owned_sync_process::retry_pending_cleanup();
        if cleanup.is_ok() && RUNNING.load(Ordering::Acquire) == 0 {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!(
                "Owned native tools are still stopping; retain ownership and retry cleanup. {}",
                cleanup
                    .err()
                    .map(|error| error.to_string())
                    .unwrap_or_default()
            ));
        }
        std::thread::sleep(Duration::from_millis(25));
    }
}

pub(crate) type Observer = Arc<dyn Fn(&'static str, &[u8]) + Send + Sync>;
#[cfg(test)]
fn capture(pipe: impl Read) -> io::Result<Vec<u8>> {
    capture_observed(pipe, "stdout", None)
}
fn capture_observed(
    mut pipe: impl Read,
    stream: &'static str,
    observer: Option<&Observer>,
) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    let mut buffer = [0; 8192];
    let mut limited = false;
    loop {
        let count = pipe.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        let remaining = OUTPUT_LIMIT.saturating_sub(bytes.len());
        let retained = count.min(remaining);
        bytes.extend_from_slice(&buffer[..retained]);
        if retained > 0 {
            if let Some(observer) = observer {
                observer(stream, &buffer[..retained]);
            }
        }
        limited |= count > remaining;
    }
    if limited {
        Err(io::Error::other(
            "Native tool output exceeds the 2 MiB stream limit.",
        ))
    } else {
        Ok(bytes)
    }
}

fn worker<T: Send + 'static>(
    lease: Arc<Running>,
    action: impl FnOnce() -> io::Result<T> + Send + 'static,
) -> io::Result<mpsc::Receiver<io::Result<T>>> {
    let (sender, receiver) = mpsc::channel();
    std::thread::Builder::new()
        .name("owned-tool-pipe".into())
        .spawn(move || {
            let result = action();
            // Shutdown also waits for pipe workers, including a failed teardown.
            drop(lease);
            let _ = sender.send(result);
        })?;
    Ok(receiver)
}
fn receive<T>(receiver: mpsc::Receiver<io::Result<T>>) -> io::Result<T> {
    receiver
        .recv_timeout(Duration::from_secs(3))
        .map_err(|error| io::Error::other(format!("Native tool pipe did not finish: {error}")))?
}

pub fn output(command: &mut Command, input: Option<&str>) -> io::Result<Output> {
    bounded_output(command, input, Duration::from_secs(45))
}
pub(crate) fn output_with_timeout(command: &mut Command, timeout: Duration) -> io::Result<Output> {
    bounded_output(command, None, timeout)
}
pub(crate) fn output_with_observer(
    command: &mut Command,
    timeout: Duration,
    observer: Observer,
) -> io::Result<Output> {
    bounded_output_observed(command, None, timeout, Some(observer), None)
}
fn bounded_output(
    command: &mut Command,
    input: Option<&str>,
    timeout: Duration,
) -> io::Result<Output> {
    bounded_output_observed(command, input, timeout, None, None)
}
pub(crate) fn output_with_control(
    command: &mut Command,
    timeout: Duration,
    control: impl Fn() -> io::Result<()>,
) -> io::Result<Output> {
    bounded_output_observed(command, None, timeout, None, Some(&control))
}
fn bounded_output_observed(
    command: &mut Command,
    input: Option<&str>,
    timeout: Duration,
    observer: Option<Observer>,
    control: Option<&dyn Fn() -> io::Result<()>>,
) -> io::Result<Output> {
    if input.is_some_and(|input| input.len() > 4 * 1024 * 1024) {
        return Err(io::Error::other(
            "Native tool input exceeds the 4 MiB limit.",
        ));
    }
    RUNNING.fetch_add(1, Ordering::AcqRel);
    let lease = Arc::new(Running);
    if lifecycle::gate().is_closing() {
        return Err(io::Error::other(
            "App is shutting down; no new native tool can start.",
        ));
    }
    super::language_requests::check()
        .map_err(|error| io::Error::new(io::ErrorKind::Interrupted, error))?;
    command
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = OwnedSyncChild::spawn_checked(command, || {
        if let Some(control) = control {
            control()?;
        }
        Ok(())
    })?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("Native tool stdout unavailable"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| io::Error::other("Native tool stderr unavailable"))?;
    let out_observer = observer.clone();
    let out = worker(lease.clone(), move || {
        capture_observed(stdout, "stdout", out_observer.as_ref())
    })?;
    let err = worker(lease.clone(), move || {
        capture_observed(stderr, "stderr", observer.as_ref())
    })?;
    let writer = if let Some(input) = input {
        let input = input.to_owned();
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| io::Error::other("Native tool stdin unavailable"))?;
        Some(worker(lease.clone(), move || {
            stdin.write_all(input.as_bytes())
        })?)
    } else {
        None
    };
    let deadline = super::language_requests::deadline(Instant::now() + timeout);
    let status = loop {
        if let Some(control) = control {
            if let Err(error) = control() {
                break Err(error);
            }
        }
        if let Err(error) = super::language_requests::check() {
            break Err(io::Error::new(io::ErrorKind::Interrupted, error));
        }
        if lifecycle::gate().is_closing() {
            break Err(io::Error::other("Native tool cancelled for app shutdown."));
        }
        if Instant::now() >= deadline {
            break Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "Native tool exceeded its execution deadline.",
            ));
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => std::thread::sleep(Duration::from_millis(20)),
            Err(error) => break Err(error),
        }
    };
    // Descendants can retain pipes after the root exits. Stop the owned tree
    // before collecting output, on success as well as failure.
    child.stop()?;
    let stdout = receive(out);
    let stderr = receive(err);
    let written = writer.map(receive).transpose();
    let status = status?;
    if let Err(error) = written {
        if status.success() || error.kind() != io::ErrorKind::BrokenPipe {
            return Err(error);
        }
    }
    Ok(Output {
        status,
        stdout: stdout?,
        stderr: stderr?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn control_cancellation_before_resume_prevents_the_first_instruction() {
        use super::super::command::std_command;
        let root =
            std::env::temp_dir().join(format!("goide-controlled-exec-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let marker = root.join("executed");
        let checks = AtomicUsize::new(0);
        let error = output_with_control(
            std_command("cmd.exe")
                .args(["/D", "/C", "echo executed > executed"])
                .current_dir(&root),
            Duration::from_secs(10),
            || {
                if checks.fetch_add(1, Ordering::AcqRel) == 0 {
                    Ok(())
                } else {
                    Err(io::Error::new(
                        io::ErrorKind::Interrupted,
                        "Requested cancellation before exec",
                    ))
                }
            },
        )
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::Interrupted);
        assert_eq!(checks.load(Ordering::Acquire), 2);
        wait_for_shutdown().unwrap();
        assert!(
            !marker.exists(),
            "Cancelled suspended command executed project code"
        );
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    fn output_is_drained_but_never_reported_complete_after_truncation() {
        assert_eq!(capture(&b"small"[..]).unwrap(), b"small");
        assert!(capture(std::io::repeat(b'x').take((OUTPUT_LIMIT + 1) as u64)).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn scoped_cancellation_stops_a_running_cli_tool_promptly() {
        let root = std::path::Path::new("owned-tool-cancel-test");
        let id = uuid::Uuid::new_v4().to_string();
        let scope = super::super::language_requests::begin(root, Some(&id)).unwrap();
        let canceller = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            super::super::language_requests::cancel(root, &id).unwrap();
        });
        let started = Instant::now();
        let error = output(
            super::super::command::std_command("ping.exe").args(["-n", "90", "127.0.0.1"]),
            None,
        )
        .unwrap_err();
        canceller.join().unwrap();
        assert_eq!(error.kind(), io::ErrorKind::Interrupted);
        assert!(started.elapsed() < Duration::from_secs(3));
        drop(scope);
    }

    #[cfg(windows)]
    #[test]
    fn deadline_stops_the_owned_tool_and_does_not_stop_an_unrelated_process() {
        use super::super::command::std_command;
        let mut unrelated = OwnedSyncChild::spawn(
            std_command("ping.exe")
                .args(["-n", "90", "127.0.0.1"])
                .stdout(Stdio::null())
                .stderr(Stdio::null()),
        )
        .unwrap();
        let started = Instant::now();
        let error = bounded_output(
            std_command("ping.exe").args(["-n", "90", "127.0.0.1"]),
            None,
            Duration::from_millis(100),
        )
        .unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
        assert!(started.elapsed() < Duration::from_secs(3));
        assert!(unrelated.try_wait().unwrap().is_none());
        unrelated.stop().unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn inherited_pipe_subprocess_fixture() {
        let Ok(mode) = std::env::var("GORO_PIPE_FIXTURE_MODE") else {
            return;
        };
        if mode == "descendant" {
            println!("owned-descendant:{}", std::process::id());
            std::io::stdout().flush().unwrap();
            std::thread::sleep(Duration::from_secs(90));
            panic!("Descendant survived owned-tree cleanup");
        }
        assert_eq!(mode, "parent");
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).unwrap();
        assert_eq!(input, "start\n");
        let mut descendant = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "integration::owned_tool_output::tests::inherited_pipe_subprocess_fixture",
                "--nocapture",
                "--test-threads=1",
            ])
            .env("GORO_PIPE_FIXTURE_MODE", "descendant")
            .stdin(Stdio::null())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let acknowledgement =
            std::path::PathBuf::from(std::env::var_os("GORO_PIPE_FIXTURE_ACK").unwrap());
        let deadline = Instant::now() + Duration::from_secs(4);
        while !acknowledgement.exists() {
            assert!(
                Instant::now() < deadline,
                "Descendant was not observed alive"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(descendant.try_wait().unwrap().is_none());
        println!("owned-parent-exited");
        // Dropping Child does not terminate it: it still owns our output pipes.
        drop(descendant);
    }

    #[cfg(windows)]
    #[test]
    fn normal_root_exit_still_reaps_descendants_that_keep_output_pipes_open() {
        use std::os::windows::io::{FromRawHandle, OwnedHandle};
        use windows_sys::Win32::{
            Foundation::{WAIT_OBJECT_0, WAIT_TIMEOUT},
            System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
        };
        let root = std::env::temp_dir().join(format!("goide-cli-child-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let acknowledgement = root.join("observed-alive");
        let observed = Arc::new(std::sync::Mutex::new((Vec::new(), None::<OwnedHandle>)));
        let observed_reader = observed.clone();
        let ack_writer = acknowledgement.clone();
        let observer: Observer = Arc::new(move |stream, bytes| {
            if stream != "stdout" {
                return;
            }
            let mut state = observed_reader.lock().unwrap();
            state.0.extend_from_slice(bytes);
            if state.1.is_some() {
                return;
            }
            let output = String::from_utf8_lossy(&state.0);
            let Some(pid) = output.lines().find_map(|line| {
                let (_, value) = line.split_once("owned-descendant:")?;
                // A pipe read can split the PID; wait for its terminating newline.
                if !output.contains(&format!("owned-descendant:{value}\n")) {
                    return None;
                }
                value.trim().parse::<u32>().ok()
            }) else {
                return;
            };
            let raw = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) };
            assert!(
                !raw.is_null(),
                "Could not retain the live descendant handle"
            );
            let handle = unsafe { OwnedHandle::from_raw_handle(raw) };
            assert_eq!(unsafe { WaitForSingleObject(raw, 0) }, WAIT_TIMEOUT);
            state.1 = Some(handle);
            std::fs::write(&ack_writer, b"alive").unwrap();
        });
        let result = bounded_output_observed(
            Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "integration::owned_tool_output::tests::inherited_pipe_subprocess_fixture",
                    "--nocapture",
                    "--test-threads=1",
                ])
                .env("GORO_PIPE_FIXTURE_MODE", "parent")
                .env("GORO_PIPE_FIXTURE_ACK", &acknowledgement),
            Some("start\n"),
            Duration::from_secs(5),
            Some(observer),
            None,
        );
        let _ = std::fs::remove_file(&acknowledgement);
        let _ = std::fs::remove_dir(&root);
        let result = result.unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        assert!(String::from_utf8_lossy(&result.stdout).contains("owned-parent-exited"));
        use std::os::windows::io::AsRawHandle;
        let observed = observed.lock().unwrap();
        let handle = observed.1.as_ref().expect("Descendant was observed alive");
        assert_eq!(
            unsafe { WaitForSingleObject(handle.as_raw_handle(), 1000) },
            WAIT_OBJECT_0,
            "Owned descendant must be stopped before output returns"
        );
    }
}
