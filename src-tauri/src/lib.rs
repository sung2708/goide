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
            ui_bridge::commands::create_workspace_file,
            ui_bridge::commands::create_workspace_folder,
            ui_bridge::commands::delete_workspace_entry,
            ui_bridge::commands::rename_workspace_entry,
            ui_bridge::commands::move_workspace_entry,
            ui_bridge::commands::run_workspace_file,
            ui_bridge::commands::run_workspace_file_with_race,
            ui_bridge::commands::stop_current_run,
            ui_bridge::commands::analyze_active_file_concurrency,
            ui_bridge::commands::get_active_file_diagnostics,
            ui_bridge::commands::get_active_file_completions,
            ui_bridge::commands::activate_scoped_deep_trace,
            ui_bridge::commands::start_debug_session,
            ui_bridge::commands::deactivate_deep_trace,
            ui_bridge::commands::get_runtime_availability,
            ui_bridge::commands::get_toolchain_status,
            ui_bridge::commands::get_runtime_signals,
            ui_bridge::commands::get_runtime_panel_snapshot,
            ui_bridge::commands::get_runtime_topology_snapshot,
            ui_bridge::commands::get_debugger_state,
            ui_bridge::commands::debugger_continue,
            ui_bridge::commands::debugger_pause,
            ui_bridge::commands::debugger_step_over,
            ui_bridge::commands::debugger_step_into,
            ui_bridge::commands::debugger_step_out,
            ui_bridge::commands::debugger_toggle_breakpoint,
            ui_bridge::commands::search_workspace_text,
            ui_bridge::commands::get_workspace_git_snapshot,
            ui_bridge::commands::get_workspace_branches,
            ui_bridge::commands::switch_workspace_branch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
