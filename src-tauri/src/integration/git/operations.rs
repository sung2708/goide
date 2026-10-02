use super::{repository_status, runner, validate_path};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Mutation {
    StashPush {
        message: String,
        include_untracked: bool,
    },
    StashApply {
        reference: String,
        hash: String,
        restore_index: bool,
    },
    StashPop {
        reference: String,
        hash: String,
        restore_index: bool,
    },
    StashDrop {
        reference: String,
        hash: String,
    },
    CreateBranch {
        name: String,
        start: Option<String>,
    },
    SaveConflict {
        path: String,
        expected_index: String,
        expected_disk: String,
        result: String,
    },
    StageResolved {
        path: String,
        expected_index: String,
        expected_disk: String,
    },
    Discard {
        path: String,
    },
    DeleteUntracked {
        path: String,
    },
    Stage {
        paths: Vec<String>,
    },
    Unstage {
        paths: Vec<String>,
    },
    Commit {
        message: String,
    },
    Fetch {
        remote: String,
    },
    Pull {
        remote: String,
        branch: String,
    },
    Push {
        remote: String,
        branch: String,
        set_upstream: bool,
    },
}

pub fn mutate(root: &Path, mutation: Mutation) -> Result<(), String> {
    let snapshot = repository_status(root)?;
    let merge_commit = matches!(mutation, Mutation::Commit { .. })
        && snapshot.operation.as_deref() == Some("merge")
        && !snapshot.files.iter().any(|file| file.conflicted);
    if !merge_commit
        && !matches!(
            mutation,
            Mutation::Fetch { .. } | Mutation::SaveConflict { .. } | Mutation::StageResolved { .. }
        )
        && (snapshot.operation.is_some() || snapshot.files.iter().any(|f| f.conflicted))
    {
        return Err("A Git operation/conflict is in progress. Resolve it in the repository terminal; no files were staged or committed.".into());
    }
    match mutation {
        Mutation::StashPush {
            message,
            include_untracked,
        } => super::stash::push(root, &message, include_untracked),
        Mutation::StashApply {
            reference,
            hash,
            restore_index,
        } => super::stash::restore(root, &reference, &hash, restore_index, false),
        Mutation::StashPop {
            reference,
            hash,
            restore_index,
        } => super::stash::restore(root, &reference, &hash, restore_index, true),
        Mutation::StashDrop { reference, hash } => {
            super::stash::drop_entry(root, &reference, &hash)
        }
        Mutation::CreateBranch { name, start } => {
            checked_branch(root, &name)?;
            let start = start
                .as_deref()
                .or(snapshot.head.as_deref())
                .ok_or("Commit before creating a branch.")?;
            super::commit::verify_commit(root, start)?;
            runner::run(root, &["branch", "--", &name, start]).map(|_| ())
        }
        Mutation::SaveConflict {
            path,
            expected_index,
            expected_disk,
            result,
        } => super::conflict::save(root, &path, &expected_index, &expected_disk, &result),
        Mutation::StageResolved {
            path,
            expected_index,
            expected_disk,
        } => super::conflict::stage(root, &path, &expected_index, &expected_disk),
        Mutation::Discard { path } => {
            checked_paths(root, &snapshot.files, vec![path.clone()])?;
            let file = snapshot
                .files
                .iter()
                .find(|file| file.path == path)
                .ok_or("Refresh Git status before discarding")?;
            if file.index_status == "?" {
                return Err("Untracked files require explicit deletion, not discard.".into());
            }
            runner::paths(root, &["restore", "--worktree", "--", &path]).map(|_| ())
        }
        Mutation::DeleteUntracked { path } => {
            checked_paths(root, &snapshot.files, vec![path.clone()])?;
            if !snapshot
                .files
                .iter()
                .any(|file| file.path == path && file.index_status == "?")
            {
                return Err("Only a currently untracked file can be deleted here.".into());
            }
            crate::integration::fs::delete_file_only(
                root.to_str().ok_or("Non-UTF-8 workspace")?,
                &path,
            )
            .map_err(|error| error.to_string())
        }
        Mutation::Fetch { remote } => {
            checked_remote(&snapshot.remotes, &remote)?;
            runner::run(root, &["fetch", "--", &remote]).map(|_| ())
        }
        Mutation::Pull { remote, branch } => {
            checked_remote(&snapshot.remotes, &remote)?;
            checked_branch(root, &branch)?;
            if snapshot.branch.is_none() {
                return Err("Switch to a branch before pulling.".into());
            }
            runner::run(
                root,
                &["pull", "--ff-only", "--no-rebase", "--", &remote, &branch],
            )
            .map(|_| ())
        }
        Mutation::Push {
            remote,
            branch,
            set_upstream,
        } => {
            checked_remote(&snapshot.remotes, &remote)?;
            checked_branch(root, &branch)?;
            if snapshot.branch.is_none() || snapshot.head.is_none() {
                return Err("Select a committed branch before pushing.".into());
            }
            let target = format!("HEAD:refs/heads/{branch}");
            let mut args = vec!["push"];
            if set_upstream {
                args.push("--set-upstream");
            }
            args.extend(["--", &remote, &target]);
            runner::run(root, &args).map(|_| ())
        }
        Mutation::Stage { paths } | Mutation::Unstage { paths } if paths.is_empty() => {
            Err("Select at least one changed file.".into())
        }
        Mutation::Stage { paths } => {
            let paths = checked_paths(root, &snapshot.files, paths)?;
            let mut args = vec!["add", "--"];
            args.extend(paths.iter().map(String::as_str));
            runner::paths(root, &args).map(|_| ())
        }
        Mutation::Unstage { paths } => {
            let paths = checked_paths(root, &snapshot.files, paths)?;
            let mut args = if snapshot.head.is_some() {
                vec!["restore", "--staged", "--"]
            } else {
                vec!["rm", "--cached", "-f", "--"]
            };
            args.extend(paths.iter().map(String::as_str));
            runner::paths(root, &args).map(|_| ())
        }
        Mutation::Commit { message } => {
            if message.trim().is_empty() {
                return Err("A commit message is required.".into());
            }
            if message.len() > 64 * 1024 || message.contains('\0') {
                return Err("Commit message is too large or contains NUL.".into());
            }
            if !snapshot
                .files
                .iter()
                .any(|f| f.index_status != "." && f.index_status != "?")
            {
                return Err("Nothing is staged. Stage files explicitly before committing.".into());
            }
            runner::run(root, &["commit", "-m", &message]).map(|_| ())
        }
    }
}

