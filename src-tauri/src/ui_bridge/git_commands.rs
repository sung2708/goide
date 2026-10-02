use crate::integration::git;
use super::types::ApiResponse;

#[tauri::command]
pub async fn git_history_page(workspace_root: String, offset: usize, tips: Vec<String>) -> ApiResponse<git::HistoryPage> {
    respond(tauri::async_runtime::spawn_blocking(move || {
        let root = git::repository_root(&workspace_root)?;
        git::history_page(&root, offset, tips)
    }).await)
}

#[tauri::command]
pub async fn git_repository_status(workspace_root: String) -> ApiResponse<git::RepositoryStatus> {
    respond(tauri::async_runtime::spawn_blocking(move || {
        let root = git::repository_root(&workspace_root)?;
        git::repository_status(&root)
    }).await)
}

#[tauri::command]
pub async fn git_file_diff(workspace_root: String, path: String, staged: bool) -> ApiResponse<git::FileDiff> {
    respond(tauri::async_runtime::spawn_blocking(move || {
        let root = git::repository_root(&workspace_root)?;
        git::file_diff(&root, &path, staged)
    }).await)
}

#[tauri::command]
pub async fn git_mutate(workspace_root: String, mutation: git::Mutation) -> ApiResponse<()> {
    respond(tauri::async_runtime::spawn_blocking(move || {
        let root = git::repository_root(&workspace_root)?;
        let _guard = git::mutation_lock(&root)?;
        git::mutate(&root, mutation)
    }).await)
}

fn respond<T, E: std::fmt::Display>(result: Result<Result<T, String>, E>) -> ApiResponse<T> {
    match result {
        Ok(Ok(data)) => ApiResponse::ok(data),
        Ok(Err(error)) => ApiResponse::err("git_operation_failed", &error),
        Err(error) => ApiResponse::err("git_operation_failed", &error.to_string()),
    }
}
