#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(windows)]
use std::env;
use std::path::PathBuf;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
fn resolve_windows_go_tool(program: &str) -> PathBuf {
    let executable = if program.ends_with(".exe") {
        program.to_string()
    } else {
        format!("{program}.exe")
    };

    if let Ok(gobin) = env::var("GOBIN") {
        let candidate = PathBuf::from(&gobin).join(&executable);
        if candidate.exists() {
            return candidate;
        }
    }

    if let Ok(gopath) = env::var("GOPATH") {
        let candidate = PathBuf::from(&gopath).join("bin").join(&executable);
        if candidate.exists() {
            return candidate;
        }
    }

    if let Ok(user_profile) = env::var("USERPROFILE") {
        let candidate = PathBuf::from(&user_profile).join("go").join("bin").join(&executable);
        if candidate.exists() {
            return candidate;
        }
    }

    PathBuf::from(program)
}

pub fn std_command(program: &str) -> std::process::Command {
    #[cfg(windows)]
    let mut command = std::process::Command::new(resolve_windows_go_tool(program));
    #[cfg(not(windows))]
    let mut command = std::process::Command::new(program);
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

pub fn tokio_command(program: &str) -> tokio::process::Command {
    #[cfg(windows)]
    let mut command = tokio::process::Command::new(resolve_windows_go_tool(program));
    #[cfg(not(windows))]
    let mut command = tokio::process::Command::new(program);
    #[cfg(windows)]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}
