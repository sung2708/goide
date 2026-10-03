//! Explicit module commands use native argument vectors and retain process ownership.
use super::{directory, normalize_platform_pathbuf};
use crate::integration::{command, language_requests, owned_tool_output};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::Duration,
};
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    Tidy,
    Download,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub workspace_root: String,
    pub relative_directory: String,
    pub request_id: String,
    pub action: Action,
    pub expected_work_file: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Output {
    pub action: Action,
    pub directory: String,
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}
fn go_json(directory: &Path, args: &[&str]) -> Result<Value> {
    // GOFLAGS may redirect module writes through -modfile. These actions have a fixed interface.
    let output = owned_tool_output::output(
        command::std_command("go")
            .current_dir(directory)
            .env("GOFLAGS", "")
            .args(args),
        None,
    )?;
    if !output.status.success() {
        return Err(anyhow!(
            "Go module context failed: {}",
            String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(4096)
                .collect::<String>()
        ));
    }
    serde_json::from_slice(&output.stdout).context("Go returned invalid module context JSON")
}
fn writable_manifest(root: &Path, path: &Path) -> Result<()> {
    let parent = normalize_platform_pathbuf(
        path.parent()
            .ok_or_else(|| anyhow!("Manifest has no parent"))?
            .canonicalize()?,
    );
    if !parent.starts_with(root) {
        return Err(anyhow!("Module output would escape the opened workspace."));
    }
    match std::fs::symlink_metadata(path) {
        Ok(metadata)
            if metadata.file_type().is_symlink()
                || !metadata.is_file()
                || metadata.permissions().readonly() =>
        {
            Err(anyhow!(
                "Module output is a symlink, non-file or read-only: {}",
                path.display()
            ))
        }
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}
fn work_file(value: &str) -> Result<Option<PathBuf>> {
    if value.is_empty() || value == "off" {
        return Ok(None);
    }
    Ok(Some(normalize_platform_pathbuf(
        Path::new(value).canonicalize()?,
    )))
}
pub fn run(request: Request) -> Result<Output> {
    let root = normalize_platform_pathbuf(Path::new(&request.workspace_root).canonicalize()?);
    let directory = directory(&root, &request.relative_directory)?;
    let _scope = language_requests::begin_with_timeout(
        &root,
        Some(&request.request_id),
        Duration::from_secs(180),
    )?;
    static OPERATIONS: OnceLock<Mutex<()>> = OnceLock::new();
    let _operation = language_requests::lock(OPERATIONS.get_or_init(Default::default))?;
    let context = go_json(&directory, &["env", "-json", "GOMOD", "GOWORK"])?;
    let work = work_file(
        context["GOWORK"]
            .as_str()
            .ok_or_else(|| anyhow!("Go omitted GOWORK"))?,
    )?;
    let expected = request
        .expected_work_file
        .as_deref()
        .map(work_file)
        .transpose()?
        .flatten();
    if work != expected {
        return Err(anyhow!(
            "Go workspace selection changed. Refresh project inspection and retry."
        ));
    }
    if let Some(work) = &work {
        if !work.starts_with(&root) {
            return Err(anyhow!(
                "Module commands cannot use a go.work outside the opened workspace."
            ));
        }
        writable_manifest(&root, work)?;
        let mut sum = work.as_os_str().to_os_string();
        sum.push(".sum");
        writable_manifest(&root, Path::new(&sum))?;
    }
    let manifest = directory.join("go.mod");
    let selected = context["GOMOD"]
        .as_str()
        .and_then(super::selected_file)
        .map(PathBuf::from);
    if request.action == Action::Tidy || work.is_none() {
        let selected = selected.ok_or_else(|| {
            anyhow!("Select a module directory containing go.mod before running this action.")
        })?;
        let selected = normalize_platform_pathbuf(selected.canonicalize()?);
        let target = normalize_platform_pathbuf(
            manifest
                .canonicalize()
                .context("Selected directory has no go.mod")?,
        );
        if selected != target || !target.starts_with(&root) {
            return Err(anyhow!(
                "Module command must target the selected module inside the workspace."
            ));
        }
        writable_manifest(&root, &manifest)?;
        writable_manifest(&root, &directory.join("go.sum"))?;
    }
    if request.action == Action::Download {
        if let Some(work) = &work {
            let json = go_json(
                &directory,
                &["work", "edit", "-json", &work.to_string_lossy()],
            )?;
            let uses = json["Use"]
                .as_array()
                .ok_or_else(|| anyhow!("Go workspace has no module members"))?;
            if uses.is_empty() || uses.len() > 128 {
                return Err(anyhow!(
                    "Download requires between 1 and 128 scoped workspace modules."
                ));
            }
            for entry in uses {
                language_requests::check()?;
                let member = entry["DiskPath"]
                    .as_str()
                    .ok_or_else(|| anyhow!("Invalid workspace member"))?;
                let member =
                    normalize_platform_pathbuf(work.parent().unwrap().join(member).canonicalize()?);
                if !member.starts_with(&root) {
                    return Err(anyhow!("Workspace download includes modules outside the opened workspace; open their common parent first."));
                }
                for file in ["go.mod", "go.sum"] {
                    writable_manifest(&root, &member.join(file))?;
                }
            }
        }
    }
    language_requests::check()?;
    let action = if request.action == Action::Tidy {
        "tidy"
    } else {
        "download"
    };
    let mut command = command::std_command("go");
    command
        .current_dir(&directory)
        .env("GOFLAGS", "")
        .env(
            "GOWORK",
            work.as_ref().map_or_else(
                || std::ffi::OsString::from("off"),
                |file| file.as_os_str().to_owned(),
            ),
        )
        .args(["mod", action]);
    let output = owned_tool_output::output_with_timeout(&mut command, Duration::from_secs(180))?;
    Ok(Output {
        action: request.action,
        directory: directory.to_string_lossy().into_owned(),
        success: output.status.success(),
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_pre_cancelled_module_action_never_launches_go() {
        let root = normalize_platform_pathbuf(std::env::temp_dir().canonicalize().unwrap());
        let id = uuid::Uuid::new_v4().to_string();
        language_requests::cancel(&root, &id).unwrap();
        let result = run(Request {
            workspace_root: root.to_string_lossy().into_owned(),
            relative_directory: ".".into(),
            request_id: id,
            action: Action::Tidy,
            expected_work_file: None,
        });
        assert!(result.unwrap_err().to_string().contains("cancelled"));
    }
    #[test]
    #[ignore = "requires installed Go; mutates only a local fixture without external dependencies"]
    fn actual_tidy_download_and_stale_workspace_checks_use_owned_go_commands() {
        let root =
            std::env::temp_dir().join(format!("goide-module-actions-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("unused")).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(root.clone());
        std::fs::write(root.join("go.mod"), "module example.test/main\n\ngo 1.21\n\nrequire example.test/unused v0.0.0\nreplace example.test/unused => ./unused\n").unwrap();
        std::fs::write(
            root.join("unused/go.mod"),
            "module example.test/unused\n\ngo 1.21\n",
        )
        .unwrap();
        std::fs::write(
            root.join("main.go"),
            "package main\nimport \"fmt\"\nfunc main() { fmt.Println(\"local fixture\") }\n",
        )
        .unwrap();
        let request = |action| Request {
            workspace_root: root.to_string_lossy().into_owned(),
            relative_directory: ".".into(),
            request_id: uuid::Uuid::new_v4().to_string(),
            action,
            expected_work_file: None,
        };
        let output = run(request(Action::Tidy)).unwrap();
        assert!(output.success, "{output:?}");
        assert!(!std::fs::read_to_string(root.join("go.mod"))
            .unwrap()
            .contains("require example.test/unused"));
        assert!(run(request(Action::Download)).unwrap().success);
        let baseline = std::fs::read(root.join("go.mod")).unwrap();
        std::fs::write(root.join("go.work"), "go 1.21\nuse .\n").unwrap();
        let error = run(request(Action::Tidy)).unwrap_err();
        assert!(error.to_string().contains("workspace selection changed"));
        assert_eq!(std::fs::read(root.join("go.mod")).unwrap(), baseline);
        let mut download = request(Action::Download);
        download.expected_work_file = Some(root.join("go.work").to_string_lossy().into_owned());
        assert!(run(download).unwrap().success);
        std::fs::create_dir(root.join("opened")).unwrap();
        std::fs::write(root.join("opened/go.work"), "go 1.21\nuse ../unused\n").unwrap();
        let outside = run(Request {
            workspace_root: root.join("opened").to_string_lossy().into_owned(),
            relative_directory: ".".into(),
            request_id: uuid::Uuid::new_v4().to_string(),
            action: Action::Download,
            expected_work_file: Some(root.join("opened/go.work").to_string_lossy().into_owned()),
        })
        .unwrap_err();
        assert!(outside.to_string().contains("outside the opened workspace"));
    }
    #[test]
    fn module_outputs_reject_outside_and_non_file_targets() {
        let root = normalize_platform_pathbuf(std::env::temp_dir().canonicalize().unwrap());
        assert!(writable_manifest(&root, &root).is_err());
        assert!(
            writable_manifest(&root.join("missing-scoped-root"), &root.join("go.sum")).is_err()
        );
        assert!(serde_json::from_str::<Request>(r#"{"workspaceRoot":"x","relativeDirectory":".","requestId":"x","action":"shell","expectedWorkFile":null}"#).is_err());
    }
}