fn checked_remote(remotes: &[String], remote: &str) -> Result<(), String> {
    if remote.starts_with('-') || !remotes.iter().any(|name| name == remote) {
        return Err("Select an existing named remote; remote URLs are not accepted here.".into());
    }
    Ok(())
}
fn checked_branch(root: &Path, branch: &str) -> Result<(), String> {
    if branch.starts_with('-') || branch.contains('\0') || branch.is_empty() {
        return Err("Invalid target branch".into());
    }
    runner::run(root, &["check-ref-format", &format!("refs/heads/{branch}")]).map(|_| ())
}

fn checked_paths(
    root: &Path,
    files: &[super::FileStatus],
    requested: Vec<String>,
) -> Result<Vec<String>, String> {
    if requested.len() > 1000 {
        return Err(
            "Select at most 1000 files per operation; use the terminal for larger batches.".into(),
        );
    }
    let mut result = Vec::new();
    for path in requested {
        validate_path(&path)?;
        let file = files
            .iter()
            .find(|f| f.path == path)
            .ok_or("Git status changed. Refresh before staging.")?;
        if file.submodule {
            return Err("Submodule mutations are not supported. Use the terminal.".into());
        }
        // Parent symlinks/junctions must not turn a literal path into outside I/O.
        let target = root.join(&path);
        let mut parent = target.parent().ok_or("Git path has no parent")?;
        while !parent.exists() {
            parent = parent.parent().ok_or("Git path has no existing ancestor")?;
        }
        if !parent
            .canonicalize()
            .map_err(|e| e.to_string())?
            .starts_with(root)
        {
            return Err("Git path follows a directory link outside the repository.".into());
        }
        result.push(path);
        if let Some(original) = &file.original_path {
            validate_path(original)?;
            result.push(original.clone());
        }
    }
    result.sort();
    result.dedup();
    Ok(result)
}
