use super::types::{ApiResponse, LanguageQueryDto, LanguageQueryResultDto};

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
