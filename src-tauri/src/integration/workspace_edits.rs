//! Validate workspace edits before constructing editor-only review proposals.
use super::gopls::normalize_platform_pathbuf;
use anyhow::{anyhow, Result};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};
pub(super) struct FileEdits {
    pub path: PathBuf,
    pub version: Option<i64>,
    pub edits: Vec<Value>,
}
fn file_from_uri(root: &Path, uri: &str) -> Result<PathBuf> {
    let uri = tauri::Url::parse(uri)?;
    if uri.query().is_some() || uri.fragment().is_some() {
        return Err(anyhow!("Workspace edit returned an invalid file URI."));
    }
    let path = normalize_platform_pathbuf(
        uri.to_file_path()
            .map_err(|_| anyhow!("Workspace edit location is not a file."))?
            .canonicalize()?,
    );
    if !path.starts_with(root)
        || !path.is_file()
        || path.extension().is_none_or(|extension| extension != "go")
    {
        return Err(anyhow!(
            "Workspace edit would change files outside the workspace or unsupported file types."
        ));
    }
    Ok(path)
}

pub(super) fn group_edits(root: &Path, edit: &Value) -> Result<Vec<FileEdits>> {
    if edit.is_null() {
        return Ok(Vec::new());
    }
    let mut files = BTreeMap::<PathBuf, FileEdits>::new();
    let mut insert = |uri: &str, version: Option<i64>, values: &Value| -> Result<()> {
        let path = file_from_uri(root, uri)?;
        let edits = values
            .as_array()
            .ok_or_else(|| anyhow!("Workspace edit returned an invalid edit list."))?
            .clone();
        if files
            .insert(
                path.clone(),
                FileEdits {
                    path,
                    version,
                    edits,
                },
            )
            .is_some()
        {
            return Err(anyhow!("Workspace edit returned duplicate document edits."));
        }
        if files.len() > 100 {
            return Err(anyhow!(
                "Workspace edit exceeds the 100 document review limit."
            ));
        }
        Ok(())
    };
    if let Some(changes) = edit.get("changes") {
        for (uri, values) in changes
            .as_object()
            .ok_or_else(|| anyhow!("Workspace edit returned invalid changes."))?
        {
            insert(uri, None, values)?;
        }
    }
    if let Some(changes) = edit.get("documentChanges") {
        for change in changes
            .as_array()
            .ok_or_else(|| anyhow!("Workspace edit returned invalid document changes."))?
        {
            if change.get("kind").is_some() {
                return Err(anyhow!(
                    "This refactoring requires unsupported file/folder resource operations."
                ));
            }
            let uri = change["textDocument"]["uri"]
                .as_str()
                .ok_or_else(|| anyhow!("Workspace edit returned an invalid document URI."))?;
            let version = if change["textDocument"]["version"].is_null() {
                None
            } else {
                Some(change["textDocument"]["version"].as_i64().ok_or_else(|| {
                    anyhow!("Workspace edit returned an invalid document version.")
                })?)
            };
            insert(uri, version, &change["edits"])?;
        }
    }
    if edit.get("changes").is_none() && edit.get("documentChanges").is_none() {
        return Err(anyhow!(
            "Workspace edit returned an invalid workspace edit."
        ));
    }
    Ok(files.into_values().collect())
}
