use crate::integration::updates::{self, policy::Channel, Error, Snapshot, Store};
use std::sync::Arc;
#[tauri::command]
pub fn goro_update_state(store: tauri::State<'_, Arc<Store>>) -> Result<Snapshot, Error> {
    store.snapshot()
}
#[tauri::command]
pub async fn goro_update_check(
    app: tauri::AppHandle,
    channel: Option<Channel>,
) -> Result<Snapshot, Error> {
    updates::check(app, channel).await
}
#[tauri::command]
pub async fn goro_update_download(
    app: tauri::AppHandle,
    channel: Option<Channel>,
) -> Result<Snapshot, Error> {
    updates::download(app, channel).await
}
#[tauri::command]
pub fn goro_update_cancel(app: tauri::AppHandle) -> Result<Snapshot, Error> {
    updates::cancel(&app)
}
#[tauri::command]
pub async fn goro_update_install(
    app: tauri::AppHandle,
    channel: Option<Channel>,
) -> Result<Snapshot, Error> {
    updates::install(app, channel).await
}
