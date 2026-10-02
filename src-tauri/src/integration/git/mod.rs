mod diff;
mod history;
mod operations;
mod runner;
mod status;
#[cfg(test)]
mod tests;

pub use diff::{file_diff, FileDiff};
pub use history::{history_page, HistoryPage};
pub use operations::{mutate, Mutation};
pub use status::{repository_status, FileStatus, RepositoryStatus};

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::collections::HashSet;

static MUTATIONS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();

pub struct MutationLease(PathBuf);
impl Drop for MutationLease {
    fn drop(&mut self) {
        if let Ok(mut active) = MUTATIONS.get_or_init(Default::default).lock() {
            active.remove(&self.0);
        }
    }
}

pub fn mutation_lock(root: &Path) -> Result<MutationLease, String> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let mut active = MUTATIONS.get_or_init(Default::default).lock().map_err(|_| "Git operation registry unavailable.")?;
    if !active.insert(root.clone()) { return Err("Another GoIDE Git operation is in progress in this repository.".into()); }
    Ok(MutationLease(root))
}

pub fn repository_root(workspace: &str) -> Result<PathBuf, String> {
    let root = Path::new(workspace).canonicalize().map_err(|e| e.to_string())?;
    if !root.is_dir() { return Err("Workspace must be a directory.".into()); }
    let top = runner::text(&root, &["rev-parse", "--show-toplevel"])?;
    let git_root = Path::new(top.trim_end_matches(['\r', '\n'])).canonicalize().map_err(|e| e.to_string())?;
    if git_root != root {
        return Err("Open the Git repository root as the workspace. Parent/nested repository mutations are not supported.".into());
    }
    Ok(root)
}

fn validate_path(path: &str) -> Result<(), String> {
    use std::path::Component;
    if path.is_empty() || path.contains('\0') || Path::new(path).components().any(|c|
        matches!(c, Component::ParentDir | Component::RootDir | Component::Prefix(_))) {
        return Err("Git path must remain inside the repository.".into());
    }
    Ok(())
}
