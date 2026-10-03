use super::types::{ApiResponse, DebuggerInspectionOutputDto, DebuggerInspectionRequestDto};
use tokio::sync::oneshot;

pub(super) struct PendingInspection {
    pub request: DebuggerInspectionRequestDto,
    pub response: oneshot::Sender<Result<DebuggerInspectionOutputDto, String>>,
}

#[tauri::command]
pub async fn query_debugger_inspection(
    request: DebuggerInspectionRequestDto,
) -> ApiResponse<DebuggerInspectionOutputDto> {
    match super::commands::dispatch_debugger_inspection(request).await {
        Ok(output) => ApiResponse::ok(output),
        Err(error) => ApiResponse::err("debugger_inspection_failed", &error),
    }
}
