use crate::integration::command::tokio_command;
use crate::integration::process_job::OwnedChild;
use anyhow::{anyhow, Context, Result};
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
#[cfg(not(windows))]
use tokio::process::Child;
use tokio::sync::Mutex;

/// A running go process handle, shared across async tasks.
pub type ProcessHandle = Arc<Mutex<Option<OwnedChild>>>;
pub(crate) async fn wait_for_owned_exit(
    handle: &ProcessHandle,
    owner: uuid::Uuid,
) -> Result<Option<i32>, String> {
    loop {
        let mut guard = handle.lock().await;
        let Some(child) = guard.as_mut() else {
            return Ok(None);
        };
        if child.identity() != owner {
            return Ok(None);
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                child.stop().await?;
                drop(guard.take());
                return Ok(status.code());
            }
            Ok(None) => {}
            Err(error) => {
                return Err(format!("Unable to inspect owned process: {error}"));
            }
        }
        drop(guard);
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunMode {
    Standard,
    Race,
}

/// The payload emitted to the frontend for each output line.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOutputPayload {
    pub run_id: String,
    pub line: String,
    pub stream: &'static str, // "stdout" | "stderr" | "exit"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
}

/// Validates that the relative_path is non-empty and stays within the workspace root.
/// Returns the absolute path to the file.
pub fn resolve_run_path(workspace_root: &str, relative_path: &str) -> Result<std::path::PathBuf> {
    if relative_path.trim().is_empty() {
        return Err(anyhow!("relative path is required"));
    }

    let root = Path::new(workspace_root)
        .canonicalize()
        .with_context(|| format!("workspace root does not exist: {workspace_root}"))?;

    let raw = root.join(relative_path);

    // We canonicalize the parent (file may not exist yet or might be being compiled)
    // but for running, the file must exist.
    let target = raw
        .canonicalize()
        .with_context(|| format!("file does not exist: {}", raw.display()))?;

    if !target.starts_with(&root) {
        return Err(anyhow!("path escapes workspace root"));
    }

    Ok(target)
}

fn to_package_run_target(workspace_root: &Path, target: &Path) -> String {
    let package_dir = target.parent().unwrap_or(target);
    if let Ok(relative_dir) = package_dir.strip_prefix(workspace_root) {
        let normalized = relative_dir.to_string_lossy().replace('\\', "/");
        if normalized.is_empty() || normalized == "." {
            ".".to_string()
        } else {
            format!("./{normalized}")
        }
    } else {
        package_dir.to_string_lossy().to_string()
    }
}

fn build_go_run_args(workspace_root: &Path, target: &Path, mode: RunMode) -> Vec<String> {
    let mut args = vec!["run".to_string()];
    if mode == RunMode::Race {
        args.push("-race".to_string());
    }
    args.push(to_package_run_target(workspace_root, target));
    args
}

#[cfg(not(windows))]
pub async fn kill_process_group(child: &mut Child) -> Result<()> {
    if let Some(pid) = child.id() {
        let _ = tokio_command("kill")
            .args(["-KILL", "--", &format!("-{pid}")])
            .output()
            .await;
    }
    if child.try_wait()?.is_none() {
        child
            .kill()
            .await
            .context("Unable to terminate owned process")?;
    }
    child.wait().await.context("Unable to reap owned process")?;
    Ok(())
}

