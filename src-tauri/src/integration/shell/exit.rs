use super::{dispose_shell_session_inner, ShellSessionStore};
use crate::ui_bridge::types::{ShellExitPayloadDto, ShellHealthDto};
use std::time::Duration;
use tauri::Emitter;

pub async fn finish<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    store: ShellSessionStore,
    id: String,
    selected_shell: String,
) {
    if !store.lock().await.sessions.contains_key(&id) {
        return;
    }
    let health = match dispose_shell_session_inner(store.clone(), &id).await {
        Ok(()) => ShellHealthDto::Exit,
        Err(error) => {
            eprintln!("Natural terminal cleanup failed: {error:#}");
            if let Ok(mut state) = store.try_lock() {
                if let Some(session) = state.sessions.get_mut(&id) {
                    session.shell_health = ShellHealthDto::Degraded;
                }
            }
            ShellHealthDto::Degraded
        }
    };
    let _ = app.emit(
        "shell-exit",
        ShellExitPayloadDto {
            shell_session_id: id,
            shell_health: health,
            selected_shell: Some(selected_shell),
        },
    );
}

pub fn monitor<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    store: ShellSessionStore,
    id: String,
    selected_shell: String,
) {
    tauri::async_runtime::spawn(async move {
        match wait_for_root(&store, &id).await {
            Ok(false) => (),
            result => {
                if let Err(error) = result {
                    eprintln!("Unable to inspect terminal process: {error}");
                }
                // A descendant can hold the PTY open after the root exits.
                // Root observation therefore triggers ownership cleanup independently of EOF.
                finish(app, store, id, selected_shell).await;
            }
        }
    });
}

pub(super) async fn wait_for_root(store: &ShellSessionStore, id: &str) -> std::io::Result<bool> {
    loop {
        tokio::time::sleep(Duration::from_millis(250)).await;
        if let Ok(mut state) = store.try_lock() {
            let Some(session) = state.sessions.get_mut(id) else {
                return Ok(false);
            };
            if session.child.try_wait()?.is_some() {
                return Ok(true);
            }
        }
    }
}
