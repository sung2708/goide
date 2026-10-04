//! Optimistic document saves: a known disk baseline is required before replacement.
use super::fs;
use serde::Serialize;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock, Weak},
};

static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>> = OnceLock::new();
/// Export a reviewed buffer without replacing an existing file or changing its baseline.
pub fn export_copy(path: &std::path::Path, content: &str) -> Result<(), String> {
    use std::io::Write;
    if !path.is_absolute() || content.len() > 4 * 1024 * 1024 || content.contains('\0') {
        return Err("Export requires an absolute selected path and text within 4 MiB.".into());
    }
    let parent = path
        .parent()
        .ok_or("Missing export directory")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let name = path.file_name().ok_or("Missing export filename")?;
    let target = parent.join(name);
    let staging = parent.join(format!(".goro-export-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staging)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        drop(file);
        // Same-directory link commits complete bytes and fails if target exists.
        std::fs::hard_link(&staging, &target)
    })();
    let cleanup = std::fs::remove_file(&staging);
    result.map_err(|e| {
        format!("Copy not saved; choose a new filename. Editor text is unchanged: {e}")
    })?;
    cleanup.map_err(|e| format!("Copy saved, but temporary-file cleanup failed: {e}"))?;
    Ok(())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskState {
    pub exists: bool,
    pub content: Option<String>,
}

pub fn disk_state(root: &str, path: &str) -> Result<DiskState, String> {
    if path.is_empty()
        || path.contains('\0')
        || PathBuf::from(path).components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err("Document path must stay relative to the workspace.".into());
    }
    let root = PathBuf::from(root)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let candidate = root.join(path);
    let mut ancestor = candidate.parent().ok_or("Missing file parent")?;
    while !ancestor.exists() {
        ancestor = ancestor.parent().ok_or("Missing existing file ancestor")?;
    }
    let parent = ancestor.canonicalize().map_err(|e| e.to_string())?;
    if !parent.starts_with(&root) {
        return Err("File escapes workspace".into());
    }
    match std::fs::symlink_metadata(&candidate) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(DiskState {
            exists: false,
            content: None,
        }),
        Err(e) => Err(e.to_string()),
        Ok(metadata) if metadata.file_type().is_symlink() => {
            Err("Cannot save through a symbolic link".into())
        }
        Ok(_) => fs::read_file(root.to_str().ok_or("Non-UTF-8 workspace")?, path)
            .map(|content| DiskState {
                exists: true,
                content: Some(content),
            })
            .map_err(|e| e.to_string()),
    }
}

pub fn save(root: &str, path: &str, content: &str, expected: &str) -> Result<(), String> {
    let canonical_root = PathBuf::from(root)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let key = canonical_root.join(path);
    let lock = {
        let mut locks = LOCKS
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| "Document registry unavailable")?;
        locks.retain(|_, lock| lock.strong_count() > 0);
        match locks.get(&key).and_then(Weak::upgrade) {
            Some(lock) => lock,
            None => {
                let lock = Arc::new(Mutex::new(()));
                locks.insert(key, Arc::downgrade(&lock));
                lock
            }
        }
    };
    let _guard = lock.lock().map_err(|_| "Document lock unavailable")?;
    let disk = disk_state(root, path)?;
    if disk.content.as_deref() != Some(expected) {
        return Err("external_file_conflict: File changed or was deleted outside GoIDE. Compare it with your editor before saving.".into());
    }
    fs::write_file(root, path, content).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn export_copy_preserves_existing_targets_and_the_original_document() {
        let dir = std::env::temp_dir().join(format!("goro-export-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&dir).unwrap();
        let source = dir.join("main.go");
        let copy = dir.join("recovered.go");
        std::fs::write(&source, "original").unwrap();
        export_copy(&copy, "valuable draft").unwrap();
        assert_eq!(std::fs::read_to_string(&copy).unwrap(), "valuable draft");
        assert!(export_copy(&copy, "replacement").is_err());
        assert_eq!(std::fs::read_to_string(&copy).unwrap(), "valuable draft");
        assert_eq!(std::fs::read_to_string(&source).unwrap(), "original");
        assert!(export_copy(&dir.join("too-big.go"), &"x".repeat(4 * 1024 * 1024 + 1)).is_err());
        assert!(!dir.join("too-big.go").exists());
        assert!(export_copy(std::path::Path::new("relative.go"), "data").is_err());
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 2);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn stale_baselines_and_deleted_files_never_overwrite_disk() {
        let dir =
            std::env::temp_dir().join(format!("goide-document-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&dir).unwrap();
        let root = dir.to_str().unwrap();
        std::fs::write(dir.join("main.go"), "base").unwrap();
        save(root, "main.go", "editor", "base").unwrap();
        std::fs::write(dir.join("main.go"), "external").unwrap();
        assert!(save(root, "main.go", "valuable", "editor")
            .unwrap_err()
            .starts_with("external_file_conflict"));
        assert_eq!(
            disk_state(root, "main.go").unwrap().content.as_deref(),
            Some("external")
        );
        std::fs::remove_file(dir.join("main.go")).unwrap();
        assert!(!disk_state(root, "main.go").unwrap().exists);
        assert!(save(root, "main.go", "valuable", "external").is_err());
        assert!(!dir.join("main.go").exists());
        assert!(disk_state(root, "../escaped.go").is_err());
        assert!(dir.starts_with(std::env::temp_dir()));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
