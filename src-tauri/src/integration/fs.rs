use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub fn list_directory(workspace_root: &str, relative_path: Option<&str>) -> Result<Vec<FsEntry>> {
    let root = canonicalize_root(workspace_root)?;
    let target = resolve_scoped_path(&root, relative_path)?;

    let read_dir = fs::read_dir(&target)
        .with_context(|| format!("failed to read directory: {}", target.display()))?;

    let mut entries = Vec::new();
    for entry in read_dir {
        let entry = entry?;
        let metadata = entry.metadata()?;
        let file_type = metadata.file_type();
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();
        let entry_path = entry.path();
        let relative = entry_path
            .strip_prefix(&root)
            .unwrap_or(&entry_path)
            .to_string_lossy()
            .to_string();

        entries.push(FsEntry {
            name,
            path: relative,
            is_dir: file_type.is_dir(),
        });
    }

    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

pub fn read_file(workspace_root: &str, relative_path: &str) -> Result<String> {
    if relative_path.trim().is_empty() {
        return Err(anyhow!("relative path is required"));
    }

    let root = canonicalize_root(workspace_root)?;
    let target = resolve_scoped_path(&root, Some(relative_path))?;

    let metadata = fs::metadata(&target)
        .with_context(|| format!("failed to read metadata: {}", target.display()))?;
    if !metadata.is_file() {
        return Err(anyhow!("path is not a file"));
    }

    fs::read_to_string(&target).with_context(|| format!("failed to read file: {}", target.display()))
}

fn canonicalize_root(root: &str) -> Result<PathBuf> {
    let root_path = Path::new(root);
    let canonical = root_path
        .canonicalize()
        .with_context(|| format!("workspace root does not exist: {}", root_path.display()))?;
    Ok(canonical)
}

fn resolve_scoped_path(root: &Path, relative_path: Option<&str>) -> Result<PathBuf> {
    let target = match relative_path {
        Some(path) if !path.trim().is_empty() => root.join(path),
        _ => root.to_path_buf(),
    };

    let canonical_target = target
        .canonicalize()
        .with_context(|| format!("path does not exist: {}", target.display()))?;

    if !canonical_target.starts_with(root) {
        return Err(anyhow!("path escapes workspace root"));
    }

    Ok(canonical_target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_path_escape() {
        let temp_dir = std::env::temp_dir().join("goide_test_root");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let root = temp_dir.to_string_lossy().to_string();
        let result = resolve_scoped_path(Path::new(&root), Some(".."));
        assert!(result.is_err());
    }

    #[test]
    fn reads_file_inside_root() {
        let temp_dir = std::env::temp_dir().join("goide_test_root_file");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let file_path = temp_dir.join("sample.go");
        fs::write(&file_path, "package main").unwrap();

        let root = temp_dir.to_string_lossy().to_string();
        let content = read_file(&root, "sample.go").unwrap();
        assert!(content.contains("package main"));
    }
}
