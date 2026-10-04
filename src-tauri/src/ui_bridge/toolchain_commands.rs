use super::types::{ApiResponse, ToolPathsDto};
use crate::integration::managed_toolchain::{Bundle, Snapshot, Store};
use std::sync::Arc;
use tauri::{AppHandle, Manager, Runtime};
#[tauri::command]
pub async fn managed_toolchain_state<R: Runtime>(app: AppHandle<R>) -> ApiResponse<Snapshot> {
    let store = app.state::<Arc<Store>>().inner().clone();
    match tauri::async_runtime::spawn_blocking(move || store.snapshot()).await {
        Ok(Ok(state)) => ApiResponse::ok(state),
        Ok(Err(error)) => ApiResponse::err("tool_setup_failed", &error),
        Err(error) => ApiResponse::err("tool_setup_failed", &error.to_string()),
    }
}
#[tauri::command]
pub async fn managed_toolchain_start<R: Runtime>(app: AppHandle<R>) -> ApiResponse<String> {
    let store = app.state::<Arc<Store>>().inner().clone();
    match store.begin() {
        Ok((id, cancel)) => {
            let response = id.clone();
            tauri::async_runtime::spawn(store.run(id, cancel));
            ApiResponse::ok(response)
        }
        Err(error) => ApiResponse::err("tool_setup_failed", &error.to_string()),
    }
}
#[tauri::command]
pub async fn managed_toolchain_cancel<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> ApiResponse<()> {
    let store = app.state::<Arc<Store>>();
    match store.cancel(&id) {
        Ok(()) => ApiResponse::ok(()),
        Err(error) => ApiResponse::err("tool_setup_failed", &error),
    }
}
#[tauri::command]
pub async fn managed_toolchain_use<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> ApiResponse<ToolPathsDto> {
    let store = app.state::<Arc<Store>>().inner().clone();
    let _mutation = store.mutation.lock().await;
    let reader = store.clone();
    let bundle = tauri::async_runtime::spawn_blocking(move || reader.bundle(&id)).await;
    match bundle {
        Ok(Ok(Bundle { paths, .. })) => super::commands::configure_toolchain_paths(paths).await,
        Ok(Err(error)) => ApiResponse::err("tool_setup_failed", &error),
        Err(error) => ApiResponse::err("tool_setup_failed", &error.to_string()),
    }
}
#[tauri::command]
pub async fn managed_toolchain_remove<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> ApiResponse<()> {
    let store = app.state::<Arc<Store>>().inner().clone();
    let _mutation = store.mutation.lock().await;
    let owner = store.clone();
    let shells = super::commands::get_shell_sessions_handle();
    match super::commands::with_idle_go_tools(move || {
        let sessions = shells.try_lock().map_err(|_| anyhow::anyhow!("Wait for terminal cleanup before removing tools."))?;
        anyhow::ensure!(sessions.sessions.is_empty() && !crate::integration::shell::owned_cleanup_pending(), "Close terminal sessions before removing a bundle; existing shells may still use its tools.");
        owner.remove(&id).map_err(anyhow::Error::msg)
    })
        .await
    {
        Ok(()) => ApiResponse::ok(()),
        Err(error) => ApiResponse::err("tool_setup_failed", &error.to_string()),
    }
}
