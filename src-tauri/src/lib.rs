mod integration;
mod ui_bridge;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            ui_bridge::commands::list_workspace_entries,
            ui_bridge::commands::read_workspace_file,
            ui_bridge::commands::write_workspace_file,
            ui_bridge::commands::run_workspace_file,
            ui_bridge::commands::analyze_active_file_concurrency,
            ui_bridge::commands::get_active_file_diagnostics,
            ui_bridge::commands::get_active_file_completions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
