mod commit;
mod conflict;
mod diff;
mod history;
mod history_search;
mod operations;
mod runner;
mod stash;
mod status;
#[cfg(test)]
mod tests;

pub use commit::{details as commit_details, historical_diff, CommitDetails};
pub use conflict::{content as conflict_content, ConflictContent};
pub use diff::{file_diff, FileDiff};
pub use history::{history_page, HistoryPage};
#[cfg(test)]
use history_search::SearchField as HistorySearchField;
pub use history_search::{search as search_history, SearchRequest as HistorySearchRequest};
pub use operations::{mutate, Mutation};
pub use runner::text as command_text;
pub fn shutdown() -> Result<(), String> {
    runner::wait_for_shutdown()
}
pub use stash::{list as stash_list, preview as stash_preview, StashList};
pub use status::{repository_status, FileStatus, RepositoryStatus};

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};

struct ActiveMutation {
    id: uuid::Uuid,
    requested_root: PathBuf,
    token: Arc<AtomicBool>,
}
static MUTATIONS: OnceLock<Mutex<HashMap<PathBuf, ActiveMutation>>> = OnceLock::new();

pub struct MutationLease(PathBuf);
impl Drop for MutationLease {
    fn drop(&mut self) {
        if let Ok(mut active) = MUTATIONS.get_or_init(Default::default).lock() {
            active.remove(&self.0);
        }
    }
}

pub fn mutation_lock(root: &Path) -> Result<MutationLease, String> {
    mutation_lock_identified(root, root, uuid::Uuid::new_v4())
}
pub fn mutation_lock_identified(
    root: &Path,
    requested_root: &Path,
    id: uuid::Uuid,
) -> Result<MutationLease, String> {
    let requested_root = std::path::absolute(requested_root).map_err(|e| e.to_string())?;
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let mut active = MUTATIONS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "Git operation registry unavailable.")?;
    if active.contains_key(&root) {
        return Err("Another GoIDE Git operation is in progress in this repository.".into());
    }
    active.insert(
        root.clone(),
        ActiveMutation {
            id,
            requested_root,
            token: Arc::new(AtomicBool::new(false)),
        },
    );
    Ok(MutationLease(root))
}
#[cfg(test)]
fn cancel(root: &Path) -> Result<bool, String> {
    cancel_identified(root, None)
}
pub fn cancel_identified(root: &Path, id: Option<uuid::Uuid>) -> Result<bool, String> {
    // Authorization is bound at registration. Never resolve a live path here:
    // a deleted/retargeted workspace must still cancel its original operation.
    let root = std::path::absolute(root).map_err(|e| e.to_string())?;
    let active = MUTATIONS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "Git operation registry unavailable")?;
    let mut matches = active.iter().filter_map(|(canonical, operation)| {
        ((canonical == &root || operation.requested_root == root)
            && id.is_none_or(|id| id == operation.id))
        .then_some(operation)
    });
    if let Some(operation) = matches.next() {
        if matches.next().is_some() {
            return Err(
                "Multiple Git operations used this workspace path; supply the operation identity."
                    .into(),
            );
        }
        operation.token.store(true, Ordering::Release);
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
        .map(|operation| operation.token.clone())
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
