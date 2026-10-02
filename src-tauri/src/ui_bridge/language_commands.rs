use super::types::{ApiResponse, LanguageQueryDto, LanguageQueryResultDto};

#[tauri::command]
pub async fn query_workspace_signature(
    request: LanguageQueryDto,
) -> ApiResponse<Option<super::types::SignatureHelpDto>> {
    match tauri::async_runtime::spawn_blocking(move || {
        crate::integration::signature_help::query(request)
    })
    .await
    {
        Ok(Ok(data)) => ApiResponse::ok(data),
        Ok(Err(error)) => ApiResponse::err("signature_help_failed", &format!("{error:#}")),
        Err(error) => ApiResponse::err("signature_help_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn cancel_language_request(
    request: super::types::LanguageCancelRequestDto,
) -> ApiResponse<bool> {
    match tauri::async_runtime::spawn_blocking(move || {
        let root = crate::integration::gopls::normalize_platform_pathbuf(
            std::path::Path::new(&request.workspace_root).canonicalize()?,
        );
        crate::integration::language_requests::cancel(&root, &request.request_id)
    })
    .await
    {
        Ok(Ok(cancelled)) => ApiResponse::ok(cancelled),
        Ok(Err(error)) => ApiResponse::err("language_cancel_failed", &format!("{error:#}")),
        Err(error) => ApiResponse::err("language_cancel_failed", &error.to_string()),
    }
}

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

#[tauri::command]
pub async fn list_workspace_code_actions(
    request: super::types::LanguageCodeActionQueryDto,
) -> ApiResponse<Vec<super::types::LanguageCodeActionDto>> {
    match tauri::async_runtime::spawn_blocking(move || {
        crate::integration::code_actions::list(request)
    })
    .await
    {
        Ok(Ok(data)) => ApiResponse::ok(data),
        Ok(Err(error)) => ApiResponse::err("code_actions_failed", &format!("{error:#}")),
        Err(error) => ApiResponse::err("code_actions_failed", &error.to_string()),
    }
}
#[tauri::command]
pub async fn preview_workspace_code_action(
    request: super::types::LanguageCodeActionPreviewDto,
) -> ApiResponse<super::types::LanguageEditPlanDto> {
    match tauri::async_runtime::spawn_blocking(move || {
        crate::integration::code_actions::preview(request)
    })
    .await
    {
        Ok(Ok(data)) => ApiResponse::ok(data),
        Ok(Err(error)) => ApiResponse::err("code_action_preview_failed", &format!("{error:#}")),
        Err(error) => ApiResponse::err("code_action_preview_failed", &error.to_string()),
    }
}
