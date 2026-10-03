use super::types::{ApiResponse, GoProjectInfoDto, GoProjectRequestDto};
#[tauri::command]
pub async fn confirm_go_module_cleanup(
    request: super::types::LanguageCancelRequestDto,
) -> ApiResponse<bool> {
    let cancelled = tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&request.workspace_root);
        if !path.is_absolute() {
            return Err(anyhow::anyhow!(
                "Module cancellation requires an absolute workspace root."
            ));
        }
        let root = crate::integration::gopls::normalize_platform_pathbuf(
            path.canonicalize().unwrap_or_else(|_| path.to_path_buf()),
        );
        crate::integration::language_requests::cancel(&root, &request.request_id)
    })
    .await;
    match cancelled {
        Ok(Ok(_)) => {}
        Ok(Err(error)) => {
            return ApiResponse::err(
                "go_module_cleanup_pending",
                &format!("Cancellation failed; cleanup remains unconfirmed: {error:#}"),
            )
        }
        Err(error) => return ApiResponse::err("go_module_cleanup_pending", &error.to_string()),
    }
    // A stop signal is not a cleanup acknowledgement. The registration gate and
    // owned one-shot workers must clear before the editor can release its lock.
    let _registration = match tokio::time::timeout(std::time::Duration::from_secs(10), crate::integration::lifecycle::gate().operation()).await {
        Ok(Ok(guard)) => guard,
        Ok(Err(error)) => return ApiResponse::err("go_module_cleanup_pending", &error),
        Err(_) => return ApiResponse::err("go_module_cleanup_pending", "Go module processing/cleanup is still pending. Keep this dialog open and retry cleanup."),
    };
    match tauri::async_runtime::spawn_blocking(
        crate::integration::owned_tool_output::wait_for_shutdown,
    )
    .await
    {
        Ok(Ok(())) => ApiResponse::ok(true),
        Ok(Err(error)) => ApiResponse::err("go_module_cleanup_pending", &error),
        Err(error) => ApiResponse::err("go_module_cleanup_pending", &error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn confirm_module_cleanup_rejects_invalid_request_identities_without_acknowledgement() {
        let response =
            super::confirm_go_module_cleanup(super::super::types::LanguageCancelRequestDto {
                workspace_root: std::env::temp_dir().to_string_lossy().into_owned(),
                request_id: "invalid-request".into(),
            })
            .await;
        assert!(!response.ok);
        assert!(response.data.is_none());
        assert!(response.error.unwrap().message.contains("UUID"));
    }
    #[tokio::test]
    async fn confirm_module_cleanup_waits_for_the_owned_cli_and_registration_guard() {
        use crate::integration::{command, language_requests, lifecycle, owned_tool_output};
        let root = std::env::temp_dir().canonicalize().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let registration = lifecycle::gate().operation().await.unwrap();
        let worker_root = crate::integration::gopls::normalize_platform_pathbuf(root.clone());
        let worker_id = id.clone();
        let (ready, receiver) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            let _registration = registration;
            let _scope = language_requests::begin(&worker_root, Some(&worker_id)).unwrap();
            ready.send(()).unwrap();
            #[cfg(windows)]
            let mut child = {
                let mut child = command::std_command("ping.exe");
                child.args(["-n", "90", "127.0.0.1"]);
                child
            };
            #[cfg(not(windows))]
            let mut child = {
                let mut child = command::std_command("sleep");
                child.arg("90");
                child
            };
            owned_tool_output::output(&mut child, None)
                .unwrap_err()
                .kind()
        });
        receiver.recv().unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let response =
            super::confirm_go_module_cleanup(super::super::types::LanguageCancelRequestDto {
                workspace_root: root.to_string_lossy().into_owned(),
                request_id: id,
            })
            .await;
        assert!(response.ok, "{:?}", response.error);
        assert_eq!(response.data, Some(true));
        assert_eq!(worker.join().unwrap(), std::io::ErrorKind::Interrupted);
    }
}
#[tauri::command]
pub async fn run_go_module_action(
    request: super::types::GoModuleRequestDto,
) -> ApiResponse<super::types::GoModuleOutputDto> {
    match super::commands::with_idle_go_tools(move || {
        crate::integration::go_project::actions::run(request)
    })
    .await
    {
        Ok(output) => ApiResponse::ok(output),
        Err(error) => ApiResponse::err("go_module_failed", &error),
    }
}
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
