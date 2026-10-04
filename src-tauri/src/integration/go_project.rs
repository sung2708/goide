//! Inspect Go's actual module/workspace selection without editing project files.
use super::{command, gopls::normalize_platform_pathbuf, language_requests, owned_tool_output};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    path::{Component, Path, PathBuf},
};

const ENV_KEYS: [&str; 9] = [
    "GOROOT",
    "GOPATH",
    "GOMOD",
    "GOWORK",
    "GOVERSION",
    "GOOS",
    "GOARCH",
    "CGO_ENABLED",
    "GOTOOLCHAIN",
];
pub mod actions;
pub mod create;
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub workspace_root: String,
    pub relative_directory: String,
    pub request_id: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Module {
    pub relative_directory: Option<String>,
    pub directory: String,
    pub mod_file: String,
    pub inside_workspace: bool,
    pub module_path: Option<String>,
    pub go_version: Option<String>,
    pub error: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub directory: String,
    pub mode: String,
    pub work_file: Option<String>,
    pub work_error: Option<String>,
    pub modules: Vec<Module>,
    pub limited: bool,
    pub environment: BTreeMap<String, String>,
}
pub(crate) fn directory(root: &Path, relative: &str) -> Result<PathBuf> {
    if relative.len() > 4096
        || relative.contains('\0')
        || Path::new(relative).components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(anyhow!(
            "Project context must be a relative directory inside the workspace."
        ));
    }
    let target = normalize_platform_pathbuf(
        root.join(relative)
            .canonicalize()
            .context("Project directory unavailable")?,
    );
    if !target.starts_with(root) || !target.is_dir() {
        return Err(anyhow!(
            "Project context is outside the workspace or not a directory."
        ));
    }
    Ok(target)
}
fn json_command(directory: &Path, args: &[&str]) -> Result<Value> {
    language_requests::check()?;
    let output = owned_tool_output::output(
        command::std_command("go").current_dir(directory).args(args),
        None,
    )?;
    if !output.status.success() {
        return Err(anyhow!(
            "Go command exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(4096)
                .collect::<String>()
        ));
    }
    serde_json::from_slice(&output.stdout).context("Go returned invalid JSON")
}
fn selected_file(value: &str) -> Option<&str> {
    (!value.is_empty()
        && value != "/dev/null"
        && !value.eq_ignore_ascii_case("NUL")
        && value != "off")
        .then_some(value)
}
fn module(root: &Path, directory: PathBuf) -> Module {
    let directory = normalize_platform_pathbuf(directory.canonicalize().unwrap_or(directory));
    let mod_file = directory.join("go.mod");
    let mut result = Module {
        relative_directory: directory.strip_prefix(root).ok().map(|path| {
            if path.as_os_str().is_empty() {
                ".".into()
            } else {
                path.to_string_lossy().replace('\\', "/")
            }
        }),
        directory: directory.to_string_lossy().into_owned(),
        mod_file: mod_file.to_string_lossy().into_owned(),
        inside_workspace: false,
        module_path: None,
        go_version: None,
        error: None,
    };
    let scoped = mod_file.canonicalize().map(normalize_platform_pathbuf);
    match scoped {
        Ok(file) if directory.starts_with(root) && file.starts_with(root) && file.is_file() => {
            result.inside_workspace = true;
            match json_command(
                &directory,
                &["mod", "edit", "-json", &file.to_string_lossy()],
            ) {
                Ok(json) => {
                    let path = json.pointer("/Module/Path").and_then(Value::as_str);
                    let version = json.get("Go").and_then(Value::as_str);
                    if path.is_none_or(|path| path.is_empty() || path.len() > 4096)
                        || version.is_some_and(|version| version.len() > 128)
                    {
                        result.error =
                            Some("Module metadata is missing or exceeds its size budget.".into());
                    } else {
                        result.module_path = path.map(str::to_owned);
                        result.go_version = version.map(str::to_owned);
                    }
                }
                Err(error) => result.error = Some(format!("{error:#}")),
            }
        }
        Ok(_) => {
            result.error = Some(
                "Module is outside the opened workspace; its contents were not inspected.".into(),
            )
        }
        Err(error) => result.error = Some(format!("Module file unavailable: {error}")),
    }
    result
}
pub fn inspect(request: Request) -> Result<ProjectInfo> {
    let root = normalize_platform_pathbuf(
        Path::new(&request.workspace_root)
            .canonicalize()
            .context("Workspace unavailable")?,
    );
    if !root.is_dir() {
        return Err(anyhow!("Workspace must be a directory."));
    }
    let directory = directory(&root, &request.relative_directory)?;
    let _scope = language_requests::begin(&root, Some(&request.request_id))?;
    let mut args = vec!["env", "-json"];
    args.extend(ENV_KEYS);
    let json = json_command(&directory, &args)?;
    let environment: BTreeMap<String, String> = ENV_KEYS
        .into_iter()
        .map(|key| {
            let value = json
                .get(key)
                .and_then(Value::as_str)
                .ok_or_else(|| anyhow!("Go environment omitted {key}"))?;
            if value.len() > 16384 {
                return Err(anyhow!(
                    "Go environment field exceeds its size budget: {key}"
                ));
            }
            Ok((key.to_owned(), value.to_owned()))
        })
        .collect::<Result<_>>()?;
    let work_file = selected_file(&environment["GOWORK"]).map(str::to_owned);
    let mod_file = selected_file(&environment["GOMOD"]);
    let mut result = ProjectInfo {
        directory: directory.to_string_lossy().into_owned(),
        mode: if work_file.is_some() {
            "workspace"
        } else if mod_file.is_some() {
            "module"
        } else {
            "directory"
        }
        .into(),
        work_file: work_file.clone(),
        work_error: None,
        modules: Vec::new(),
        limited: false,
        environment: environment.clone(),
    };
    if let Some(work) = work_file {
        let file = normalize_platform_pathbuf(Path::new(&work).canonicalize()?);
        if !file.starts_with(&root) {
            result.work_error = Some("Go selected a go.work outside the opened workspace; its contents were not inspected.".into());
        } else {
            let work = json_command(
                &directory,
                &["work", "edit", "-json", &file.to_string_lossy()],
            )?;
            let uses = work.get("Use").and_then(Value::as_array);
            if let Some(uses) = uses {
                result.limited = uses.len() > 128;
                for entry in uses.iter().take(128) {
                    language_requests::check()?;
                    let path = entry
                        .get("DiskPath")
                        .and_then(Value::as_str)
                        .ok_or_else(|| anyhow!("Go workspace returned an invalid module path"))?;
                    result.modules.push(module(
                        &root,
                        file.parent()
                            .ok_or_else(|| anyhow!("Workspace file has no directory"))?
                            .join(path),
                    ));
                }
            }
        }
    } else if let Some(file) = mod_file {
        result.modules.push(module(
            &root,
            Path::new(file)
                .parent()
                .ok_or_else(|| anyhow!("Module file has no directory"))?
                .to_path_buf(),
        ));
    }
    language_requests::check()?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn external_module_contents_are_not_inspected() {
        let root =
            std::env::temp_dir().join(format!("goide-project-scope-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("opened")).unwrap();
        std::fs::create_dir(root.join("outside")).unwrap();
        std::fs::write(root.join("outside/go.mod"), "invalid module contents").unwrap();
        let opened = normalize_platform_pathbuf(root.join("opened").canonicalize().unwrap());
        let result = module(&opened, root.join("outside"));
        std::fs::remove_dir_all(root).unwrap();
        assert!(!result.inside_workspace);
        assert!(result.module_path.is_none());
        assert!(result
            .error
            .unwrap()
            .contains("outside the opened workspace"));
    }
    #[test]
    fn rejects_parent_absolute_and_file_contexts_and_null_module_sentinels() {
        let root = normalize_platform_pathbuf(std::env::temp_dir().canonicalize().unwrap());
        for path in ["../", "/", "bad\0path"] {
            assert!(directory(&root, path).is_err());
        }
        assert!(directory(&root, ".").is_ok());
        for value in ["", "NUL", "/dev/null", "off"] {
            assert!(selected_file(value).is_none());
        }
    }
    #[test]
    #[ignore = "requires installed Go; reads isolated Go fixture projects"]
    fn actual_go_detects_plain_module_and_multi_module_workspace_without_writes() {
        let root = std::env::temp_dir().join(format!("goide-project-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(root.clone());
        let request = |relative: &str| Request {
            workspace_root: root.to_string_lossy().into_owned(),
            relative_directory: relative.into(),
            request_id: uuid::Uuid::new_v4().to_string(),
        };
        assert_eq!(inspect(request(".")).unwrap().mode, "directory");
        for name in ["a", "b"] {
            std::fs::create_dir(root.join(name)).unwrap();
            std::fs::write(
                root.join(name).join("go.mod"),
                format!("module example.test/{name}\n\ngo 1.21\n"),
            )
            .unwrap();
        }
        let single = inspect(request("a")).unwrap();
        assert_eq!(single.mode, "module");
        assert_eq!(
            single.modules[0].module_path.as_deref(),
            Some("example.test/a")
        );
        let work = "go 1.21\n\nuse (\n ./a\n ./b\n)\n";
        std::fs::write(root.join("go.work"), work).unwrap();
        let workspace = inspect(request("a")).unwrap();
        assert_eq!(workspace.mode, "workspace");
        assert_eq!(workspace.modules.len(), 2);
        assert!(workspace
            .modules
            .iter()
            .all(|module| module.inside_workspace && module.error.is_none()));
        assert_eq!(std::fs::read_to_string(root.join("go.work")).unwrap(), work);
        assert!(!root.join("go.work.sum").exists());
        assert!(!root.join("a/go.sum").exists());
    }
}
