#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    env,
    path::{Path, PathBuf},
};

fn candidate(directory: &Path, program: &str) -> Option<PathBuf> {
    #[cfg(windows)]
    let program = if program.to_ascii_lowercase().ends_with(".exe") {
        program.to_string()
    } else {
        format!("{program}.exe")
    };
    let path = directory.join(program);
    if !path.is_file() {
        return None;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if path.metadata().ok()?.permissions().mode() & 0o111 == 0 {
            return None;
        }
    }
    path.canonicalize().ok()
}

/// Resolve tool probes and launches through the same concrete executable.
/// PATH takes precedence; Go-installed tool directories are explicit fallbacks.
pub fn resolved_program(program: &str) -> PathBuf {
    let path = Path::new(program);
    if path.is_absolute() || path.components().count() > 1 {
        return path.canonicalize().unwrap_or_else(|_| path.into());
    }
    if let Some(search) = env::var_os("PATH") {
        for directory in env::split_paths(&search).filter(|directory| directory.is_absolute()) {
            if let Some(path) = candidate(&directory, program) {
                return path;
            }
        }
    }
    if matches!(program, "go" | "gopls" | "dlv") {
        let mut directories = Vec::new();
        if let Some(gobin) = env::var_os("GOBIN") {
            directories.push(PathBuf::from(gobin));
        }
        if let Some(gopath) = env::var_os("GOPATH") {
            directories.extend(env::split_paths(&gopath).map(|path| path.join("bin")));
        }
        let user_directory = env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" });
        if let Some(user_directory) = user_directory {
            directories.push(PathBuf::from(user_directory).join("go").join("bin"));
        }
        for directory in directories
            .into_iter()
            .filter(|directory| directory.is_absolute())
        {
            if let Some(path) = candidate(&directory, program) {
                return path;
            }
        }
    }
    path.into()
}

pub fn std_command(program: &str) -> std::process::Command {
    #[allow(unused_mut)]
    let mut command = std::process::Command::new(resolved_program(program));
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

pub fn tokio_command(program: &str) -> tokio::process::Command {
    #[allow(unused_mut)]
    let mut command = tokio::process::Command::new(resolved_program(program));
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}
