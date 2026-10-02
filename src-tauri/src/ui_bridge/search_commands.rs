use super::types::{ApiResponse, SearchOptionsDto, SearchReportDto};
use crate::integration::search;
#[tauri::command]
pub async fn search_workspace_text_v2(
    workspace_root: String,
    request_id: String,
    query: String,
    options: SearchOptionsDto,
) -> ApiResponse<SearchReportDto> {
    match tauri::async_runtime::spawn_blocking(move || {
        search::search(&workspace_root, &request_id, &query, options)
    })
    .await
    {
        Ok(Ok(report)) => ApiResponse::ok(report),
        Ok(Err(error)) => ApiResponse::err("search_failed", &error),
        Err(error) => ApiResponse::err("search_failed", &error.to_string()),
    }
}
#[tauri::command]
pub fn cancel_workspace_search(request_id: String) -> ApiResponse<bool> {
    match search::cancel(&request_id) {
        Ok(cancelled) => ApiResponse::ok(cancelled),
        Err(error) => ApiResponse::err("search_cancel_failed", &error),
    }
}
#[tauri::command]
pub async fn preview_workspace_replacement(
    request: super::types::ReplacementRequestDto,
) -> ApiResponse<Vec<super::types::ReplacementPlanDto>> {
    match tauri::async_runtime::spawn_blocking(move || {
        crate::integration::replacement::preview(request)
    })
    .await
    {
        Ok(Ok(plans)) => ApiResponse::ok(plans),
        Ok(Err(error)) => ApiResponse::err("replacement_preview_failed", &error),
        Err(error) => ApiResponse::err("replacement_preview_failed", &error.to_string()),
    }
}
