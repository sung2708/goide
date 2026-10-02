mod core;
mod integration;
mod ui_bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(error) = integration::process_job::install() {
        eprintln!("Unable to establish owned process boundary: {error}");
        return;
    }
    tauri::Builder::default()
        .manage(integration::fs_watch::FsWatchService::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            ui_bridge::git_commands::git_repository_status,
            ui_bridge::git_commands::git_file_diff,
            ui_bridge::git_commands::git_mutate,
            ui_bridge::git_commands::git_cancel,
            ui_bridge::search_commands::search_workspace_text_v2,
            ui_bridge::search_commands::cancel_workspace_search,
            ui_bridge::search_commands::preview_workspace_replacement,
            ui_bridge::git_commands::git_conflict_content,
            ui_bridge::git_commands::git_history_page,
            ui_bridge::git_commands::git_search_history,
            ui_bridge::git_commands::git_commit_details,
            ui_bridge::git_commands::git_historical_diff,
            ui_bridge::document_commands::get_workspace_file_state,
            ui_bridge::document_commands::get_workspace_file_info,
            ui_bridge::language_commands::query_workspace_language,
            ui_bridge::language_commands::cancel_language_request,
            ui_bridge::language_commands::format_workspace_document,
            ui_bridge::language_commands::organize_workspace_imports,
            ui_bridge::language_commands::preview_workspace_rename,
            ui_bridge::commands::shutdown_owned_resources,
            ui_bridge::commands::list_workspace_entries,
            ui_bridge::commands::read_workspace_file,
            ui_bridge::commands::write_workspace_file,
            ui_bridge::commands::start_workspace_fs_watch,
            ui_bridge::commands::stop_workspace_fs_watch,
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
            ui_bridge::commands::stage_workspace_git_file,
            ui_bridge::commands::unstage_workspace_git_file,
            ui_bridge::commands::commit_workspace_git_changes,
            ui_bridge::commands::get_workspace_commit_detail,
            ui_bridge::commands::get_workspace_git_graph,
            ui_bridge::commands::get_workspace_git_graph_commits,
            ui_bridge::commands::get_workspace_branches,
            ui_bridge::commands::switch_workspace_branch,
            ui_bridge::commands::ensure_shell_session,
            ui_bridge::commands::write_shell_input,
            ui_bridge::commands::resize_shell_session,
            ui_bridge::commands::dispose_shell_session
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = &event {
                if !integration::lifecycle::exit_approved() {
                    use tauri::Emitter;
                    api.prevent_exit();
                    if let Err(error) = app.emit("app-close-requested", ()) {
                        eprintln!("Unable to request safe close: {error}");
                    }
                }
            }
            if matches!(event, tauri::RunEvent::Exit) {
                let response = tauri::async_runtime::block_on(
                    ui_bridge::commands::shutdown_owned_resources(app.clone()),
                );
                if !response.ok {
                    eprintln!("Owned resource shutdown failed");
                }
            }
        });
}
