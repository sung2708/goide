//! Create a fresh Go module without overwriting an existing directory.
use super::{command, normalize_platform_pathbuf, owned_tool_output};
use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use std::{io::Write, path::Path};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub parent_directory: String,
    pub name: String,
    pub module_path: String,
}

fn validate(request: &Request) -> Result<()> {
    let name = &request.name;
    if name.is_empty()
        || name.len() > 128
        || name == "."
        || name == ".."
        || !name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-_.".contains(&c))
        || name.ends_with('.')
        || name.starts_with('.')
        || matches!(
            name.split('.')
                .next()
                .unwrap_or("")
                .to_ascii_uppercase()
                .as_str(),
            "CON"
                | "PRN"
                | "AUX"
                | "NUL"
                | "COM1"
                | "COM2"
                | "COM3"
                | "COM4"
                | "COM5"
                | "COM6"
                | "COM7"
                | "COM8"
                | "COM9"
                | "LPT1"
                | "LPT2"
                | "LPT3"
                | "LPT4"
                | "LPT5"
                | "LPT6"
                | "LPT7"
                | "LPT8"
                | "LPT9"
        )
    {
        return Err(anyhow!("Use a project folder name with letters, numbers, dots, hyphens or underscores; avoid reserved device names."));
    }
    if request.module_path.is_empty()
        || request.module_path.len() > 512
        || request.module_path.starts_with('-')
        || !request
            .module_path
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"-._~/".contains(&c))
    {
        return Err(anyhow!(
            "Enter a Go module path, for example example.com/myproject."
        ));
    }
    Ok(())
}

pub fn create(request: Request) -> Result<String> {
    validate(&request)?;
    let parent = Path::new(&request.parent_directory);
    if !parent.is_absolute() || request.parent_directory.len() > 8192 {
        return Err(anyhow!("Choose an absolute parent directory."));
    }
    let parent = normalize_platform_pathbuf(
        parent
            .canonicalize()
            .context("Parent directory unavailable")?,
    );
    if !parent.is_dir() {
        return Err(anyhow!("Parent location is not a directory."));
    }
    let target = parent.join(&request.name);
    // create_dir is exclusive: existing folders, files and links are never reused.
    std::fs::create_dir(&target).context("Project folder already exists or cannot be created")?;
    let scaffold = || -> Result<()> {
        let output = owned_tool_output::output(
            command::std_command("go")
                .current_dir(&target)
                .env("GOWORK", "off")
                .env("GOFLAGS", "")
                .env("GO111MODULE", "on")
                .args(["mod", "init", &request.module_path]),
            None,
        )?;
        if !output.status.success() {
            return Err(anyhow!(
                "go mod init failed: {}",
                String::from_utf8_lossy(&output.stderr)
                    .chars()
                    .take(4096)
                    .collect::<String>()
            ));
        }
        std::fs::OpenOptions::new().write(true).create_new(true).open(target.join("main.go"))?
            .write_all(b"package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"Hello, Go!\")\n}\n")?;
        Ok(())
    };
    // Preserve partial work on errors; never recursively remove a user directory.
    scaffold().with_context(|| {
        format!(
            "Project creation did not complete. Inspect {} before retrying",
            target.display()
        )
    })?;
    Ok(target.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_escaping_names_and_existing_directories_without_modifying_files() {
        let root = std::env::temp_dir().join(format!("goro-create-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        std::fs::create_dir(root.join("existing")).unwrap();
        std::fs::write(root.join("existing/main.go"), "preserve").unwrap();
        for name in [
            "../escape",
            "a/b",
            "a\\b",
            "NUL",
            "CON.txt",
            "bad.",
            "existing",
        ] {
            assert!(create(Request {
                parent_directory: root.to_string_lossy().into_owned(),
                name: name.into(),
                module_path: "example.test/app".into()
            })
            .is_err());
        }
        assert_eq!(
            std::fs::read_to_string(root.join("existing/main.go")).unwrap(),
            "preserve"
        );
        std::fs::remove_file(root.join("existing/main.go")).unwrap();
        std::fs::remove_dir(root.join("existing")).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
    #[test]
    #[ignore = "requires installed Go; creates and runs a fresh project"]
    fn creates_a_runnable_module_without_fabricating_a_sum_file() {
        let root = std::env::temp_dir().join(format!("goro-new-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        let path = create(Request {
            parent_directory: root.to_string_lossy().into_owned(),
            name: "hello".into(),
            module_path: "example.test/hello".into(),
        })
        .unwrap();
        assert!(Path::new(&path).join("go.mod").is_file());
        assert!(!Path::new(&path).join("go.sum").exists());
        let output = owned_tool_output::output(
            command::std_command("go")
                .current_dir(&path)
                .env("GOWORK", "off")
                .env("GOFLAGS", "")
                .args(["run", "."]),
            None,
        )
        .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "Hello, Go!");
        for name in ["main.go", "go.mod"] {
            std::fs::remove_file(Path::new(&path).join(name)).unwrap();
        }
        std::fs::remove_dir(path).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}
