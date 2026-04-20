use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
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

    let mut target_exists = false;
    let mut target_permissions: Option<fs::Permissions> = None;
    match fs::symlink_metadata(&target) {
        Ok(metadata) => {
            target_exists = true;
            target_permissions = Some(metadata.permissions());
            if metadata.file_type().is_symlink() {
                return Err(anyhow!("refusing to write through symlink target"));
            }
            if metadata.is_dir() {
                return Err(anyhow!("path is not a file"));
            }

            let canonical_target = target
                .canonicalize()
                .with_context(|| format!("failed to resolve target path: {}", target.display()))?;
            if !canonical_target.starts_with(&root) {
                return Err(anyhow!("path escapes workspace root"));
            }
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {
            // Creating a new file at this path is allowed.
        }
        Err(error) => {
            return Err(error)
                .with_context(|| format!("failed to read metadata: {}", target.display()));
        }
    }

    write_file_atomic(&target, content, target_exists, target_permissions)
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

    fs::read_to_string(&target)
        .with_context(|| format!("failed to read file: {}", target.display()))
}

pub fn create_file(workspace_root: &str, relative_path: &str, content: &str) -> Result<()> {
    if relative_path.trim().is_empty() {
        return Err(anyhow!("relative path is required"));
    }

    let root = canonicalize_root(workspace_root)?;
    let target = resolve_scoped_create_target(&root, relative_path)?;
    if target.exists() {
        return Err(anyhow!("path already exists"));
    }

    let parent = target
        .parent()
        .ok_or_else(|| anyhow!("path has no parent directory"))?;
    fs::create_dir_all(parent)
        .with_context(|| format!("failed to create parent directories: {}", parent.display()))?;

    let mut file = fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&target)
        .with_context(|| format!("failed to create file: {}", target.display()))?;
    file.write_all(content.as_bytes())
        .with_context(|| format!("failed to write file: {}", target.display()))?;
    file.sync_all()
        .with_context(|| format!("failed to flush file: {}", target.display()))?;
    Ok(())
}

pub fn create_folder(workspace_root: &str, relative_path: &str) -> Result<()> {
    if relative_path.trim().is_empty() {
        return Err(anyhow!("relative path is required"));
    }

    let root = canonicalize_root(workspace_root)?;
    let target = resolve_scoped_create_target(&root, relative_path)?;
    if target.exists() {
        return Err(anyhow!("path already exists"));
    }

    fs::create_dir_all(&target)
        .with_context(|| format!("failed to create folder: {}", target.display()))?;
    Ok(())
}

pub fn delete_entry(workspace_root: &str, relative_path: &str) -> Result<()> {
    if relative_path.trim().is_empty() {
        return Err(anyhow!("relative path is required"));
    }

    let root = canonicalize_root(workspace_root)?;
    let target = resolve_scoped_path(&root, Some(relative_path))?;
    let metadata = fs::symlink_metadata(&target)
        .with_context(|| format!("failed to read metadata: {}", target.display()))?;

    if metadata.is_dir() {
        fs::remove_dir_all(&target)
            .with_context(|| format!("failed to remove folder: {}", target.display()))?;
    } else {
        fs::remove_file(&target)
            .with_context(|| format!("failed to remove file: {}", target.display()))?;
    }
    Ok(())
}

pub fn rename_entry(workspace_root: &str, relative_path: &str, new_name: &str) -> Result<String> {
    if relative_path.trim().is_empty() {
        return Err(anyhow!("relative path is required"));
    }

    let trimmed_name = new_name.trim();
    if trimmed_name.is_empty() {
        return Err(anyhow!("new name is required"));
    }
    if trimmed_name.contains('/') || trimmed_name.contains('\\') {
        return Err(anyhow!("new name must not contain path separators"));
    }
    if trimmed_name == "." || trimmed_name == ".." {
        return Err(anyhow!("invalid new name"));
    }

    let root = canonicalize_root(workspace_root)?;
    let source = resolve_scoped_path(&root, Some(relative_path))?;
    let parent = source
        .parent()
        .ok_or_else(|| anyhow!("source has no parent directory"))?;
    let destination = parent.join(trimmed_name);
    if destination.exists() {
        return Err(anyhow!("destination already exists"));
    }

    fs::rename(&source, &destination).with_context(|| {
        format!(
            "failed to rename entry from {} to {}",
            source.display(),
            destination.display()
        )
    })?;

    let relative = destination
        .strip_prefix(&root)
        .unwrap_or(&destination)
        .to_string_lossy()
        .replace('\\', "/");
    Ok(relative)
}

