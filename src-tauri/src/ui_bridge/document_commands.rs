use super::types::ApiResponse;
use crate::integration::document;

#[tauri::command]
pub async fn get_workspace_file_state(
    workspace_root: String,
    relative_path: String,
) -> ApiResponse<document::DiskState> {
    match tauri::async_runtime::spawn_blocking(move || {
        document::disk_state(&workspace_root, &relative_path)
    })
    .await
    {
        Ok(Ok(data)) => ApiResponse::ok(data),
        Ok(Err(error)) => ApiResponse::err("fs_read_failed", &error),
        Err(error) => ApiResponse::err("fs_read_failed", &error.to_string()),
    }
}
