use crate::integration::fs;
use crate::ui_bridge::types::{ApiResponse, FsEntryDto};

#[tauri::command]
pub async fn list_workspace_entries(
    workspace_root: String,
    relative_path: Option<String>,
) -> ApiResponse<Vec<FsEntryDto>> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        fs::list_directory(&workspace_root, relative_path.as_deref())
    })
    .await;

    match result {
        Ok(Ok(entries)) => {
            let mapped = entries
                .into_iter()
                .map(|entry| FsEntryDto {
                    name: entry.name,
                    path: entry.path,
                    is_dir: entry.is_dir,
                })
                .collect();
            ApiResponse::ok(mapped)
        }
        Ok(Err(error)) => ApiResponse::err("fs_list_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_list_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn read_workspace_file(
    workspace_root: String,
    relative_path: String,
) -> ApiResponse<String> {
    let result = tauri::async_runtime::spawn_blocking(move || fs::read_file(&workspace_root, &relative_path))
        .await;

    match result {
        Ok(Ok(contents)) => ApiResponse::ok(contents),
        Ok(Err(error)) => ApiResponse::err("fs_read_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_read_failed", &error.to_string()),
    }
}
