use crate::integration::command::std_command;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

static RUNNING: AtomicUsize = AtomicUsize::new(0);
struct Running;
impl Drop for Running {
    fn drop(&mut self) {
        RUNNING.fetch_sub(1, Ordering::AcqRel);
    }
}
pub(super) fn wait_for_shutdown() -> Result<(), String> {
    let start = Instant::now();
    while RUNNING.load(Ordering::Acquire) != 0 {
        if start.elapsed() > Duration::from_secs(10) {
            return Err(
                "Owned Git processes have not finished stopping; the window remains open.".into(),
            );
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    Ok(())
}

pub(super) fn run(root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    RUNNING.fetch_add(1, Ordering::AcqRel);
    let _running = Running;
    if crate::integration::lifecycle::gate().is_closing() {
        return Err("App is shutting down; no new Git process can start.".into());
    }
    let token = super::cancellation(root);
    if token
        .as_ref()
        .is_some_and(|token| token.load(Ordering::Acquire))
    {
        return Err("Git operation cancelled. Refresh to inspect its actual state.".into());
    }
    let mut command = std_command("git");
    command
        .args(args)
        .current_dir(root)
        // Do not leak pathspec modes into stash/hooks and their nested Git commands.
        .env_remove("GIT_LITERAL_PATHSPECS")
        .env_remove("GIT_GLOB_PATHSPECS")
        .env_remove("GIT_NOGLOB_PATHSPECS")
        .env_remove("GIT_ICASE_PATHSPECS")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE");
    let result = crate::integration::owned_tool_output::output_with_control(
        &mut command,
        Duration::from_secs(180),
        || {
            if token
                .as_ref()
                .is_some_and(|token| token.load(Ordering::Acquire))
            {
                Err(std::io::Error::new(
                    std::io::ErrorKind::Interrupted,
                    "Git operation cancelled",
                ))
            } else {
                Ok(())
            }
        },
    )
    .map_err(|error| {
        let reason = match error.kind() {
            std::io::ErrorKind::Interrupted => "Git operation cancelled",
            std::io::ErrorKind::TimedOut => "Git operation timed out",
            _ => "Git process/output cleanup failed",
        };
        format!(
            "{reason}: {error}. Refresh to inspect the actual repository state before retrying."
        )
    })?;
    let exit = result.status;
    let out = result.stdout;
    let err = result.stderr;
    if !exit.success() {
        let message = String::from_utf8_lossy(&err);
        // Avoid propagating credential
        // URLs printed by configured hooks/helpers into the webview.
        let redacted = message
            .split_inclusive(char::is_whitespace)
            .map(|word| {
                if word.contains("://") {
                    "[URL redacted] ".to_string()
                } else {
                    word.to_string()
                }
            })
            .collect::<String>();
        return Err(if redacted.trim().is_empty() {
            format!("Git exited with {exit}.")
        } else {
            redacted
        });
    }
    Ok(out)
}

pub fn text(root: &Path, args: &[&str]) -> Result<String, String> {
    String::from_utf8(run(root, args)?).map_err(|_| {
        "Git output contains non-UTF-8 names; use the terminal for this repository.".into()
    })
}

// Use literal mode only for commands receiving selected repository paths.
pub(super) fn paths(root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut literal = vec!["--literal-pathspecs"];
    literal.extend_from_slice(args);
    run(root, &literal)
}
