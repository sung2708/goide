use anyhow::{anyhow, Context, Result};
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

/// A running go process handle, shared across async tasks.
pub type ProcessHandle = Arc<Mutex<Option<Child>>>;

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

fn build_go_run_args(target: &Path, mode: RunMode) -> Vec<String> {
    let mut args = vec!["run".to_string()];
    if mode == RunMode::Race {
        args.push("-race".to_string());
    }
    args.push(target.to_string_lossy().to_string());
    args
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

    // Kill any previously running process
    {
        let mut guard = process_handle.lock().await;
        if let Some(child) = guard.as_mut() {
            let _ = child.kill().await;
        }
        *guard = None;
    }

    // Spawn go run <file> (optionally with -race)
    let args = build_go_run_args(&target, mode);
    let mut child = Command::new("go")
        .args(&args)
        .current_dir(&workspace_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .with_context(|| "failed to spawn `go run` — is `go` in PATH?")?;

    let stdout = child.stdout.take().ok_or_else(|| anyhow!("no stdout"))?;
    let stderr = child.stderr.take().ok_or_else(|| anyhow!("no stderr"))?;
    let run_child_pid = child.id();

    // Store the child in the shared handle
    {
        let mut guard = process_handle.lock().await;
        *guard = Some(child);
    }

    let app_stdout = app_handle.clone();
    let app_stderr = app_handle.clone();
    let app_exit = app_handle.clone();
    let handle_exit = process_handle.clone();
    let run_id_stdout = run_id.clone();
    let run_id_stderr = run_id.clone();
    let run_id_exit = run_id.clone();

    // Stream stdout
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_stdout.emit(
                "run-output",
                RunOutputPayload {
                    run_id: run_id_stdout.clone(),
                    line,
                    stream: "stdout",
                    exit_code: None,
                },
            );
        }
    });

    // Stream stderr
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_stderr.emit(
                "run-output",
                RunOutputPayload {
                    run_id: run_id_stderr.clone(),
                    line,
                    stream: "stderr",
                    exit_code: None,
                },
            );
        }
    });

    // Wait for both streams to finish, then wait for process exit
    let _ = tokio::join!(stdout_task, stderr_task);

    let exit_code = {
        let mut guard = handle_exit.lock().await;
        if let Some(child) = guard.as_mut() {
            if child.id() != run_child_pid {
                None
            } else {
                if let Some(mut owned_child) = guard.take() {
                    match owned_child.wait().await {
                        Ok(status) => status.code(),
                        Err(_) => None,
                    }
                } else {
                    None
                }
            }
        } else {
            None
        }
    };

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
    use super::*;

    #[test]
    fn build_go_run_args_standard_omits_race_flag() {
        let target = Path::new("main.go");
        let args = build_go_run_args(target, RunMode::Standard);
        assert_eq!(args, vec!["run".to_string(), "main.go".to_string()]);
    }

    #[test]
    fn build_go_run_args_race_includes_race_flag() {
        let target = Path::new("main.go");
        let args = build_go_run_args(target, RunMode::Race);
        assert_eq!(
            args,
            vec![
                "run".to_string(),
                "-race".to_string(),
                "main.go".to_string()
            ]
        );
    }

    #[test]
    fn rejects_empty_relative_path() {
        let tmp = std::env::temp_dir().join("goide_run_test");
        let _ = std::fs::create_dir_all(&tmp);
        let root = tmp.to_string_lossy().to_string();
        let result = resolve_run_path(&root, "");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("required"));
    }

    #[test]
    fn rejects_path_escape() {
        let tmp = std::env::temp_dir().join("goide_run_escape_test");
        let _ = std::fs::create_dir_all(&tmp);
        let root = tmp.to_string_lossy().to_string();
        // "../" should escape workspace root
        let result = resolve_run_path(&root, "../something.go");
        assert!(result.is_err());
    }

    #[test]
    fn rejects_nonexistent_file() {
        let tmp = std::env::temp_dir().join("goide_run_missing_test");
        let _ = std::fs::create_dir_all(&tmp);
        let root = tmp.to_string_lossy().to_string();
        let result = resolve_run_path(&root, "nonexistent.go");
        assert!(result.is_err());
    }

    #[test]
    fn accepts_valid_existing_file() {
        let tmp = std::env::temp_dir().join("goide_run_valid_test");
        let _ = std::fs::create_dir_all(&tmp);
        let file = tmp.join("main.go");
        std::fs::write(&file, "package main").unwrap();

        let root = tmp.to_string_lossy().to_string();
        let result = resolve_run_path(&root, "main.go");
        assert!(result.is_ok());
    }
}
