use super::types::ApiResponse;
use crate::integration::document;

#[tauri::command]
pub async fn export_document_copy(
    app: tauri::AppHandle,
    filename: String,
    content: String,
) -> ApiResponse<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    if filename.is_empty()
        || filename.len() > 255
        || filename.contains(['/', '\\', '\0'])
        || filename == "."
        || filename == ".."
        || content.len() > 4 * 1024 * 1024
        || content.contains('\0')
    {
        return ApiResponse::err(
            "export_invalid",
            "Invalid export filename or text exceeds 4 MiB.",
        );
    }
    match tauri::async_runtime::spawn_blocking(move || -> Result<Option<String>, String> {
        let Some(selected) = app
            .dialog()
            .file()
            .set_title("Save a copy — choose a new filename")
            .set_file_name(filename)
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|e| e.to_string())?;
        document::export_copy(&path, &content)?;
        Ok(Some(path.to_string_lossy().into_owned()))
    })
    .await
    {
        Ok(Ok(path)) => ApiResponse::ok(path),
        Ok(Err(error)) => ApiResponse::err("export_failed", &error),
        Err(error) => ApiResponse::err("export_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn get_workspace_file_info(
    workspace_root: String,
    relative_path: String,
) -> ApiResponse<super::types::WorkspaceFileInfoDto> {
    match tauri::async_runtime::spawn_blocking(move || {
        crate::integration::fs::file_info(&workspace_root, &relative_path)
    })
    .await
    {
        Ok(Ok(data)) => ApiResponse::ok(data),
        Ok(Err(error)) => ApiResponse::err("fs_info_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_info_failed", &error.to_string()),
    }
}

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
