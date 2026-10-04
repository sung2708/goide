use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{self, Cursor, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};
const EXPANDED_LIMIT: u64 = 2 * 1024 * 1024 * 1024;
const ENTRY_LIMIT: usize = 60_000;
pub(super) fn check(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Acquire) || crate::integration::lifecycle::gate().is_closing() {
        Err("Setup cancelled.".into())
    } else {
        Ok(())
    }
}
pub(super) fn verify(bytes: &[u8], expected: &str, size: u64) -> Result<(), String> {
    if bytes.len() as u64 != size || format!("{:x}", Sha256::digest(bytes)) != expected {
        Err("Go archive size or SHA-256 does not match the pinned catalog.".into())
    } else {
        Ok(())
    }
}
pub(super) fn archive_path(name: &str) -> Result<PathBuf, String> {
    if name.len() > 4096 || name.contains(['\\', ':', '\0']) || name.starts_with('/') {
        return Err("Unsafe archive path.".into());
    }
    let name = name.trim_end_matches('/');
    if name.is_empty()
        || name
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
        || !name.starts_with("go/") && name != "go"
    {
        return Err("Archive entry must stay within the Go directory.".into());
    }
    Ok(PathBuf::from(name))
}
fn write_entry(
    mut input: impl Read,
    root: &Path,
    path: &Path,
    size: u64,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let target = root.join(path);
    fs::create_dir_all(target.parent().ok_or("Invalid entry parent")?)
        .map_err(|e| e.to_string())?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|e| format!("Cannot extract {}: {e}", path.display()))?;
    let mut count = 0;
    let mut buffer = [0; 65536];
    loop {
        check(cancel)?;
        let n = input.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        count += n as u64;
        if count > size {
            return Err("Expanded entry exceeds declared size.".into());
        }
        output.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
    }
    if count != size {
        return Err("Truncated archive entry.".into());
    }
    Ok(())
}
fn budget(total: &mut u64, size: u64, entries: usize) -> Result<(), String> {
    *total = total.checked_add(size).ok_or("Archive size overflow")?;
    if *total > EXPANDED_LIMIT || entries > ENTRY_LIMIT {
        return Err("Archive extraction limit exceeded.".into());
    }
    Ok(())
}
pub(super) fn extract_zip(bytes: &[u8], root: &Path, cancel: &AtomicBool) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut total = 0;
    let mut seen = HashSet::new();
    for i in 0..archive.len() {
        check(cancel)?;
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let path = archive_path(entry.name())?;
        if !seen.insert(path.to_string_lossy().to_ascii_lowercase()) {
            return Err("Duplicate archive path.".into());
        }
        if entry.is_symlink() {
            return Err("Archive links are forbidden.".into());
        }
        budget(&mut total, entry.size(), i + 1)?;
        if entry.is_dir() {
            fs::create_dir_all(root.join(path)).map_err(|e| e.to_string())?;
        } else {
            let size = entry.size();
            write_entry(&mut entry, root, &path, size, cancel)?;
        }
    }
    Ok(())
}
pub(super) fn extract_tar(bytes: &[u8], root: &Path, cancel: &AtomicBool) -> Result<(), String> {
    let decoder = flate2::read::GzDecoder::new(Cursor::new(bytes));
    let mut archive = tar::Archive::new(decoder);
    let mut total = 0;
    let mut seen = HashSet::new();
    for (index, entry) in archive.entries().map_err(|e| e.to_string())?.enumerate() {
        check(cancel)?;
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = archive_path(&entry.path().map_err(|e| e.to_string())?.to_string_lossy())?;
        if !seen.insert(path.to_string_lossy().to_ascii_lowercase()) {
            return Err("Duplicate archive path.".into());
        }
        let kind = entry.header().entry_type();
        if !kind.is_file() && !kind.is_dir() {
            return Err("Archive links and special files are forbidden.".into());
        }
        budget(&mut total, entry.size(), index + 1)?;
        if kind.is_dir() {
            fs::create_dir_all(root.join(path)).map_err(|e| e.to_string())?;
        } else {
            let size = entry.size();
            write_entry(&mut entry, root, &path, size, cancel)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mode = entry.header().mode().map_err(|e| e.to_string())? & 0o777;
                fs::set_permissions(root.join(path), fs::Permissions::from_mode(mode & !0o022))
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}
pub(super) fn controlled_output(
    command: &mut std::process::Command,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let output = crate::integration::owned_tool_output::output_with_control(
        command,
        std::time::Duration::from_secs(600),
        || check(cancel).map_err(io::Error::other),
    )
    .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(format!(
            "Tool command failed: {}",
            String::from_utf8_lossy(&output.stderr)
                .chars()
                .take(2048)
                .collect::<String>()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}
