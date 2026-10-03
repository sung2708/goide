//! Root-bound startup cancellation and confirmed cleanup authority.
use super::*;

async fn cleanup_debug_startup_session(root: &Path, id: uuid::Uuid) -> Result<(), String> {
    let handle = get_dap_session_handle();
    let session = {
        let mut guard = handle.lock().await;
        if guard.as_ref().is_some_and(|session| {
            gopls::normalize_platform_pathbuf(session.workspace_root.clone()) == root
                && session.startup_request_id == id
        }) {
            guard.as_mut().unwrap().owner.mark_cleanup_pending();
            guard.take()
        } else {
            None
        }
    };
    if let Some(session) = session {
        stop_dap_session(session).await?;
    }
    Ok(())
}

fn debug_startup_error_code(error: &anyhow::Error) -> &'static str {
    if crate::integration::language_requests::is_deadline(error) {
        "debug_startup_timed_out"
    } else {
        "debug_startup_cancelled"
    }
}

pub(super) async fn start(
    request: ActivateDeepTraceRequestDto,
    test_name: Option<String>,
) -> ApiResponse<ActivateDeepTraceResponseDto> {
    if request.workspace_root.len() > 8192
        || !Path::new(&request.workspace_root).is_absolute()
        || request.relative_path.len() > 4096
        || request.request_id.len() > 64
        || uuid::Uuid::parse_str(&request.request_id).is_err()
    {
        return ApiResponse::err(
            "debug_startup_invalid",
            "Debug startup requires bounded paths and a request UUID.",
        );
    }
    let root = match resolve_workspace_root(&request.workspace_root) {
        Ok(root) => gopls::normalize_platform_pathbuf(root),
        Err(error) => return ApiResponse::err("debug_startup_invalid", &error),
    };
    let id = uuid::Uuid::parse_str(&request.request_id).unwrap();
    let mut startup = match crate::integration::language_requests::StartupRequest::begin(
        &root,
        &request.request_id,
        Duration::from_secs(120),
    ) {
        Ok(startup) => startup,
        Err(error) => {
            return ApiResponse::err(debug_startup_error_code(&error), &error.to_string())
        }
    };
    let _registration = tokio::select! {
        result = crate::integration::lifecycle::gate().operation() => match result {
            Ok(guard) => guard, Err(error) => return ApiResponse::err("shutdown_in_progress", &error),
        },
        error = startup.stopped() => return ApiResponse::err(debug_startup_error_code(&error), &error.to_string()),
    };
    if let Err(error) = startup.check() {
        return ApiResponse::err(debug_startup_error_code(&error), &error.to_string());
    }
    if get_dap_session_handle().lock().await.is_some()
        || get_process_handle().lock().await.is_some()
    {
        return ApiResponse::err(
            "debug_session_busy",
            "Stop the active owned Run/debugger before starting another request.",
        );
    }
    let mut response = tokio::select! {
        response = start_debug_session_internal(request, test_name, &startup) => response,
        error = startup.stopped() => ApiResponse::err(debug_startup_error_code(&error), &error.to_string()),
    };
    if let Err(error) = startup.check() {
        response = ApiResponse::err(debug_startup_error_code(&error), &error.to_string());
    }
    if response.ok {
        startup.disarm();
    } else {
        let session_cleanup = cleanup_debug_startup_session(&root, id).await;
        let debugger_cleanup = delve::ownership::retry_cleanup().await;
        let tool_cleanup =
            tokio::task::spawn_blocking(crate::integration::owned_tool_output::wait_for_shutdown)
                .await;
        if session_cleanup.is_err()
            || debugger_cleanup.is_err()
            || !matches!(tool_cleanup, Ok(Ok(())))
        {
            return ApiResponse::err(
                "debug_startup_cleanup_pending",
                &format!(
                    "{}; native cleanup remains pending. Retry startup cleanup.",
                    response
                        .error
                        .as_ref()
                        .map_or("Debug startup failed", |error| &error.message)
                ),
            );
        }
    }
    response
}

pub(super) async fn cancel(
    request: crate::ui_bridge::types::LanguageCancelRequestDto,
) -> ApiResponse<()> {
    if request.workspace_root.len() > 8192
        || request.request_id.len() > 64
        || !Path::new(&request.workspace_root).is_absolute()
    {
        return ApiResponse::err(
            "debug_startup_cleanup_pending",
            "Cleanup requires an absolute bounded workspace and UUID.",
        );
    }
    let path = Path::new(&request.workspace_root);
    let root = gopls::normalize_platform_pathbuf(
        path.canonicalize().unwrap_or_else(|_| path.to_path_buf()),
    );
    let id = match uuid::Uuid::parse_str(&request.request_id) {
        Ok(id) => id,
        Err(error) => return ApiResponse::err("debug_startup_cleanup_pending", &error.to_string()),
    };
    {
        let handle = get_dap_session_handle();
        let slot = handle.lock().await;
        if slot.as_ref().is_some_and(|session| {
            session.startup_request_id == id
                && gopls::normalize_platform_pathbuf(session.workspace_root.clone()) != root
        }) {
            return ApiResponse::err(
                "debug_startup_cleanup_pending",
                "Debugger startup belongs to a different workspace.",
            );
        }
    }
    if let Err(error) = crate::integration::language_requests::cancel(&root, &request.request_id) {
        return ApiResponse::err("debug_startup_cleanup_pending", &error.to_string());
    }
    let _registration = match tokio::time::timeout(
        Duration::from_secs(10),
        crate::integration::lifecycle::gate().operation(),
    )
    .await
    {
        Ok(Ok(guard)) => guard,
        Ok(Err(error)) => return ApiResponse::err("debug_startup_cleanup_pending", &error),
        Err(_) => {
            return ApiResponse::err(
                "debug_startup_cleanup_pending",
                "Debug startup registration is still stopping. Retry cleanup.",
            )
        }
    };
    if let Err(error) = cleanup_debug_startup_session(&root, id).await {
        return ApiResponse::err("debug_startup_cleanup_pending", &error);
    }
    if let Err(error) = delve::ownership::retry_cleanup().await {
        return ApiResponse::err("debug_startup_cleanup_pending", &error);
    }
    match tokio::task::spawn_blocking(crate::integration::owned_tool_output::wait_for_shutdown)
        .await
    {
        Ok(Ok(())) => ApiResponse::ok(()),
        Ok(Err(error)) => ApiResponse::err("debug_startup_cleanup_pending", &error),
        Err(error) => ApiResponse::err("debug_startup_cleanup_pending", &error.to_string()),
    }
}