pub fn move_entry(
    workspace_root: &str,
    relative_path: &str,
    destination_relative_path: &str,
) -> Result<String> {
    if relative_path.trim().is_empty() || destination_relative_path.trim().is_empty() {
        return Err(anyhow!("source and destination paths are required"));
    }

    let root = canonicalize_root(workspace_root)?;
    let source = resolve_scoped_path(&root, Some(relative_path))?;
    let destination = resolve_scoped_create_target(&root, destination_relative_path)?;
    if destination.exists() {
        return Err(anyhow!("destination already exists"));
    }

    let source_metadata = fs::symlink_metadata(&source)
        .with_context(|| format!("failed to read metadata: {}", source.display()))?;
    if source_metadata.is_dir() && destination.starts_with(&source) {
        return Err(anyhow!("cannot move a folder into itself"));
    }

    let parent = destination
        .parent()
        .ok_or_else(|| anyhow!("destination has no parent directory"))?;
    fs::create_dir_all(parent).with_context(|| {
        format!(
            "failed to create destination parent directories: {}",
            parent.display()
        )
    })?;

    fs::rename(&source, &destination).with_context(|| {
        format!(
            "failed to move entry from {} to {}",
            source.display(),
            destination.display()
        )
    })?;

    let relative = destination
        .strip_prefix(&root)
        .unwrap_or(&destination)
        .to_string_lossy()
        .replace('\\', "/");
    Ok(relative)
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

fn resolve_scoped_create_target(root: &Path, relative_path: &str) -> Result<PathBuf> {
    let trimmed = relative_path.trim();
    let candidate = Path::new(trimmed);
    if candidate.is_absolute() {
        return Err(anyhow!("absolute paths are not allowed"));
    }
    if candidate.components().any(|component| {
        matches!(
            component,
            std::path::Component::ParentDir
                | std::path::Component::RootDir
                | std::path::Component::Prefix(_)
        )
    }) {
        return Err(anyhow!("path escapes workspace root"));
    }

    let target = root.join(candidate);
    let parent = target
        .parent()
        .ok_or_else(|| anyhow!("path has no parent directory"))?;

    let mut probe = parent.to_path_buf();
    while !probe.exists() {
        probe = probe
            .parent()
            .ok_or_else(|| anyhow!("path escapes workspace root"))?
            .to_path_buf();
    }
    let canonical_probe = probe
        .canonicalize()
        .with_context(|| format!("failed to resolve parent path: {}", probe.display()))?;
    if !canonical_probe.starts_with(root) {
        return Err(anyhow!("path escapes workspace root"));
    }

    Ok(target)
}

fn write_file_atomic(
    target: &Path,
    content: &str,
    target_exists: bool,
    target_permissions: Option<fs::Permissions>,
) -> Result<()> {
    let parent = target
        .parent()
        .ok_or_else(|| anyhow!("path has no parent directory"))?;
    let base_name = target
        .file_name()
        .ok_or_else(|| anyhow!("path has no filename component"))?
        .to_string_lossy();

    let mut temp_path: Option<PathBuf> = None;
    for attempt in 0..16 {
        let now_nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let candidate = parent.join(format!(
            ".{}.{}.{}.tmp",
            base_name,
            std::process::id(),
            now_nanos + attempt
        ));

        match fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&candidate)
        {
            Ok(mut temp_file) => {
                temp_file.write_all(content.as_bytes()).with_context(|| {
                    format!("failed to write temp file: {}", candidate.display())
                })?;
                temp_file.sync_all().with_context(|| {
                    format!("failed to sync temp file: {}", candidate.display())
                })?;
                if let Some(permissions) = target_permissions.clone() {
                    fs::set_permissions(&candidate, permissions).with_context(|| {
                        format!(
                            "failed to set permissions on temp file: {}",
                            candidate.display()
                        )
                    })?;
                }
                temp_path = Some(candidate);
                break;
            }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(error).with_context(|| {
                    format!("failed to create temp file in: {}", parent.display())
                });
            }
        }
    }

    let temp_path =
        temp_path.ok_or_else(|| anyhow!("failed to allocate unique temp file for atomic write"))?;

    let replace_result = if target_exists {
        replace_existing_file(&temp_path, target)
    } else {
        fs::rename(&temp_path, target)
    };

    if let Err(error) = replace_result {
        let _ = fs::remove_file(&temp_path);
        return Err(error).with_context(|| {
            format!(
                "failed to atomically replace {} with {}",
                target.display(),
                temp_path.display()
            )
        });
    }

    Ok(())
}

