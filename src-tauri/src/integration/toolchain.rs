use crate::integration::{command, owned_tool_output};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ToolStatus {
    Ready,
    Missing,
    Failed,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ToolAvailability {
    pub available: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub status: ToolStatus,
    pub error: Option<String>,
}

fn bounded(text: &str) -> String {
    text.chars().take(4096).collect()
}
pub fn probe(program: &str, args: &[&str]) -> ToolAvailability {
    let executable = command::resolved_program(program);
    if !executable.is_absolute() {
        return ToolAvailability {
            available: false,
            version: None,
            path: None,
            status: ToolStatus::Missing,
            error: Some(format!(
                "{program} executable was not found in PATH or the Go tool directories."
            )),
        };
    }
    probe_executable(&executable, args)
}
fn probe_executable(executable: &Path, args: &[&str]) -> ToolAvailability {
    let mut result = ToolAvailability {
        available: false,
        version: None,
        path: Some(executable.to_string_lossy().into_owned()),
        status: ToolStatus::Failed,
        error: None,
    };
    let mut command = command::std_command(&executable.to_string_lossy());
    match owned_tool_output::output(command.args(args), None) {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            if !output.status.success() {
                result.error = Some(bounded(&format!(
                    "Version probe exited with {}. {} {}",
                    output.status,
                    stderr.trim(),
                    stdout.trim()
                )));
                return result;
            }
            let version = stdout
                .lines()
                .chain(stderr.lines())
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .take(32)
                .collect::<Vec<_>>()
                .join("\n");
            result.version = (!version.is_empty()).then(|| bounded(&version));
            if result.version.is_some() {
                result.available = true;
                result.status = ToolStatus::Ready;
            } else {
                result.status = ToolStatus::Unknown;
                result.error = Some(
                    "Version command returned no version text; compatibility is unverified.".into(),
                );
            }
        }
        Err(error) => result.error = Some(bounded(&error.to_string())),
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_and_failed_executables_are_distinct_and_keep_actual_errors() {
        let missing = probe("goide-nonexistent-probe-44cd", &["version"]);
        assert_eq!(missing.status, ToolStatus::Missing);
        assert_eq!(serde_json::to_value(&missing).unwrap()["status"], "missing");
        assert!(missing.path.is_none());
        assert!(!missing.available);
        let failed = probe_executable(
            &std::env::temp_dir().join("goide-nonexistent-probe-44cd.exe"),
            &["version"],
        );
        assert_eq!(failed.status, ToolStatus::Failed);
        assert!(failed.path.is_some());
        assert!(failed.error.is_some());
        assert!(!failed.available);
    }
    #[test]
    #[ignore = "requires an installed Go toolchain"]
    fn real_go_probe_reports_the_executable_used_and_actual_version() {
        let status = probe("go", &["version"]);
        assert!(status.available, "{status:?}");
        assert_eq!(status.status, ToolStatus::Ready);
        assert!(Path::new(status.path.as_ref().unwrap()).is_absolute());
        assert!(status.version.unwrap().starts_with("go version"));
        assert!(status.error.is_none());
    }
    #[test]
    #[ignore = "requires installed gopls and Delve"]
    fn real_language_and_debugger_probes_preserve_full_version_output() {
        for program in ["gopls", "dlv"] {
            let status = probe(program, &["version"]);
            assert!(status.available, "{status:?}");
            assert_eq!(status.status, ToolStatus::Ready);
            assert!(Path::new(status.path.as_ref().unwrap()).is_absolute());
            let version = status.version.unwrap();
            assert!(version.len() <= 16384);
            if program == "dlv" {
                assert!(version.contains("Version:"), "{version}");
            } else {
                assert!(version.contains("gopls"), "{version}");
            }
            assert!(status.error.is_none());
        }
    }
}
