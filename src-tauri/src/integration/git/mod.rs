mod commit;
mod diff;
mod history;
mod operations;
mod runner;
mod status;
#[cfg(test)]
mod tests;

pub use commit::{details as commit_details, historical_diff, CommitDetails};
pub use diff::{file_diff, FileDiff};
pub use history::{history_page, HistoryPage};
pub use operations::{mutate, Mutation};
pub use runner::text as command_text;
pub use status::{repository_status, FileStatus, RepositoryStatus};

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};

static MUTATIONS: OnceLock<Mutex<HashMap<PathBuf, Arc<AtomicBool>>>> = OnceLock::new();

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
    let mut active = MUTATIONS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "Git operation registry unavailable.")?;
    if active.contains_key(&root) {
        return Err("Another GoIDE Git operation is in progress in this repository.".into());
    }
    active.insert(root.clone(), Arc::new(AtomicBool::new(false)));
    Ok(MutationLease(root))
}
pub fn cancel(root: &Path) -> Result<bool, String> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let active = MUTATIONS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "Git operation registry unavailable")?;
    if let Some(token) = active.get(&root) {
        token.store(true, Ordering::Release);
        return Ok(true);
    }
    Ok(false)
}
pub(super) fn cancellation(root: &Path) -> Option<Arc<AtomicBool>> {
    MUTATIONS
        .get_or_init(Default::default)
        .lock()
        .ok()?
        .get(root)
        .cloned()
}

pub fn repository_root(workspace: &str) -> Result<PathBuf, String> {
    let root = Path::new(workspace)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !root.is_dir() {
        return Err("Workspace must be a directory.".into());
    }
    let top = runner::text(&root, &["rev-parse", "--show-toplevel"])?;
    let git_root = Path::new(top.trim_end_matches(['\r', '\n']))
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if git_root != root {
        return Err("Open the Git repository root as the workspace. Parent/nested repository mutations are not supported.".into());
    }
    Ok(root)
}

fn validate_path(path: &str) -> Result<(), String> {
    use std::path::Component;
    if path.is_empty()
        || path.contains('\0')
        || Path::new(path).components().any(|c| {
            matches!(
                c,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err("Git path must remain inside the repository.".into());
    }
    Ok(())
}