#[cfg(windows)]
fn replace_existing_file(temp_path: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::{null, null_mut};

    #[link(name = "Kernel32")]
    extern "system" {
        fn ReplaceFileW(
            lpReplacedFileName: *const u16,
            lpReplacementFileName: *const u16,
            lpBackupFileName: *const u16,
            dwReplaceFlags: u32,
            lpExclude: *mut core::ffi::c_void,
            lpReserved: *mut core::ffi::c_void,
        ) -> i32;

        fn MoveFileExW(
            lpExistingFileName: *const u16,
            lpNewFileName: *const u16,
            dwFlags: u32,
        ) -> i32;
    }

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;

    let target_wide: Vec<u16> = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let temp_wide: Vec<u16> = temp_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let success = unsafe {
        ReplaceFileW(
            target_wide.as_ptr(),
            temp_wide.as_ptr(),
            null(),
            0,
            null_mut(),
            null_mut(),
        )
    };

    if success != 0 {
        return Ok(());
    }

    let replace_error = std::io::Error::last_os_error();

    // Some Windows environments deny ReplaceFileW for files under extended-length
    // canonical paths. MoveFileExW with replace semantics gives the same
    // workspace-scoped replacement behavior for normal files and keeps saves usable.
    let move_success = unsafe {
        MoveFileExW(
            temp_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };

    if move_success != 0 {
        return Ok(());
    }

    let move_error = std::io::Error::last_os_error();
    Err(std::io::Error::new(
        move_error.kind(),
        format!("ReplaceFileW failed: {replace_error}; MoveFileExW failed: {move_error}"),
    ))
}

#[cfg(not(windows))]
fn replace_existing_file(temp_path: &Path, target: &Path) -> std::io::Result<()> {
    fs::rename(temp_path, target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[cfg(unix)]
    use std::os::unix::fs::PermissionsExt;

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

    #[cfg(unix)]
    #[test]
    fn write_file_rejects_symlink_escape_target() {
        use std::os::unix::fs::symlink;

        let temp_dir = std::env::temp_dir().join("goide_test_write_symlink_escape");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let outside = std::env::temp_dir().join("goide_test_write_symlink_escape_outside.go");
        fs::write(&outside, "before").unwrap();

        let link = temp_dir.join("link.go");
        symlink(&outside, &link).unwrap();

        let root = temp_dir.to_string_lossy().to_string();
        let result = write_file(&root, "link.go", "after");
        assert!(result.is_err());

        let outside_content = fs::read_to_string(&outside).unwrap();
        assert_eq!(outside_content, "before");
    }

    #[cfg(unix)]
    #[test]
    fn write_file_preserves_existing_file_mode() {
        let temp_dir = std::env::temp_dir().join("goide_test_write_preserve_mode");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let file_path = temp_dir.join("script.sh");
        fs::write(&file_path, "#!/bin/sh\necho hi\n").unwrap();
        fs::set_permissions(&file_path, fs::Permissions::from_mode(0o755)).unwrap();

        let root = temp_dir.to_string_lossy().to_string();
        write_file(&root, "script.sh", "#!/bin/sh\necho bye\n").unwrap();

        let mode = fs::metadata(&file_path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o755);
    }
}
