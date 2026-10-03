use super::types::{
    ApiResponse, GitCommitDetailsDto, GitConflictContentDto, GitFileDiffDto, GitHistoryPageDto,
    GitMutationDto, GitRepositoryStatusDto,
};
#[tauri::command]
pub async fn git_conflict_content(
    workspace_root: String,
    path: String,
) -> ApiResponse<GitConflictContentDto> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            let root = git::repository_root(&workspace_root)?;
            git::conflict_content(&root, &path)
        })
        .await,
    )
}
#[tauri::command]
pub async fn git_cancel(workspace_root: String, operation_id: Option<String>) -> ApiResponse<bool> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            let id = operation_id
                .map(|id| {
                    uuid::Uuid::parse_str(&id)
                        .map_err(|_| "Invalid Git operation identity".to_string())
                })
                .transpose()?;
            git::cancel_identified(std::path::Path::new(&workspace_root), id)
        })
        .await,
    )
}
#[tauri::command]
pub async fn git_commit_details(
    workspace_root: String,
    hash: String,
    parent: Option<String>,
) -> ApiResponse<GitCommitDetailsDto> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            let root = git::repository_root(&workspace_root)?;
            git::commit_details(&root, &hash, parent)
        })
        .await,
    )
}
#[tauri::command]
pub async fn git_historical_diff(
    workspace_root: String,
    hash: String,
    parent: Option<String>,
    path: String,
) -> ApiResponse<GitFileDiffDto> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            let root = git::repository_root(&workspace_root)?;
            git::historical_diff(&root, &hash, parent, &path)
        })
        .await,
    )
}
use crate::integration::git;

#[tauri::command]
pub async fn git_stash_list(workspace_root: String) -> ApiResponse<super::types::GitStashListDto> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            let root = git::repository_root(&workspace_root)?;
            git::stash_list(&root)
        })
        .await,
    )
}

#[tauri::command]
pub async fn git_stash_preview(
    workspace_root: String,
    reference: String,
    hash: String,
) -> ApiResponse<GitFileDiffDto> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            let root = git::repository_root(&workspace_root)?;
            git::stash_preview(&root, &reference, &hash)
        })
        .await,
    )
}

#[tauri::command]
pub async fn git_search_history(
    workspace_root: String,
    request: super::types::GitHistorySearchRequestDto,
) -> ApiResponse<GitHistoryPageDto> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            let root = git::repository_root(&workspace_root)?;
            git::search_history(&root, request)
        })
        .await,
    )
}

#[tauri::command]
pub async fn git_history_page(
    workspace_root: String,
    offset: usize,
    tips: Vec<String>,
) -> ApiResponse<GitHistoryPageDto> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            let root = git::repository_root(&workspace_root)?;
            git::history_page(&root, offset, tips)
        })
        .await,
    )
}

#[tauri::command]
pub async fn git_repository_status(workspace_root: String) -> ApiResponse<GitRepositoryStatusDto> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            let root = git::repository_root(&workspace_root)?;
            git::repository_status(&root)
        })
        .await,
    )
}

#[tauri::command]
pub async fn git_file_diff(
    workspace_root: String,
    path: String,
    staged: bool,
) -> ApiResponse<GitFileDiffDto> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            let root = git::repository_root(&workspace_root)?;
            git::file_diff(&root, &path, staged)
        })
        .await,
    )
}

#[tauri::command]
pub async fn git_mutate(
    workspace_root: String,
    mutation: GitMutationDto,
    operation_id: Option<String>,
) -> ApiResponse<()> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            let id = operation_id
                .map(|id| {
                    uuid::Uuid::parse_str(&id)
                        .map_err(|_| "Invalid Git operation identity".to_string())
                })
                .transpose()?
                .unwrap_or_else(uuid::Uuid::new_v4);
            let root = std::path::Path::new(&workspace_root)
                .canonicalize()
                .map_err(|e| e.to_string())?;
            let _guard =
                git::mutation_lock_identified(&root, std::path::Path::new(&workspace_root), id)?;
            // Register cancellation before even the Git repository validation
            // subprocess. Use the pinned canonical path rather than resolving
            // a potentially retargeted workspace alias again.
            let root = git::repository_root(root.to_str().ok_or("Non-UTF-8 workspace")?)?;
            git::mutate(&root, mutation)
        })
        .await,
    )
}

fn respond<T, E: std::fmt::Display>(result: Result<Result<T, String>, E>) -> ApiResponse<T> {
    match result {
        Ok(Ok(data)) => ApiResponse::ok(data),
        Ok(Err(error)) => ApiResponse::err("git_operation_failed", &error),
        Err(error) => ApiResponse::err("git_operation_failed", &error.to_string()),
    }
}
