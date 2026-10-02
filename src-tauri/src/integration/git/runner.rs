use crate::integration::command::std_command;
use std::io::Read;
use std::path::Path;
use std::process::Stdio;

const OUTPUT_LIMIT: usize = 2 * 1024 * 1024;

// Drain both streams concurrently to avoid pipe deadlock; retain bounded output.
fn capture(mut pipe: impl Read) -> Result<(Vec<u8>, bool), String> {
    let mut bytes = Vec::new();
    let mut buffer = [0; 8192];
    let mut truncated = false;
    loop {
        let count = pipe.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 { break; }
        let remaining = OUTPUT_LIMIT.saturating_sub(bytes.len());
        bytes.extend_from_slice(&buffer[..count.min(remaining)]);
        truncated |= count > remaining;
    }
    Ok((bytes, truncated))
}

pub(super) fn run(root: &Path, args: &[&str]) -> Result<Vec<u8>, String> {
    let mut child = std_command("git").args(args).current_dir(root)
        .env("GIT_LITERAL_PATHSPECS", "1").env("GIT_OPTIONAL_LOCKS", "0")
        .env_remove("GIT_DIR").env_remove("GIT_WORK_TREE").env_remove("GIT_INDEX_FILE")
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("Unable to start Git: {e}"))?;
    let stdout = child.stdout.take().ok_or("Git stdout unavailable")?;
    let stderr = child.stderr.take().ok_or("Git stderr unavailable")?;
    let out_thread = std::thread::spawn(move || capture(stdout));
    let err_thread = std::thread::spawn(move || capture(stderr));
    let exit = child.wait().map_err(|e| e.to_string())?;
    let (out, out_truncated) = out_thread.join().map_err(|_| "Git stdout reader failed")??;
    let (err, err_truncated) = err_thread.join().map_err(|_| "Git stderr reader failed")??;
    if !exit.success() {
        let message = String::from_utf8_lossy(&err);
        // Remote operations are not exposed yet. Avoid propagating credential
        // URLs printed by configured hooks/helpers into the webview.
        let redacted = message.split_inclusive(char::is_whitespace).map(|word| {
            if word.contains("://") { "[URL redacted] ".to_string() } else { word.to_string() }
        }).collect::<String>();
        return Err(if err_truncated { format!("{redacted}\nGit error output truncated.") }
            else if redacted.trim().is_empty() { format!("Git exited with {exit}.") } else { redacted });
    }
    if out_truncated { return Err("Git output exceeds the 2 MiB safety limit. Use the repository terminal.".into()); }
    Ok(out)
}

pub(super) fn text(root: &Path, args: &[&str]) -> Result<String, String> {
    String::from_utf8(run(root, args)?).map_err(|_| "Git output contains non-UTF-8 names; use the terminal for this repository.".into())
}
