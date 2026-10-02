use super::{runner, validate_path};
use crate::integration::document;
use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictContent {
    pub path: String,
    pub index_signature: String,
    pub base: Option<String>,
    pub current: Option<String>,
    pub incoming: Option<String>,
    pub result: String,
}

fn signature(root: &Path, path: &str) -> Result<String, String> {
    validate_path(path)?;
    String::from_utf8(runner::paths(
        root,
        &["ls-files", "--unmerged", "-z", "--", path],
    )?)
    .map_err(|_| "Conflict index is not UTF-8".into())
}

pub fn content(root: &Path, path: &str) -> Result<ConflictContent, String> {
    let index_signature = signature(root, path)?;
    if index_signature.is_empty() {
        return Err("This path has no unresolved index stages. Refresh Source Control.".into());
    }
    let mut stages: [Option<String>; 3] = [None, None, None];
    for record in index_signature
        .split('\0')
        .filter(|record| !record.is_empty())
    {
        let (metadata, actual_path) = record.split_once('\t').ok_or("Malformed conflict entry")?;
        let fields: Vec<_> = metadata.split(' ').collect();
        if fields.len() != 3 || actual_path != path || !matches!(fields[0], "100644" | "100755") {
            return Err("Only regular text-file conflicts are supported. Use the terminal for links/submodules.".into());
        }
        let stage = fields[2]
            .parse::<usize>()
            .map_err(|_| "Invalid index stage")?;
        if !(1..=3).contains(&stage) {
            return Err("Invalid index stage".into());
        }
        let size = runner::text(root, &["cat-file", "-s", fields[1]])?
            .trim()
            .parse::<usize>()
            .map_err(|_| "Invalid blob size")?;
        if size > 256 * 1024 {
            return Err("Conflict blob exceeds the 256 KiB editor limit. Use the terminal.".into());
        }
        let text = runner::text(root, &["cat-file", "blob", fields[1]])?;
        if text.contains('\0') {
            return Err("Binary conflict requires the repository terminal.".into());
        }
        stages[stage - 1] = Some(text);
    }
    if std::fs::symlink_metadata(root.join(path))
        .map_err(|e| e.to_string())?
        .len()
        > 256 * 1024
    {
        return Err("Conflict result exceeds the 256 KiB editor limit. Use the terminal.".into());
    }
    let disk = document::disk_state(root.to_str().ok_or("Non-UTF-8 workspace")?, path)?;
    let result = disk.content.ok_or("Conflict result file is missing. Restore/create it explicitly in the editor before resolving.")?;
    if result.len() > 256 * 1024 || result.contains('\0') {
        return Err("Conflict result exceeds text editor limits.".into());
    }
    let [base, current, incoming] = stages;
    Ok(ConflictContent {
        path: path.into(),
        index_signature,
        base,
        current,
        incoming,
        result,
    })
}

pub fn save(
    root: &Path,
    path: &str,
    expected_index: &str,
    expected_disk: &str,
    result: &str,
) -> Result<(), String> {
    check_index(root, path, expected_index)?;
    if result.len() > 256 * 1024 || result.contains('\0') {
        return Err("Resolution must be UTF-8 text within 256 KiB.".into());
    }
    document::save(
        root.to_str().ok_or("Non-UTF-8 workspace")?,
        path,
        result,
        expected_disk,
    )
}

pub fn stage(
    root: &Path,
    path: &str,
    expected_index: &str,
    expected_disk: &str,
) -> Result<(), String> {
    check_index(root, path, expected_index)?;
    let disk = document::disk_state(root.to_str().ok_or("Non-UTF-8 workspace")?, path)?;
    if disk.content.as_deref() != Some(expected_disk) {
        return Err(
            "Result changed after review. Reload and review it before staging resolved.".into(),
        );
    }
    runner::paths(root, &["add", "--", path]).map(|_| ())
}

fn check_index(root: &Path, path: &str, expected: &str) -> Result<(), String> {
    let actual = signature(root, path)?;
    if actual.is_empty() || actual != expected {
        return Err(
            "Conflict index changed since review. Reload without overwriting your result.".into(),
        );
    }
    Ok(())
}
