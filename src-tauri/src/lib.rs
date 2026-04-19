mod core;
mod integration;
mod ui_bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            ui_bridge::commands::list_workspace_entries,
            ui_bridge::commands::read_workspace_file,
            ui_bridge::commands::write_workspace_file,
            ui_bridge::commands::run_workspace_file,
            ui_bridge::commands::run_workspace_file_with_race,
            ui_bridge::commands::analyze_active_file_concurrency,
            ui_bridge::commands::get_active_file_diagnostics,
            ui_bridge::commands::get_active_file_completions,
            ui_bridge::commands::activate_scoped_deep_trace,
            ui_bridge::commands::deactivate_deep_trace,
            ui_bridge::commands::get_runtime_availability,
            ui_bridge::commands::get_toolchain_status,
            ui_bridge::commands::get_runtime_signals
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
