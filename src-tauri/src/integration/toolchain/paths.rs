use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::{OnceLock, RwLock},
};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToolPaths {
    pub go: String,
    pub gopls: String,
    pub dlv: String,
}
fn store() -> &'static RwLock<ToolPaths> {
    static PATHS: OnceLock<RwLock<ToolPaths>> = OnceLock::new();
    PATHS.get_or_init(Default::default)
}
pub fn current() -> ToolPaths {
    store()
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}
impl ToolPaths {
    pub fn executable(&self, program: &str) -> Option<PathBuf> {
        let value = match program {
            "go" => &self.go,
            "gopls" => &self.gopls,
            "dlv" => &self.dlv,
            _ => return None,
        };
        (!value.is_empty()).then(|| PathBuf::from(value))
    }
}
fn validated_path(value: &str, program: &str) -> Result<String, String> {
    if value.trim().is_empty() {
        return Ok(String::new());
    }
    if value.len() > 4096 || value.contains('\0') || !Path::new(value).is_absolute() {
        return Err(format!(
            "{program} path must be an absolute executable path, at most 4096 bytes."
        ));
    }
    let path = Path::new(value)
        .canonicalize()
        .map_err(|error| format!("Cannot resolve {program} executable: {error}"))?;
    let metadata = path
        .metadata()
        .map_err(|error| format!("Cannot inspect {program} executable: {error}"))?;
    if !metadata.is_file() {
        return Err(format!(
            "{program} path must name a regular executable file."
        ));
    }
    #[cfg(windows)]
    if !path
        .extension()
        .is_some_and(|extension| extension.to_string_lossy().eq_ignore_ascii_case("exe"))
    {
        return Err(format!(
            "{program} must be an .exe executable; shell scripts are not supported."
        ));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o111 == 0 {
            return Err(format!("{program} file has no executable permission."));
        }
    }
    if program == "go" {
        if !path.file_name().is_some_and(|name| {
            name.to_string_lossy()
                .eq_ignore_ascii_case(if cfg!(windows) { "go.exe" } else { "go" })
        }) {
            return Err("Go path must name go/go.exe so gopls and Delve can find the selected Go toolchain.".into());
        }
        let mut directories = vec![path
            .parent()
            .ok_or("Go executable has no parent directory.")?
            .to_path_buf()];
        directories.extend(std::env::split_paths(
            &std::env::var_os("PATH").unwrap_or_default(),
        ));
        std::env::join_paths(directories).map_err(|error| {
            format!("Selected Go directory cannot be represented in PATH: {error}")
        })?;
    }
    Ok(path.to_string_lossy().into_owned())
}
pub fn validate(paths: ToolPaths) -> Result<ToolPaths, String> {
    Ok(ToolPaths {
        go: validated_path(&paths.go, "go")?,
        gopls: validated_path(&paths.gopls, "gopls")?,
        dlv: validated_path(&paths.dlv, "dlv")?,
    })
}
pub fn install(paths: ToolPaths) -> Result<ToolPaths, String> {
    let paths = validate(paths)?;
    if current() == paths {
        return Ok(paths);
    }
    let session = crate::integration::lsp_manager::get_lsp_session();
    let mut guard = session
        .try_lock()
        .map_err(|_| "Wait for the current language operation before changing tool paths.")?;
    if let Some(session) = guard.as_mut() {
        session
            .stop()
            .map_err(|error| format!("Cannot stop the previous gopls session: {error:#}"))?;
    }
    guard.take();
    *store()
        .write()
        .map_err(|_| "Tool configuration is unavailable.")? = paths.clone();
    Ok(paths)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths_require_real_absolute_executables_and_keep_defaults_explicit() {
        assert_eq!(
            validate(ToolPaths::default()).unwrap(),
            ToolPaths::default()
        );
        for bad in [
            "relative.exe".into(),
            std::env::temp_dir().to_string_lossy().into_owned(),
            "bad\0path".into(),
        ] {
            assert!(validate(ToolPaths {
                gopls: bad,
                ..Default::default()
            })
            .is_err());
        }
        let go = crate::integration::command::resolved_program("go");
        if go.is_absolute() {
            let validated = validate(ToolPaths {
                go: go.to_string_lossy().into_owned(),
                ..Default::default()
            })
            .unwrap();
            assert_eq!(Path::new(&validated.go), go);
        }
    }
    #[test]
    #[ignore = "requires installed Go; temporarily configures the native tool service"]
    fn selected_go_path_is_used_by_launches_and_child_tool_environment() {
        struct Restore(ToolPaths);
        impl Drop for Restore {
            fn drop(&mut self) {
                install(self.0.clone()).expect("restore tool configuration");
            }
        }
        let _restore = Restore(current());
        let go = crate::integration::command::resolved_program("go");
        assert!(go.is_absolute());
        let installed = install(ToolPaths {
            go: go.to_string_lossy().into_owned(),
            ..Default::default()
        })
        .unwrap();
        let command = crate::integration::command::std_command("go");
        assert_eq!(command.get_program(), std::ffi::OsStr::new(&installed.go));
        let child_path = command
            .get_envs()
            .find(|(key, _)| *key == "PATH")
            .unwrap()
            .1
            .unwrap();
        assert_eq!(
            std::env::split_paths(child_path).next().unwrap(),
            crate::integration::gopls::normalize_platform_pathbuf(
                go.parent().unwrap().to_path_buf()
            )
        );
        assert!(super::super::probe("go", &["version"]).available);
    }
}
