use super::types::{ApiResponse, LanguageQueryDto, LanguageQueryResultDto};

#[tauri::command]
pub async fn preview_workspace_rename(
    request: super::types::LanguageRenameRequestDto,
) -> ApiResponse<super::types::LanguageRenamePlanDto> {
    match tauri::async_runtime::spawn_blocking(move || {
        crate::integration::rename_symbol::preview(request)
    })
    .await
    {
        Ok(Ok(data)) => ApiResponse::ok(data),
        Ok(Err(error)) => ApiResponse::err("language_rename_failed", &format!("{error:#}")),
        Err(error) => ApiResponse::err("language_rename_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn organize_workspace_imports(
    request: super::types::LanguageFormatRequestDto,
) -> ApiResponse<super::types::LanguageEditPlanDto> {
    match tauri::async_runtime::spawn_blocking(move || {
        crate::integration::organize_imports::organize(request)
    })
    .await
    {
        Ok(Ok(data)) => ApiResponse::ok(data),
        Ok(Err(error)) => ApiResponse::err("language_imports_failed", &format!("{error:#}")),
        Err(error) => ApiResponse::err("language_imports_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn format_workspace_document(
    request: super::types::LanguageFormatRequestDto,
) -> ApiResponse<super::types::LanguageEditPlanDto> {
    match tauri::async_runtime::spawn_blocking(move || {
        crate::integration::language_edits::format(request)
    })
    .await
    {
        Ok(Ok(data)) => ApiResponse::ok(data),
        Ok(Err(error)) => ApiResponse::err("language_format_failed", &format!("{error:#}")),
        Err(error) => ApiResponse::err("language_format_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn query_workspace_language(
    request: LanguageQueryDto,
) -> ApiResponse<LanguageQueryResultDto> {
    match tauri::async_runtime::spawn_blocking(move || crate::integration::language::query(request))
        .await
    {
        Ok(Ok(data)) => ApiResponse::ok(data),
        Ok(Err(error)) => ApiResponse::err("language_query_failed", &format!("{error:#}")),
        Err(error) => ApiResponse::err("language_query_failed", &error.to_string()),
    }
}