/// Spawns `go run <file>` in the workspace directory.
/// Emits each output line as a `run-output` event on the `app_handle`.
/// Kills any previous process in `process_handle` before starting a new one.
pub async fn run_go_file<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    workspace_root: String,
    relative_path: String,
    run_id: String,
    mode: RunMode,
    process_handle: ProcessHandle,
) -> Result<()> {
    use tauri::Emitter;

    let target = resolve_run_path(&workspace_root, &relative_path)?;

    let registration = crate::integration::lifecycle::gate()
        .operation()
        .await
        .map_err(|e| anyhow!(e))?;
    // Kill any previously running process
    {
        let mut guard = process_handle.lock().await;
        if let Some(child) = guard.as_mut() {
            child.stop().await.map_err(|error| anyhow!(error))?;
        }
        *guard = None;
    }

    // Spawn go run <package> (optionally with -race)
    let workspace_root_path = Path::new(&workspace_root)
        .canonicalize()
        .with_context(|| format!("workspace root does not exist: {workspace_root}"))?;
    let args = build_go_run_args(&workspace_root_path, &target, mode);
    let mut command = tokio_command("go");
    #[cfg(unix)]
    command.process_group(0);
    let child = command
        .args(&args)
        .current_dir(&workspace_root)
        .env("TERM", "xterm-256color")
        .env("CLICOLOR_FORCE", "1")
        .env("FORCE_COLOR", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .with_context(|| "failed to spawn `go run` — is `go` in PATH?")?;
    let mut child = OwnedChild::new(child)
        .await
        .map_err(|error| anyhow!(error))?;

    let stdout = child.stdout.take().ok_or_else(|| anyhow!("no stdout"))?;
    let stderr = child.stderr.take().ok_or_else(|| anyhow!("no stderr"))?;
    let run_owner_id = child.identity();

    // Store the child in the shared handle
    {
        let mut guard = process_handle.lock().await;
        *guard = Some(child);
    }
    drop(registration);

    let app_stdout = app_handle.clone();
    let app_stderr = app_handle.clone();
    let app_exit = app_handle.clone();
    let handle_exit = process_handle.clone();
    let run_id_stdout = run_id.clone();
    let run_id_stderr = run_id.clone();
    let run_id_exit = run_id.clone();

    // Stream stdout
    let stdout_task = tokio::spawn(async move {
        if let Err(error) = crate::integration::output::stream_lines(stdout, |line| {
            let _ = app_stdout.emit(
                "run-output",
                RunOutputPayload {
                    run_id: run_id_stdout.clone(),
                    line,
                    stream: "stdout",
                    exit_code: None,
                },
            );
        })
        .await
        {
            emit_run_failure(
                &app_stdout,
                &run_id_stdout,
                &format!("Unable to drain process stdout: {error}"),
            );
        }
    });

    // Stream stderr
    let stderr_task = tokio::spawn(async move {
        if let Err(error) = crate::integration::output::stream_lines(stderr, |line| {
            let _ = app_stderr.emit(
                "run-output",
                RunOutputPayload {
                    run_id: run_id_stderr.clone(),
                    line,
                    stream: "stderr",
                    exit_code: None,
                },
            );
        })
        .await
        {
            emit_run_failure(
                &app_stderr,
                &run_id_stderr,
                &format!("Unable to drain process stderr: {error}"),
            );
        }
    });

    // Observe the parent independently of its pipes. A descendant may retain
    // stdout after the parent exits; dropping the owner closes that subtree.
    let exit_code = match wait_for_owned_exit(&handle_exit, run_owner_id).await {
        Ok(code) => code,
        Err(error) => {
            emit_run_failure(&app_exit, &run_id_exit, &error);
            None
        }
    };
    let _ = tokio::join!(stdout_task, stderr_task);

    let _ = app_exit.emit(
        "run-output",
        RunOutputPayload {
            run_id: run_id_exit,
            line: format!("\nProcess exited with code {}.", exit_code.unwrap_or(-1)),
            stream: "exit",
            exit_code,
        },
    );

    Ok(())
}

pub fn emit_run_failure<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    run_id: &str,
    message: &str,
) {
    use tauri::Emitter;

    let _ = app_handle.emit(
        "run-output",
        RunOutputPayload {
            run_id: run_id.to_string(),
            line: message.to_string(),
            stream: "stderr",
            exit_code: None,
        },
    );
    let _ = app_handle.emit(
        "run-output",
        RunOutputPayload {
            run_id: run_id.to_string(),
            line: "\nProcess exited with code -1.".to_string(),
            stream: "exit",
            exit_code: Some(-1),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::tokio_command;
    use super::{build_go_run_args, to_package_run_target, RunMode};
    use std::path::Path;
    use std::process::Stdio;
    #[tokio::test]
    async fn stopping_owned_process_reaps_it_without_stopping_an_unrelated_child() {
        fn command() -> tokio::process::Command {
            #[cfg(windows)]
            {
                let mut command = tokio_command("ping.exe");
                command.args(["-n", "60", "127.0.0.1"]);
                command
            }
            #[cfg(unix)]
            {
                let mut command = tokio_command("sleep");
                command.arg("30").process_group(0);
                command
            }
        }
        let owned = command()
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let mut unrelated = command()
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let mut owned = crate::integration::process_job::OwnedChild::new(owned)
            .await
            .unwrap();
        owned.stop().await.unwrap();
        assert!(owned.try_wait().unwrap().is_some());
        assert!(unrelated.try_wait().unwrap().is_none());
        unrelated.kill().await.unwrap();
        unrelated.wait().await.unwrap();
    }

    #[test]
    fn converts_main_go_path_to_package_dir_relative_to_workspace() {
        let workspace_root = Path::new("C:/repo");
        let target = Path::new("C:/repo/cmd/app/main.go");

        assert_eq!(to_package_run_target(workspace_root, target), "./cmd/app");
    }

    #[test]
    fn uses_dot_for_workspace_root_package() {
        let workspace_root = Path::new("C:/repo");
        let target = Path::new("C:/repo/main.go");

        assert_eq!(to_package_run_target(workspace_root, target), ".");
    }

    #[test]
    fn builds_standard_run_args_from_package_dir() {
        let workspace_root = Path::new("C:/repo");
        let target = Path::new("C:/repo/cmd/app/main.go");

        assert_eq!(
            build_go_run_args(workspace_root, target, RunMode::Standard),
            vec!["run".to_string(), "./cmd/app".to_string()]
        );
    }

    #[test]
    fn builds_race_run_args_from_package_dir() {
        let workspace_root = Path::new("C:/repo");
        let target = Path::new("C:/repo/cmd/app/main.go");

        assert_eq!(
            build_go_run_args(workspace_root, target, RunMode::Race),
            vec![
                "run".to_string(),
                "-race".to_string(),
                "./cmd/app".to_string()
            ]
        );
    }
}
