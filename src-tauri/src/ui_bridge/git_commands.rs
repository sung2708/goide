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
pub async fn git_cancel(workspace_root: String) -> ApiResponse<bool> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            git::cancel(std::path::Path::new(&workspace_root))
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
pub async fn git_mutate(workspace_root: String, mutation: GitMutationDto) -> ApiResponse<()> {
    respond(
        tauri::async_runtime::spawn_blocking(move || {
            let root = git::repository_root(&workspace_root)?;
            let _guard = git::mutation_lock(&root)?;
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
