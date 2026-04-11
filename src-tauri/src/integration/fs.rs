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

pub fn write_file(workspace_root: &str, relative_path: &str, content: &str) -> Result<()> {
    if relative_path.trim().is_empty() {
        return Err(anyhow!("relative path is required"));
    }

    let root = canonicalize_root(workspace_root)?;

    // Build the raw target path — the file may not exist yet, so we cannot
    // canonicalize it directly. Instead we canonicalize the *parent* directory
    // (which must exist) and then append the filename component. This preserves
    // the workspace-scope guarantee while allowing new-file creation.
    let raw_target = root.join(relative_path);
    let parent = raw_target
        .parent()
        .ok_or_else(|| anyhow!("path has no parent directory"))?;
    let canonical_parent = parent
        .canonicalize()
        .with_context(|| format!("parent directory does not exist: {}", parent.display()))?;

    if !canonical_parent.starts_with(&root) {
        return Err(anyhow!("path escapes workspace root"));
    }

    let file_name = raw_target
        .file_name()
        .ok_or_else(|| anyhow!("path has no filename component"))?;
    let target = canonical_parent.join(file_name);

    fs::write(&target, content)
        .with_context(|| format!("failed to write file: {}", target.display()))
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

    #[test]
    fn writes_file_inside_root() {
        let temp_dir = std::env::temp_dir().join("goide_test_write_file");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let file_path = temp_dir.join("main.go");
        fs::write(&file_path, "package main").unwrap();

        let root = temp_dir.to_string_lossy().to_string();
        write_file(&root, "main.go", "package main\n\nfunc main() {}").unwrap();

        let content = fs::read_to_string(&file_path).unwrap();
        assert!(content.contains("func main()"));
    }

    #[test]
    fn write_file_creates_new_file() {
        let temp_dir = std::env::temp_dir().join("goide_test_write_new_file");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        // File does NOT exist before write_file is called
        let root = temp_dir.to_string_lossy().to_string();
        write_file(&root, "new.go", "package main").unwrap();

        let content = fs::read_to_string(temp_dir.join("new.go")).unwrap();
        assert_eq!(content, "package main");
    }

    #[test]
    fn write_file_rejects_directory_target() {
        let temp_dir = std::env::temp_dir().join("goide_test_write_dir");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let subdir = temp_dir.join("subpkg");
        fs::create_dir_all(&subdir).unwrap();

        let root = temp_dir.to_string_lossy().to_string();
        let result = write_file(&root, "subpkg", "oops");
        assert!(result.is_err());
    }

    #[test]
    fn write_file_rejects_path_escape() {
        let temp_dir = std::env::temp_dir().join("goide_test_write_escape");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let root = temp_dir.to_string_lossy().to_string();
        // Must fail because ".." escapes the workspace root
        let result = write_file(&root, "../escaped.go", "bad");
        assert!(result.is_err());
    }
}
