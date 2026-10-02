use super::{repository_status, runner, validate_path};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Mutation {
    Stage { paths: Vec<String> },
    Unstage { paths: Vec<String> },
    Commit { message: String },
}

pub fn mutate(root: &Path, mutation: Mutation) -> Result<(), String> {
    let snapshot = repository_status(root)?;
    if snapshot.operation.is_some() || snapshot.files.iter().any(|f| f.conflicted) {
        return Err("A Git operation/conflict is in progress. Resolve it in the repository terminal; no files were staged or committed.".into());
    }
    match mutation {
        Mutation::Stage { paths } | Mutation::Unstage { paths } if paths.is_empty() => Err("Select at least one changed file.".into()),
        Mutation::Stage { paths } => {
            let paths = checked_paths(root, &snapshot.files, paths)?;
            let mut args = vec!["add", "--"];
            args.extend(paths.iter().map(String::as_str));
            runner::run(root, &args).map(|_| ())
        }
        Mutation::Unstage { paths } => {
            let paths = checked_paths(root, &snapshot.files, paths)?;
            let mut args = if snapshot.head.is_some() { vec!["restore", "--staged", "--"] } else { vec!["rm", "--cached", "-f", "--"] };
            args.extend(paths.iter().map(String::as_str));
            runner::run(root, &args).map(|_| ())
        }
        Mutation::Commit { message } => {
            if message.trim().is_empty() { return Err("A commit message is required.".into()); }
            if message.len() > 64 * 1024 || message.contains('\0') { return Err("Commit message is too large or contains NUL.".into()); }
            if !snapshot.files.iter().any(|f| f.index_status != "." && f.index_status != "?") { return Err("Nothing is staged. Stage files explicitly before committing.".into()); }
            runner::run(root, &["commit", "-m", &message]).map(|_| ())
        }
    }
}

fn checked_paths(root: &Path, files: &[super::FileStatus], requested: Vec<String>) -> Result<Vec<String>, String> {
    if requested.len() > 1000 { return Err("Select at most 1000 files per operation; use the terminal for larger batches.".into()); }
    let mut result = Vec::new();
    for path in requested {
        validate_path(&path)?;
        let file = files.iter().find(|f| f.path == path).ok_or("Git status changed. Refresh before staging.")?;
        if file.submodule { return Err("Submodule mutations are not supported. Use the terminal.".into()); }
        // Parent symlinks/junctions must not turn a literal path into outside I/O.
        let target = root.join(&path);
        let mut parent = target.parent().ok_or("Git path has no parent")?;
        while !parent.exists() { parent = parent.parent().ok_or("Git path has no existing ancestor")?; }
        if !parent.canonicalize().map_err(|e| e.to_string())?.starts_with(root) {
            return Err("Git path follows a directory link outside the repository.".into());
        }
        result.push(path);
        if let Some(original) = &file.original_path { validate_path(original)?; result.push(original.clone()); }
    }
    result.sort(); result.dedup();
    Ok(result)
}
