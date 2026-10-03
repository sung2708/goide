use super::types::{ApiResponse, GoProjectInfoDto, GoProjectRequestDto};
#[tauri::command]
pub async fn inspect_go_project(request: GoProjectRequestDto) -> ApiResponse<GoProjectInfoDto> {
    match tauri::async_runtime::spawn_blocking(move || {
        crate::integration::go_project::inspect(request)
    })
    .await
    {
        Ok(Ok(info)) => ApiResponse::ok(info),
        Ok(Err(error)) => ApiResponse::err("go_project_failed", &format!("{error:#}")),
        Err(error) => ApiResponse::err("go_project_failed", &error.to_string()),
    }
}
