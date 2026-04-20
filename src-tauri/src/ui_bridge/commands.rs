use crate::core::analysis::causal::{
    enrich_runtime_signals_with_correlation, StaticCounterpartHint,
};
use crate::integration::delve::{self, DapClient, LaunchMode, RuntimeSignal, RuntimeSignalScope};
use crate::integration::command::std_command;
use crate::integration::fs;
use crate::integration::gopls;
use crate::integration::process::{emit_run_failure, run_go_file, ProcessHandle, RunMode};
use crate::ui_bridge::types::{
    ActivateDeepTraceRequestDto, ActivateDeepTraceResponseDto, AnalyzeConcurrencyRequest,
    ApiResponse, ChannelOperationDto, CompletionItemDto, CompletionRangeDto, CompletionRequestDto,
    CompletionTextEditDto, ConcurrencyConfidenceDto, ConcurrencyConstructDto,
    ConcurrencyConstructKindDto, DebuggerBreakpointDto, DebuggerStateDto,
    DeepTraceConstructKindDto, DiagnosticRangeDto, DiagnosticSeverityDto, DiagnosticsResponseDto,
    DiagnosticsToolingAvailabilityDto, EditorDiagnosticDto, FsEntryDto,
    RuntimeAvailabilityResponseDto, RuntimePanelSnapshotDto, RuntimeSignalDto,
    RuntimeTopologyInteractionDto, RuntimeTopologySnapshotDto, ToggleBreakpointRequestDto,
    ToolAvailabilityDto, ToolchainStatusDto, WorkspaceGitChangedFileDto, WorkspaceGitCommitDto,
    WorkspaceGitSnapshotDto, WorkspaceSearchFileDto, WorkspaceSearchMatchDto,
};
use std::collections::{HashMap, HashSet};
use std::fs as std_fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, oneshot, Mutex};

/// Global shared handle to the currently-running `go run` process.
/// A `OnceLock` gives us a lazily initialized, Send + Sync singleton without unsafe.
static PROCESS_HANDLE: std::sync::OnceLock<ProcessHandle> = std::sync::OnceLock::new();

fn get_process_handle() -> ProcessHandle {
    PROCESS_HANDLE
        .get_or_init(|| Arc::new(Mutex::new(None)))
        .clone()
}

static DAP_SESSION_HANDLE: std::sync::OnceLock<Arc<Mutex<Option<DapSessionHandle>>>> =
    std::sync::OnceLock::new();
static RUNTIME_SIGNALS: std::sync::OnceLock<Arc<Mutex<RuntimeSignalStore>>> =
    std::sync::OnceLock::new();

#[derive(Default)]
struct RuntimeSignalStore {
    healthy: bool,
    signals: Vec<RuntimeSignal>,
    paused: bool,
    active_relative_path: Option<String>,
    active_line: Option<usize>,
    active_column: Option<usize>,
    active_thread_id: Option<i64>,
    breakpoints: HashMap<String, Vec<usize>>,
}

struct DapSessionHandle {
    child: tokio::process::Child,
    stop_tx: oneshot::Sender<()>,
    control_tx: mpsc::UnboundedSender<DebuggerControlCommand>,
    sampler_task: tokio::task::JoinHandle<()>,
}

enum DebuggerControlKind {
    Continue,
    Pause,
    StepOver,
    StepInto,
    StepOut,
    ToggleBreakpoint {
        relative_path: String,
        line: usize,
    },
}

struct DebuggerControlCommand {
    kind: DebuggerControlKind,
    response_tx: oneshot::Sender<Result<(), String>>,
}

fn get_dap_session_handle() -> Arc<Mutex<Option<DapSessionHandle>>> {
    DAP_SESSION_HANDLE
        .get_or_init(|| Arc::new(Mutex::new(None)))
        .clone()
}

fn get_runtime_signals_handle() -> Arc<Mutex<RuntimeSignalStore>> {
    RUNTIME_SIGNALS
        .get_or_init(|| Arc::new(Mutex::new(RuntimeSignalStore::default())))
        .clone()
}

fn is_blocked_wait_reason(wait_reason: &str) -> bool {
    let normalized = wait_reason.trim().to_ascii_lowercase();
    normalized.contains("chan receive")
        || normalized.contains("chan send")
        || normalized.contains("semacquire")
        || normalized.contains("select")
        || normalized.contains("sleep")
        || normalized.contains("io wait")
}

async fn stop_dap_session(session: DapSessionHandle) {
    let DapSessionHandle {
        mut child,
        stop_tx,
        control_tx: _,
        sampler_task,
    } = session;
    let mut sampler_task = sampler_task;

    let _ = stop_tx.send(());
    let _ = child.kill().await;
    let timeout_result = tokio::time::timeout(Duration::from_secs(1), &mut sampler_task).await;
    if timeout_result.is_err() {
        // The sampler task did not complete within the timeout, abort it.
        sampler_task.abort();
    }
}

fn map_runtime_signal(signal: RuntimeSignal) -> RuntimeSignalDto {
    let confidence = match signal.confidence.to_ascii_lowercase().as_str() {
        "likely" => ConcurrencyConfidenceDto::Likely,
        "predicted" => ConcurrencyConfidenceDto::Predicted,
        _ => ConcurrencyConfidenceDto::Confirmed,
    };
    let counterpart_confidence = signal.counterpart_confidence.as_ref().map(|value| {
        match value.to_ascii_lowercase().as_str() {
            "confirmed" => ConcurrencyConfidenceDto::Confirmed,
            "predicted" => ConcurrencyConfidenceDto::Predicted,
            _ => ConcurrencyConfidenceDto::Likely,
        }
    });

    RuntimeSignalDto {
        thread_id: signal.thread_id,
        status: signal.status,
        wait_reason: signal.wait_reason,
        confidence,
        scope_key: signal.scope_key,
        scope_relative_path: signal.scope_relative_path,
        scope_line: signal.scope_line,
        scope_column: signal.scope_column,
        relative_path: signal.relative_path,
        line: signal.line,
        column: signal.column,
        sample_relative_path: signal.sample_relative_path,
        sample_line: signal.sample_line,
        sample_column: signal.sample_column,
        correlation_id: signal.correlation_id,
        counterpart_relative_path: signal.counterpart_relative_path,
        counterpart_line: signal.counterpart_line,
        counterpart_column: signal.counterpart_column,
        counterpart_confidence,
    }
}

#[tauri::command]
pub async fn list_workspace_entries(
    workspace_root: String,
    relative_path: Option<String>,
) -> ApiResponse<Vec<FsEntryDto>> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        fs::list_directory(&workspace_root, relative_path.as_deref())
    })
    .await;

    match result {
        Ok(Ok(entries)) => {
            let mapped = entries
                .into_iter()
                .map(|entry| FsEntryDto {
                    name: entry.name,
                    path: entry.path,
                    is_dir: entry.is_dir,
                })
                .collect();
            ApiResponse::ok(mapped)
        }
        Ok(Err(error)) => ApiResponse::err("fs_list_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_list_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn read_workspace_file(
    workspace_root: String,
    relative_path: String,
) -> ApiResponse<String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        fs::read_file(&workspace_root, &relative_path)
    })
    .await;

    match result {
        Ok(Ok(contents)) => ApiResponse::ok(contents),
        Ok(Err(error)) => ApiResponse::err("fs_read_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_read_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn write_workspace_file(
    workspace_root: String,
    relative_path: String,
    content: String,
) -> ApiResponse<()> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        fs::write_file(&workspace_root, &relative_path, &content)
    })
    .await;

    match result {
        Ok(Ok(())) => ApiResponse::ok(()),
        Ok(Err(error)) => ApiResponse::err("fs_write_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_write_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn run_workspace_file<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    workspace_root: String,
    relative_path: String,
    run_id: String,
) -> ApiResponse<()> {
    if run_id.trim().is_empty() {
        return ApiResponse::err("run_invalid_input", "run id is required");
    }

    let handle = get_process_handle();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_go_file(
            app.clone(),
            workspace_root,
            relative_path,
            run_id.clone(),
            RunMode::Standard,
            handle,
        )
        .await
        {
            emit_run_failure(&app, &run_id, &format!("Failed to start run: {e}"));
            eprintln!("[goide] run_go_file error: {e:#}");
        }
    });
    // Returns immediately — output streams via events
    ApiResponse::ok(())
}

#[tauri::command]
pub async fn run_workspace_file_with_race<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    workspace_root: String,
    relative_path: String,
    run_id: String,
) -> ApiResponse<()> {
    if run_id.trim().is_empty() {
        return ApiResponse::err("run_invalid_input", "run id is required");
    }

    let handle = get_process_handle();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_go_file(
            app.clone(),
            workspace_root,
            relative_path,
            run_id.clone(),
            RunMode::Race,
            handle,
        )
        .await
        {
            emit_run_failure(&app, &run_id, &format!("Failed to start run: {e}"));
            eprintln!("[goide] run_go_file error: {e:#}");
        }
    });
    // Returns immediately — output streams via events
    ApiResponse::ok(())
}

#[tauri::command]
pub async fn analyze_active_file_concurrency(
    request: AnalyzeConcurrencyRequest,
) -> ApiResponse<Vec<ConcurrencyConstructDto>> {
    if let Err(message) = validate_go_analysis_path(&request.relative_path) {
        return ApiResponse::err("analysis_invalid_input", &message);
    }

    let result = tauri::async_runtime::spawn_blocking(move || {
        gopls::analyze_file(&request.workspace_root, &request.relative_path)
    })
    .await;

    match result {
        Ok(Ok(constructs)) => {
            let mapped = constructs
                .into_iter()
                .map(|item| ConcurrencyConstructDto {
                    kind: match item.kind {
                        gopls::ConstructKind::Channel => ConcurrencyConstructKindDto::Channel,
                        gopls::ConstructKind::Select => ConcurrencyConstructKindDto::Select,
                        gopls::ConstructKind::Mutex => ConcurrencyConstructKindDto::Mutex,
                        gopls::ConstructKind::WaitGroup => ConcurrencyConstructKindDto::WaitGroup,
                    },
                    line: item.line,
                    column: item.column,
                    symbol: item.symbol,
                    scope_key: item.scope_key,
                    confidence: match item.confidence {
                        gopls::Confidence::Predicted => ConcurrencyConfidenceDto::Predicted,
                        gopls::Confidence::Likely => ConcurrencyConfidenceDto::Likely,
                        gopls::Confidence::Confirmed => ConcurrencyConfidenceDto::Confirmed,
                    },
                    channel_operation: item.channel_operation.map(|operation| match operation {
                        gopls::ChannelOperation::Send => ChannelOperationDto::Send,
                        gopls::ChannelOperation::Receive => ChannelOperationDto::Receive,
                    }),
                })
                .collect();
            ApiResponse::ok(mapped)
        }
        Ok(Err(error)) => ApiResponse::err("analysis_failed", &error.to_string()),
        Err(error) => ApiResponse::err("analysis_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn get_active_file_diagnostics(
    workspace_root: String,
    relative_path: String,
) -> ApiResponse<DiagnosticsResponseDto> {
    if let Err(message) = validate_go_diagnostics_path(&relative_path) {
        return ApiResponse::err("diagnostics_invalid_input", &message);
    }

    let result = tauri::async_runtime::spawn_blocking(move || {
        gopls::analyze_file_diagnostics(&workspace_root, &relative_path)
    })
    .await;

    match result {
        Ok(Ok(diagnostics_result)) => {
            let mapped = diagnostics_result
                .diagnostics
                .into_iter()
                .map(|item| EditorDiagnosticDto {
                    severity: match item.severity {
                        gopls::DiagnosticSeverity::Error => DiagnosticSeverityDto::Error,
                        gopls::DiagnosticSeverity::Warning => DiagnosticSeverityDto::Warning,
                        gopls::DiagnosticSeverity::Info => DiagnosticSeverityDto::Info,
                    },
                    message: item.message,
                    source: item.source,
                    code: item.code,
                    range: DiagnosticRangeDto {
                        start_line: item.range.start_line,
                        start_column: item.range.start_column,
                        end_line: item.range.end_line,
                        end_column: item.range.end_column,
                    },
                })
                .collect();
            let tooling_availability = match diagnostics_result.tooling_availability {
                gopls::DiagnosticsToolingAvailability::Available => {
                    DiagnosticsToolingAvailabilityDto::Available
                }
                gopls::DiagnosticsToolingAvailability::Unavailable => {
                    DiagnosticsToolingAvailabilityDto::Unavailable
                }
            };
            ApiResponse::ok(DiagnosticsResponseDto {
                diagnostics: mapped,
                tooling_availability,
            })
        }
        Ok(Err(error)) => ApiResponse::err("diagnostics_failed", &error.to_string()),
        Err(error) => ApiResponse::err("diagnostics_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn get_active_file_completions(
    request: CompletionRequestDto,
) -> ApiResponse<Vec<CompletionItemDto>> {
    if let Err(message) = validate_go_completion_path(&request.relative_path) {
        return ApiResponse::err("completion_invalid_input", &message);
    }
    if let Err(message) = validate_completion_cursor(request.line, request.column) {
        return ApiResponse::err("completion_invalid_input", &message);
    }

    let result = tauri::async_runtime::spawn_blocking(move || {
        gopls::get_file_completions(
            &request.workspace_root,
            &request.relative_path,
            request.line,
            request.column,
            request.trigger_character.as_deref(),
            request.file_content.as_deref(),
        )
    })
    .await;

    match result {
        Ok(Ok(items)) => {
            let mapped = items
                .into_iter()
                .map(|item| CompletionItemDto {
                    label: item.label,
                    detail: item.detail,
                    documentation: item.documentation,
                    kind: item.kind,
                    insert_text: item.insert_text,
                    range: item.range.map(|range| CompletionRangeDto {
                        start_line: range.start_line,
                        start_column: range.start_column,
                        end_line: range.end_line,
                        end_column: range.end_column,
                    }),
                    additional_text_edits: item
                        .additional_text_edits
                        .into_iter()
                        .map(|edit| CompletionTextEditDto {
                            range: CompletionRangeDto {
                                start_line: edit.range.start_line,
                                start_column: edit.range.start_column,
                                end_line: edit.range.end_line,
                                end_column: edit.range.end_column,
                            },
                            new_text: edit.new_text,
                        })
                        .collect(),
                })
                .collect();
            ApiResponse::ok(mapped)
        }
        Ok(Err(error)) => ApiResponse::err("completion_failed", &error.to_string()),
        Err(error) => ApiResponse::err("completion_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn activate_scoped_deep_trace(
    request: ActivateDeepTraceRequestDto,
) -> ApiResponse<ActivateDeepTraceResponseDto> {
    if let Err(message) = validate_go_analysis_path(&request.relative_path) {
        return ApiResponse::err("deep_trace_invalid_input", &message);
    }
    if let Err(message) = validate_completion_cursor(request.line, request.column) {
        return ApiResponse::err("deep_trace_invalid_input", &message);
    }
    if request.workspace_root.trim().is_empty() {
        return ApiResponse::err("deep_trace_invalid_input", "workspace root is required");
    }
    if let Err(message) =
        validate_workspace_scoped_go_path(&request.workspace_root, &request.relative_path)
    {
        return ApiResponse::err("deep_trace_invalid_input", &message);
    }

    let symbol = request
        .symbol
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let construct_kind = match request.construct_kind {
        DeepTraceConstructKindDto::Channel => "channel",
        DeepTraceConstructKindDto::Select => "select",
        DeepTraceConstructKindDto::Mutex => "mutex",
        DeepTraceConstructKindDto::WaitGroup => "wait-group",
    };

    // Story 4.1 scope activation only: validate request and return a scoped session marker.
    // Runtime sampling and signal streaming are implemented in later stories.
    let scope_key = format!(
        "{}:{}:{}:{}:{}",
        request.relative_path,
        request.line,
        request.column,
        construct_kind,
        symbol.as_deref().unwrap_or("scope")
    );

    let workspace_root = std::path::PathBuf::from(&request.workspace_root);
    let target_file = workspace_root.join(&request.relative_path);

    if !target_file.exists() {
        return ApiResponse::err(
            "deep_trace_file_not_found",
            &format!("Target file not found: {}", target_file.display()),
        );
    }
    let launch_mode = if request.relative_path.ends_with("_test.go") {
        LaunchMode::Test
    } else {
        LaunchMode::Debug
    };

    let mut dap_process = match delve::spawn_dlv_dap(&workspace_root).await {
        Ok(process) => process,
        Err(error) => {
            return ApiResponse::err("deep_trace_runtime_unavailable", &error.to_string());
        }
    };

    let mut client = match DapClient::connect(dap_process.listen_addr).await {
        Ok(client) => client,
        Err(error) => {
            let _ = dap_process.child.kill().await;
            return ApiResponse::err("deep_trace_runtime_unavailable", &error.to_string());
        }
    };

    if let Err(error) = client.initialize().await {
        let _ = dap_process.child.kill().await;
        return ApiResponse::err("deep_trace_runtime_unavailable", &format!("{error:#}"));
    }

    if let Err(error) = client
        .launch(launch_mode, &workspace_root, &target_file)
        .await
    {
        let _ = client.disconnect().await;
        let _ = dap_process.child.kill().await;
        return ApiResponse::err("deep_trace_runtime_unavailable", &format!("{error:#}"));
    }

    let signals_handle = get_runtime_signals_handle();
    let breakpoint_snapshot = {
        let mut store = signals_handle.lock().await;
        store.signals.clear();
        store.healthy = true;
        store.paused = false;
        store.active_relative_path = None;
        store.active_line = None;
        store.active_column = None;
        store.active_thread_id = None;
        store.breakpoints.clone()
    };

    for (relative_path, lines) in &breakpoint_snapshot {
        if lines.is_empty() {
            continue;
        }
        let resolved_path = workspace_root.join(relative_path);
        if let Err(error) = client.set_breakpoints(&resolved_path, lines).await {
            let _ = client.disconnect().await;
            let _ = dap_process.child.kill().await;
            return ApiResponse::err("debugger_breakpoint_failed", &format!("{error:#}"));
        }
    }

    let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
    let (control_tx, mut control_rx) = mpsc::unbounded_channel::<DebuggerControlCommand>();
    let session_pid = dap_process.child.id();
    let session_handle_for_sampler = get_dap_session_handle();
    let runtime_scope = RuntimeSignalScope {
        scope_key: scope_key.clone(),
        relative_path: request.relative_path.clone(),
        line: request.line,
        column: request.column,
    };
    let static_counterpart_hint = match (
        request.counterpart_relative_path.clone(),
        request.counterpart_line,
        request.counterpart_column,
    ) {
        (Some(relative_path), Some(line), Some(column)) => Some(StaticCounterpartHint {
            relative_path,
            line,
            column,
            confidence: request
                .counterpart_confidence
                .map(|value| match value {
                    ConcurrencyConfidenceDto::Predicted => "predicted".to_string(),
                    ConcurrencyConfidenceDto::Likely => "likely".to_string(),
                    ConcurrencyConfidenceDto::Confirmed => "confirmed".to_string(),
                })
                .unwrap_or_else(|| "predicted".to_string()),
        }),
        _ => None,
    };
    let debugger_workspace_root = workspace_root.clone();
    let sampler_task = tokio::spawn(async move {
        let mut client = client;
        loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    let _ = client.disconnect().await;
                    break;
                }
                Some(control) = control_rx.recv() => {
                    let result: Result<(), String> = async {
                        match control.kind {
                            DebuggerControlKind::Continue => {
                                let threads = client.threads().await.map_err(|error| error.to_string())?;
                                let thread_id = {
                                    let store = signals_handle.lock().await;
                                    select_debug_thread_id(&store, &threads)
                                }
                                .ok_or_else(|| "no active thread to continue".to_string())?;
                                client.continue_thread(thread_id).await.map_err(|error| error.to_string())?;
                                let mut store = signals_handle.lock().await;
                                store.paused = false;
                                store.active_thread_id = Some(thread_id);
                                refresh_debugger_location(&mut client, &mut store).await;
                            }
                            DebuggerControlKind::Pause => {
                                let threads = client.threads().await.map_err(|error| error.to_string())?;
                                let thread_id = {
                                    let store = signals_handle.lock().await;
                                    select_debug_thread_id(&store, &threads)
                                }
                                .ok_or_else(|| "no active thread to pause".to_string())?;
                                client.pause_thread(thread_id).await.map_err(|error| error.to_string())?;
                                let mut store = signals_handle.lock().await;
                                store.paused = true;
                                store.active_thread_id = Some(thread_id);
                                refresh_debugger_location(&mut client, &mut store).await;
                            }
                            DebuggerControlKind::StepOver => {
                                let threads = client.threads().await.map_err(|error| error.to_string())?;
                                let thread_id = {
                                    let store = signals_handle.lock().await;
                                    select_debug_thread_id(&store, &threads)
                                }
                                .ok_or_else(|| "no active thread to step over".to_string())?;
                                client.next(thread_id).await.map_err(|error| error.to_string())?;
                                let mut store = signals_handle.lock().await;
                                store.paused = true;
                                store.active_thread_id = Some(thread_id);
                                refresh_debugger_location(&mut client, &mut store).await;
                            }
                            DebuggerControlKind::StepInto => {
                                let threads = client.threads().await.map_err(|error| error.to_string())?;
                                let thread_id = {
                                    let store = signals_handle.lock().await;
                                    select_debug_thread_id(&store, &threads)
                                }
                                .ok_or_else(|| "no active thread to step into".to_string())?;
                                client.step_in(thread_id).await.map_err(|error| error.to_string())?;
                                let mut store = signals_handle.lock().await;
                                store.paused = true;
                                store.active_thread_id = Some(thread_id);
                                refresh_debugger_location(&mut client, &mut store).await;
                            }
                            DebuggerControlKind::StepOut => {
                                let threads = client.threads().await.map_err(|error| error.to_string())?;
                                let thread_id = {
                                    let store = signals_handle.lock().await;
                                    select_debug_thread_id(&store, &threads)
                                }
                                .ok_or_else(|| "no active thread to step out".to_string())?;
                                client.step_out(thread_id).await.map_err(|error| error.to_string())?;
                                let mut store = signals_handle.lock().await;
                                store.paused = true;
                                store.active_thread_id = Some(thread_id);
                                refresh_debugger_location(&mut client, &mut store).await;
                            }
                            DebuggerControlKind::ToggleBreakpoint { relative_path, line } => {
                                let mut store = signals_handle.lock().await;
                                toggle_breakpoint_in_store(&mut store, &relative_path, line);
                                let line_snapshot = store
                                    .breakpoints
                                    .get(&relative_path)
                                    .cloned()
                                    .unwrap_or_default();
                                drop(store);
                                let resolved_path = debugger_workspace_root.join(&relative_path);
                                client
                                    .set_breakpoints(&resolved_path, &line_snapshot)
                                    .await
                                    .map_err(|error| error.to_string())?;
                            }
                        }
                        Ok(())
                    }
                    .await;
                    let _ = control.response_tx.send(result);
                }
                _ = tokio::time::sleep(Duration::from_millis(500)) => {
                    match client.threads().await {
                        Ok(threads) => {
                            let mut mapped = Vec::new();
                            for thread in &threads {
                                // Performance: only fetch stack trace for relevant concurrency threads
                                if delve::parse_thread_wait_state(&thread.name).is_some() {
                                    let frame = client.stack_trace(thread.id).await.unwrap_or(None);
                                    if let Some(signal) = delve::thread_to_runtime_signal(
                                        thread,
                                        &runtime_scope,
                                        frame.as_ref(),
                                    ) {
                                        mapped.push(signal);
                                    }
                                }
                            }
                            let correlated = enrich_runtime_signals_with_correlation(
                                &mapped,
                                static_counterpart_hint.as_ref(),
                            );
                            let mut store = signals_handle.lock().await;
                            store.signals = correlated;
                            store.healthy = true;
                            if !store.paused {
                                store.active_thread_id = threads.first().map(|thread| thread.id);
                            }
                        }
                        Err(_) => {
                            let _ = client.disconnect().await;
                            let should_clear_current = {
                                let mut session_guard = session_handle_for_sampler.lock().await;
                                let should_clear_current = session_guard
                                    .as_ref()
                                    .and_then(|session| session.child.id())
                                    == session_pid;
                                if should_clear_current {
                                    *session_guard = None;
                                }
                                should_clear_current
                            };
                            if should_clear_current {
                                let mut store = signals_handle.lock().await;
                                store.signals.clear();
                                store.healthy = false;
                            }
                            break;
                        }
                    }
                }
            }
        }
    });

    let session_handle = get_dap_session_handle();
    let previous_session = {
        let mut guard = session_handle.lock().await;
        guard.replace(DapSessionHandle {
            child: dap_process.child,
            stop_tx,
            control_tx,
            sampler_task,
        })
    };
    if let Some(previous) = previous_session {
        stop_dap_session(previous).await;
    }

    ApiResponse::ok(ActivateDeepTraceResponseDto {
        mode: "deep-trace".to_string(),
        scope_key: Some(scope_key),
    })
}

#[tauri::command]
pub async fn get_runtime_availability() -> ApiResponse<RuntimeAvailabilityResponseDto> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        std_command("dlv").arg("version").output()
    })
    .await;

    let runtime_availability = match result {
        Ok(Ok(output)) if output.status.success() => "available",
        _ => "unavailable",
    };

    ApiResponse::ok(RuntimeAvailabilityResponseDto {
        runtime_availability: runtime_availability.to_string(),
    })
}

fn command_version(command: &str, args: &[&str]) -> ToolAvailabilityDto {
    let output = std_command(command).args(args).output();
    match output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let version = stdout
                .lines()
                .chain(stderr.lines())
                .map(str::trim)
                .find(|line| !line.is_empty())
                .map(str::to_string);
            ToolAvailabilityDto {
                available: true,
                version,
            }
        }
        _ => ToolAvailabilityDto {
            available: false,
            version: None,
        },
    }
}

#[tauri::command]
pub async fn get_toolchain_status() -> ApiResponse<ToolchainStatusDto> {
    let result = tauri::async_runtime::spawn_blocking(move || ToolchainStatusDto {
        go: command_version("go", &["version"]),
        gopls: command_version("gopls", &["version"]),
        delve: command_version("dlv", &["version"]),
    })
    .await;

    match result {
        Ok(status) => ApiResponse::ok(status),
        Err(error) => ApiResponse::err("toolchain_status_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn get_runtime_signals() -> ApiResponse<Vec<RuntimeSignalDto>> {
    let signals_handle = get_runtime_signals_handle();
    let store = signals_handle.lock().await;
    if !store.healthy {
        return ApiResponse::err(
            "deep_trace_session_inactive",
            "Deep Trace session is not active",
        );
    }

    ApiResponse::ok(
        store
            .signals
            .clone()
            .into_iter()
            .map(map_runtime_signal)
            .collect(),
    )
}

#[tauri::command]
pub async fn create_workspace_file(
    workspace_root: String,
    relative_path: String,
    content: Option<String>,
) -> ApiResponse<()> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        fs::create_file(
            &workspace_root,
            &relative_path,
            content.as_deref().unwrap_or_default(),
        )
    })
    .await;

    match result {
        Ok(Ok(())) => ApiResponse::ok(()),
        Ok(Err(error)) => ApiResponse::err("fs_create_file_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_create_file_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn create_workspace_folder(
    workspace_root: String,
    relative_path: String,
) -> ApiResponse<()> {
    let result =
        tauri::async_runtime::spawn_blocking(move || fs::create_folder(&workspace_root, &relative_path))
            .await;

    match result {
        Ok(Ok(())) => ApiResponse::ok(()),
        Ok(Err(error)) => ApiResponse::err("fs_create_folder_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_create_folder_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn delete_workspace_entry(
    workspace_root: String,
    relative_path: String,
) -> ApiResponse<()> {
    let result =
        tauri::async_runtime::spawn_blocking(move || fs::delete_entry(&workspace_root, &relative_path))
            .await;

    match result {
        Ok(Ok(())) => ApiResponse::ok(()),
        Ok(Err(error)) => ApiResponse::err("fs_delete_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_delete_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn rename_workspace_entry(
    workspace_root: String,
    relative_path: String,
    new_name: String,
) -> ApiResponse<String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        fs::rename_entry(&workspace_root, &relative_path, &new_name)
    })
    .await;

    match result {
        Ok(Ok(next_relative_path)) => ApiResponse::ok(next_relative_path),
        Ok(Err(error)) => ApiResponse::err("fs_rename_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_rename_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn move_workspace_entry(
    workspace_root: String,
    relative_path: String,
    destination_relative_path: String,
) -> ApiResponse<String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        fs::move_entry(&workspace_root, &relative_path, &destination_relative_path)
    })
    .await;

    match result {
        Ok(Ok(next_relative_path)) => ApiResponse::ok(next_relative_path),
        Ok(Err(error)) => ApiResponse::err("fs_move_failed", &error.to_string()),
        Err(error) => ApiResponse::err("fs_move_failed", &error.to_string()),
    }
}

fn flatten_breakpoints(store: &RuntimeSignalStore) -> Vec<DebuggerBreakpointDto> {
    let mut items = store
        .breakpoints
        .iter()
        .flat_map(|(path, lines)| {
            lines.iter().map(|line| DebuggerBreakpointDto {
                relative_path: path.clone(),
                line: *line,
            })
        })
        .collect::<Vec<_>>();
    items.sort_by(|left, right| {
        left.relative_path
            .cmp(&right.relative_path)
            .then(left.line.cmp(&right.line))
    });
    items
}

fn map_debugger_state(session_active: bool, store: &RuntimeSignalStore) -> DebuggerStateDto {
    DebuggerStateDto {
        session_active,
        paused: store.paused,
        active_relative_path: store.active_relative_path.clone(),
        active_line: store.active_line,
        active_column: store.active_column,
        breakpoints: flatten_breakpoints(store),
    }
}

fn toggle_breakpoint_in_store(store: &mut RuntimeSignalStore, relative_path: &str, line: usize) {
    let mut remove_entry = false;
    {
        let lines = store
            .breakpoints
            .entry(relative_path.to_string())
            .or_default();
        if lines.contains(&line) {
            lines.retain(|item| *item != line);
            remove_entry = lines.is_empty();
        } else {
            lines.push(line);
            lines.sort_unstable();
        }
    }
    if remove_entry {
        store.breakpoints.remove(relative_path);
    }
}

fn select_debug_thread_id(store: &RuntimeSignalStore, threads: &[delve::DapThread]) -> Option<i64> {
    if let Some(active) = store.active_thread_id {
        if threads.iter().any(|thread| thread.id == active) {
            return Some(active);
        }
    }
    threads.first().map(|thread| thread.id)
}

async fn refresh_debugger_location(client: &mut DapClient, store: &mut RuntimeSignalStore) {
    if !store.paused {
        store.active_relative_path = None;
        store.active_line = None;
        store.active_column = None;
        return;
    }
    let Ok(threads) = client.threads().await else {
        return;
    };
    let Some(thread_id) = select_debug_thread_id(store, &threads) else {
        return;
    };
    store.active_thread_id = Some(thread_id);
    if let Ok(frame) = client.stack_trace(thread_id).await {
        if let Some(frame) = frame {
            store.active_relative_path = Some(frame.relative_path);
            store.active_line = Some(frame.line);
            store.active_column = Some(frame.column);
            return;
        }
    }
    store.active_relative_path = None;
    store.active_line = None;
    store.active_column = None;
}

#[tauri::command]
pub async fn get_runtime_panel_snapshot() -> ApiResponse<RuntimePanelSnapshotDto> {
    let session_handle = get_dap_session_handle();
    let session_active = {
        let guard = session_handle.lock().await;
        guard.is_some()
    };

    let signals_handle = get_runtime_signals_handle();
    let store = signals_handle.lock().await;
    let blocked_count = store
        .signals
        .iter()
        .filter(|signal| is_blocked_wait_reason(&signal.wait_reason))
        .count();
    let goroutine_count = store
        .signals
        .iter()
        .map(|signal| signal.thread_id)
        .collect::<HashSet<_>>()
        .len();

    ApiResponse::ok(RuntimePanelSnapshotDto {
        session_active,
        signal_count: store.signals.len(),
        blocked_count,
        goroutine_count,
    })
}

fn classify_runtime_interaction(wait_reason: &str) -> &'static str {
    let normalized = wait_reason.to_ascii_lowercase();
    if normalized.contains("chan") {
        "channel"
    } else if normalized.contains("semacquire") {
        "mutex"
    } else {
        "blocking"
    }
}

#[tauri::command]
pub async fn get_runtime_topology_snapshot() -> ApiResponse<RuntimeTopologySnapshotDto> {
    let session_handle = get_dap_session_handle();
    let session_active = {
        let guard = session_handle.lock().await;
        guard.is_some()
    };

    let signals_handle = get_runtime_signals_handle();
    let store = signals_handle.lock().await;
    if !session_active || !store.healthy {
        return ApiResponse::ok(RuntimeTopologySnapshotDto {
            session_active: false,
            interactions: Vec::new(),
        });
    }

    let interactions = store
        .signals
        .iter()
        .map(|signal| {
            let interaction_kind = classify_runtime_interaction(&signal.wait_reason).to_string();
            let source = format!(
                "g#{} @ {}:{}",
                signal.thread_id, signal.relative_path, signal.line
            );
            let target = signal
                .counterpart_relative_path
                .as_ref()
                .zip(signal.counterpart_line)
                .map(|(path, line)| format!("{path}:{line}"));
            RuntimeTopologyInteractionDto {
                thread_id: signal.thread_id,
                kind: interaction_kind,
                wait_reason: signal.wait_reason.clone(),
                source,
                target,
                confidence: match signal.confidence.as_str() {
                    "predicted" => ConcurrencyConfidenceDto::Predicted,
                    "likely" => ConcurrencyConfidenceDto::Likely,
                    _ => ConcurrencyConfidenceDto::Confirmed,
                },
            }
        })
        .collect();

    ApiResponse::ok(RuntimeTopologySnapshotDto {
        session_active: true,
        interactions,
    })
}

async fn send_debugger_control(kind: DebuggerControlKind) -> Result<(), String> {
    let session_handle = get_dap_session_handle();
    let control_tx = {
        let guard = session_handle.lock().await;
        guard
            .as_ref()
            .map(|session| session.control_tx.clone())
            .ok_or_else(|| "debug session is not active".to_string())?
    };
    let (response_tx, response_rx) = oneshot::channel::<Result<(), String>>();
    control_tx
        .send(DebuggerControlCommand { kind, response_tx })
        .map_err(|_| "debugger control channel is unavailable".to_string())?;
    match response_rx.await {
        Ok(result) => result,
        Err(_) => Err("debugger control response failed".to_string()),
    }
}

#[tauri::command]
pub async fn get_debugger_state() -> ApiResponse<DebuggerStateDto> {
    let session_handle = get_dap_session_handle();
    let session_active = {
        let guard = session_handle.lock().await;
        guard.is_some()
    };
    let signals_handle = get_runtime_signals_handle();
    let store = signals_handle.lock().await;
    ApiResponse::ok(map_debugger_state(session_active, &store))
}

#[tauri::command]
pub async fn debugger_continue() -> ApiResponse<()> {
    match send_debugger_control(DebuggerControlKind::Continue).await {
        Ok(()) => ApiResponse::ok(()),
        Err(message) => ApiResponse::err("debugger_continue_failed", &message),
    }
}

#[tauri::command]
pub async fn debugger_pause() -> ApiResponse<()> {
    match send_debugger_control(DebuggerControlKind::Pause).await {
        Ok(()) => ApiResponse::ok(()),
        Err(message) => ApiResponse::err("debugger_pause_failed", &message),
    }
}

#[tauri::command]
pub async fn debugger_step_over() -> ApiResponse<()> {
    match send_debugger_control(DebuggerControlKind::StepOver).await {
        Ok(()) => ApiResponse::ok(()),
        Err(message) => ApiResponse::err("debugger_step_over_failed", &message),
    }
}

#[tauri::command]
pub async fn debugger_step_into() -> ApiResponse<()> {
    match send_debugger_control(DebuggerControlKind::StepInto).await {
        Ok(()) => ApiResponse::ok(()),
        Err(message) => ApiResponse::err("debugger_step_into_failed", &message),
    }
}

#[tauri::command]
pub async fn debugger_step_out() -> ApiResponse<()> {
    match send_debugger_control(DebuggerControlKind::StepOut).await {
        Ok(()) => ApiResponse::ok(()),
        Err(message) => ApiResponse::err("debugger_step_out_failed", &message),
    }
}

#[tauri::command]
pub async fn debugger_toggle_breakpoint(
    request: ToggleBreakpointRequestDto,
) -> ApiResponse<DebuggerStateDto> {
    if request.line < 1 {
        return ApiResponse::err("debugger_breakpoint_invalid", "line must be >= 1");
    }
    if request.relative_path.trim().is_empty() {
        return ApiResponse::err("debugger_breakpoint_invalid", "relative path is required");
    }
    if let Err(message) = validate_go_analysis_path(&request.relative_path) {
        return ApiResponse::err("debugger_breakpoint_invalid", &message);
    }

    let session_active = {
        let session_handle = get_dap_session_handle();
        let guard = session_handle.lock().await;
        guard.is_some()
    };

    if session_active {
        match send_debugger_control(DebuggerControlKind::ToggleBreakpoint {
            relative_path: request.relative_path,
            line: request.line,
        })
        .await
        {
            Ok(()) => get_debugger_state().await,
            Err(message) => ApiResponse::err("debugger_breakpoint_failed", &message),
        }
    } else {
        let signals_handle = get_runtime_signals_handle();
        let mut store = signals_handle.lock().await;
        toggle_breakpoint_in_store(&mut store, &request.relative_path, request.line);
        ApiResponse::ok(map_debugger_state(false, &store))
    }
}

fn resolve_workspace_root(workspace_root: &str) -> Result<PathBuf, String> {
    let root = Path::new(workspace_root)
        .canonicalize()
        .map_err(|error| format!("workspace root does not exist: {error}"))?;
    if !root.is_dir() {
        return Err("workspace root must be a directory".to_string());
    }
    Ok(root)
}

fn should_search_file(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|value| value.to_ascii_lowercase());
    match extension.as_deref() {
        Some("go")
        | Some("mod")
        | Some("sum")
        | Some("md")
        | Some("txt")
        | Some("json")
        | Some("yaml")
        | Some("yml")
        | Some("toml")
        | Some("rs")
        | Some("ts")
        | Some("tsx")
        | Some("js")
        | Some("jsx")
        | Some("css")
        | Some("html") => true,
        _ => false,
    }
}

fn collect_search_results(
    root: &Path,
    current: &Path,
    query: &str,
    results: &mut Vec<WorkspaceSearchFileDto>,
    file_cap: usize,
) {
    if results.len() >= file_cap {
        return;
    }
    let Ok(entries) = std_fs::read_dir(current) else {
        return;
    };
    for entry in entries.flatten() {
        if results.len() >= file_cap {
            break;
        }
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if matches!(
                name.as_str(),
                ".git" | "node_modules" | "target" | "dist" | ".turbo" | ".cache" | "vendor"
            ) {
                continue;
            }
            collect_search_results(root, &path, query, results, file_cap);
            continue;
        }
        if !file_type.is_file() || !should_search_file(&path) {
            continue;
        }
        
        // Skip large files (> 1MB) for search performance
        if let Ok(metadata) = path.metadata() {
            if metadata.len() > 1_000_000 {
                continue;
            }
        }

        let Ok(content) = std_fs::read_to_string(&path) else {
            continue;
        };
        let mut matches = Vec::new();
        for (index, line) in content.lines().enumerate() {
            if line.to_ascii_lowercase().contains(query) {
                matches.push(WorkspaceSearchMatchDto {
                    line: index + 1,
                    preview: line.trim().to_string(),
                });
                if matches.len() >= 10 {
                    break;
                }
            }
        }
        if matches.is_empty() {
            continue;
        }
        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        results.push(WorkspaceSearchFileDto {
            relative_path,
            matches,
        });
    }
}

fn search_with_git_grep(
    root: &Path,
    query: &str,
) -> Result<Vec<WorkspaceSearchFileDto>, String> {
    let output = std_command("git")
        .arg("grep")
        .arg("-i")
        .arg("-I")
        .arg("--line-number")
        .arg("--")
        .arg(query)
        .current_dir(root)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() && output.status.code() != Some(1) {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut file_map: HashMap<String, Vec<WorkspaceSearchMatchDto>> = HashMap::new();
    
    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(3, ':').collect();
        if parts.len() < 3 {
            continue;
        }
        
        let path = parts[0].replace('\\', "/");
        let line_num = parts[1].parse::<usize>().unwrap_or(0);
        let preview = parts[2].trim().to_string();
        
        if line_num == 0 {
            continue;
        }
        
        let matches = file_map.entry(path).or_insert_with(Vec::new);
        if matches.len() < 10 {
            matches.push(WorkspaceSearchMatchDto {
                line: line_num,
                preview,
            });
        }
    }

    let mut results: Vec<WorkspaceSearchFileDto> = file_map
        .into_iter()
        .map(|(relative_path, matches)| WorkspaceSearchFileDto {
            relative_path,
            matches,
        })
        .collect();
    
    results.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    
    // Limit to 100 files for git grep to maintain UI performance
    if results.len() > 100 {
        results.truncate(100);
    }
    
    Ok(results)
}

#[tauri::command]
pub async fn search_workspace_text(
    workspace_root: String,
    query: String,
) -> ApiResponse<Vec<WorkspaceSearchFileDto>> {
    let trimmed = query.trim().to_ascii_lowercase();
    if trimmed.is_empty() {
        return ApiResponse::ok(Vec::new());
    }
    let root = match resolve_workspace_root(&workspace_root) {
        Ok(path) => path,
        Err(message) => return ApiResponse::err("search_invalid_workspace", &message),
    };

    let is_git = root.join(".git").exists();
    let query_clone = trimmed.clone();
    let root_clone = root.clone();

    let result = tauri::async_runtime::spawn_blocking(move || -> Result<Vec<WorkspaceSearchFileDto>, String> {
        if is_git {
            if let Ok(results) = search_with_git_grep(&root_clone, &query_clone) {
                return Ok(results);
            }
        }
        
        let mut files = Vec::new();
        collect_search_results(&root_clone, &root_clone, &query_clone, &mut files, 100);
        Ok(files)
    })
    .await;

    match result {
        Ok(Ok(files)) => ApiResponse::ok(files),
        Ok(Err(message)) => ApiResponse::err("search_failed", &message),
        Err(error) => ApiResponse::err("search_failed", &error.to_string()),
    }
}

fn run_git_command(root: &Path, args: &[&str]) -> Result<String, String> {
    let output = std_command("git")
        .args(args)
        .current_dir(root)
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "git command failed".to_string()
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn get_workspace_git_snapshot(
    workspace_root: String,
) -> ApiResponse<WorkspaceGitSnapshotDto> {
    let root = match resolve_workspace_root(&workspace_root) {
        Ok(path) => path,
        Err(message) => return ApiResponse::err("git_invalid_workspace", &message),
    };

    let snapshot_result = tauri::async_runtime::spawn_blocking(move || {
        let branch = run_git_command(&root, &["rev-parse", "--abbrev-ref", "HEAD"])
            .map(|value| value.trim().to_string())
            .map_err(|message| format!("git_unavailable::{message}"))?;

        let status_output = run_git_command(&root, &["status", "--porcelain"])
            .map_err(|message| format!("git_status_failed::{message}"))?;
        let changed_files = status_output
            .lines()
            .filter_map(|line| {
                if line.len() < 4 {
                    return None;
                }
                let status = line[..2].trim().to_string();
                let path = line[3..].trim().replace('\\', "/");
                if path.is_empty() {
                    return None;
                }
                Some(WorkspaceGitChangedFileDto { path, status })
            })
            .collect();

        let commits_output = run_git_command(
            &root,
            &["log", "--pretty=format:%h%x09%an%x09%ar%x09%s", "-n", "20"],
        )
        .map_err(|message| format!("git_log_failed::{message}"))?;
        let commits = commits_output
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.splitn(4, '\t').collect();
                if parts.len() < 4 {
                    return None;
                }
                Some(WorkspaceGitCommitDto {
                    hash: parts[0].to_string(),
                    author: parts[1].to_string(),
                    relative_time: parts[2].to_string(),
                    subject: parts[3].to_string(),
                })
            })
            .collect();

        Ok::<WorkspaceGitSnapshotDto, String>(WorkspaceGitSnapshotDto {
            branch,
            changed_files,
            commits,
        })
    })
    .await;

    match snapshot_result {
        Ok(Ok(snapshot)) => ApiResponse::ok(snapshot),
        Ok(Err(error)) => {
            let mut parts = error.splitn(2, "::");
            let code = parts.next().unwrap_or("git_failed");
            let message = parts.next().unwrap_or("git command failed");
            ApiResponse::err(code, message)
        }
        Err(error) => ApiResponse::err("git_failed", &error.to_string()),
    }
}

#[tauri::command]
pub async fn deactivate_deep_trace() -> ApiResponse<()> {
    let session_handle = get_dap_session_handle();
    let existing_session = {
        let mut guard = session_handle.lock().await;
        guard.take()
    };

    if let Some(session) = existing_session {
        stop_dap_session(session).await;
    }

    let signals_handle = get_runtime_signals_handle();
    let mut store = signals_handle.lock().await;
    store.signals.clear();
    store.healthy = false;
    store.paused = false;
    store.active_relative_path = None;
    store.active_line = None;
    store.active_column = None;
    store.active_thread_id = None;
    ApiResponse::ok(())
}

fn validate_go_analysis_path(relative_path: &str) -> Result<(), String> {
    let normalized = relative_path.trim();
    if normalized.is_empty() {
        return Err("relative path is required".to_string());
    }

    let path = Path::new(normalized);
    if path.is_absolute() {
        return Err("absolute paths are not allowed".to_string());
    }

    for component in path.components() {
        if matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err("relative path must stay within workspace".to_string());
        }
    }

    let is_go = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("go"))
        .unwrap_or(false);

    if !is_go {
        return Err("only .go files are supported for static concurrency analysis".to_string());
    }

    Ok(())
}

fn validate_go_diagnostics_path(relative_path: &str) -> Result<(), String> {
    validate_go_analysis_path(relative_path)
}

fn validate_go_completion_path(relative_path: &str) -> Result<(), String> {
    validate_go_analysis_path(relative_path)
}

fn validate_completion_cursor(line: usize, column: usize) -> Result<(), String> {
    if line == 0 {
        return Err("line must be >= 1".to_string());
    }
    if column == 0 {
        return Err("column must be >= 1".to_string());
    }
    Ok(())
}

fn validate_workspace_scoped_go_path(
    workspace_root: &str,
    relative_path: &str,
) -> Result<(), String> {
    let root = Path::new(workspace_root)
        .canonicalize()
        .map_err(|_| "workspace root does not exist".to_string())?;

    let joined = root.join(relative_path);
    let target = joined
        .canonicalize()
        .map_err(|_| "target file does not exist".to_string())?;

    if !target.starts_with(&root) {
        return Err("relative path must stay within workspace".to_string());
    }

    let is_go = target
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("go"))
        .unwrap_or(false);
    if !is_go {
        return Err("only .go files are supported for deep trace activation".to_string());
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        deactivate_deep_trace, debugger_toggle_breakpoint, get_dap_session_handle,
        get_runtime_signals, get_runtime_signals_handle, validate_completion_cursor,
        validate_go_analysis_path, validate_go_completion_path, validate_go_diagnostics_path,
        validate_workspace_scoped_go_path,
    };
    use crate::ui_bridge::types::ToggleBreakpointRequestDto;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn rejects_non_go_paths_for_analysis() {
        let err = validate_go_analysis_path("README.md").expect_err("must reject non-go file");
        assert!(err.contains(".go"));
    }

    #[test]
    fn rejects_parent_traversal_paths_for_analysis() {
        let err = validate_go_analysis_path("../secrets.go")
            .expect_err("must reject path traversal outside workspace");
        assert!(err.contains("within workspace"));
    }

    #[test]
    fn accepts_relative_go_file_path() {
        validate_go_analysis_path("pkg/service/main.go")
            .expect("must accept normal relative go file");
    }

    #[test]
    fn diagnostics_path_rejects_non_go_files() {
        let err = validate_go_diagnostics_path("README.md")
            .expect_err("must reject diagnostics for non-go file");
        assert!(err.contains(".go"));
    }

    #[test]
    fn diagnostics_path_rejects_parent_traversal() {
        let err = validate_go_diagnostics_path("../outside.go")
            .expect_err("must reject diagnostics traversal outside workspace");
        assert!(err.contains("within workspace"));
    }

    #[test]
    fn diagnostics_path_accepts_relative_go_file() {
        validate_go_diagnostics_path("pkg/service/main.go")
            .expect("must accept valid go file diagnostics path");
    }

    #[test]
    fn completion_path_rejects_non_go_files() {
        let err = validate_go_completion_path("README.md")
            .expect_err("must reject completions for non-go file");
        assert!(err.contains(".go"));
    }

    #[test]
    fn completion_path_rejects_parent_traversal() {
        let err = validate_go_completion_path("../outside.go")
            .expect_err("must reject completion traversal outside workspace");
        assert!(err.contains("within workspace"));
    }

    #[test]
    fn completion_path_accepts_relative_go_file() {
        validate_go_completion_path("pkg/service/main.go")
            .expect("must accept valid go file completion path");
    }

    #[test]
    fn completion_cursor_rejects_zero_line() {
        let err = validate_completion_cursor(0, 1).expect_err("must reject line 0");
        assert!(err.contains("line"));
    }

    #[test]
    fn completion_cursor_rejects_zero_column() {
        let err = validate_completion_cursor(1, 0).expect_err("must reject column 0");
        assert!(err.contains("column"));
    }

    #[test]
    fn completion_cursor_accepts_positive_positions() {
        validate_completion_cursor(3, 12).expect("must accept positive cursor positions");
    }

    #[test]
    fn scoped_go_path_rejects_missing_workspace() {
        let err = validate_workspace_scoped_go_path("/path/does/not/exist", "main.go")
            .expect_err("must reject missing workspace");
        assert!(err.contains("workspace root"));
    }

    #[test]
    fn scoped_go_path_rejects_nonexistent_file() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock must be after unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("goide_scope_missing_{unique}"));
        fs::create_dir_all(&root).expect("create temp workspace");

        let err = validate_workspace_scoped_go_path(root.to_str().unwrap_or(""), "main.go")
            .expect_err("must reject missing target");
        assert!(err.contains("does not exist"));
    }

    #[test]
    fn scoped_go_path_accepts_existing_go_file_in_workspace() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock must be after unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("goide_scope_ok_{unique}"));
        fs::create_dir_all(&root).expect("create temp workspace");
        fs::write(root.join("main.go"), "package main\n").expect("write go file");

        validate_workspace_scoped_go_path(root.to_str().unwrap_or(""), "main.go")
            .expect("must accept in-workspace go file");
    }

    #[tokio::test]
    async fn runtime_signals_reject_when_deep_trace_session_is_inactive() {
        let signals_handle = get_runtime_signals_handle();
        {
            let mut store = signals_handle.lock().await;
            store.signals.clear();
            store.healthy = false;
        }

        let response = get_runtime_signals().await;
        assert!(
            !response.ok,
            "inactive session should reject runtime signal reads"
        );

        let error = response
            .error
            .expect("error payload must be present for inactive session");
        assert_eq!(error.code, "deep_trace_session_inactive");
        assert!(error.message.contains("not active"));
    }

    #[tokio::test]
    async fn debugger_toggle_breakpoint_works_without_active_session() {
        let session_handle = get_dap_session_handle();
        {
            let mut session = session_handle.lock().await;
            *session = None;
        }

        let signals_handle = get_runtime_signals_handle();
        {
            let mut store = signals_handle.lock().await;
            store.breakpoints.clear();
            store.paused = false;
            store.active_relative_path = None;
            store.active_line = None;
            store.active_column = None;
            store.active_thread_id = None;
        }

        let first = debugger_toggle_breakpoint(ToggleBreakpointRequestDto {
            relative_path: "main.go".to_string(),
            line: 12,
        })
        .await;
        assert!(first.ok, "should allow storing breakpoints before debug starts");
        let first_state = first.data.expect("state payload should be returned");
        assert!(!first_state.session_active);
        assert_eq!(first_state.breakpoints.len(), 1);
        assert_eq!(first_state.breakpoints[0].relative_path, "main.go");
        assert_eq!(first_state.breakpoints[0].line, 12);

        let second = debugger_toggle_breakpoint(ToggleBreakpointRequestDto {
            relative_path: "main.go".to_string(),
            line: 12,
        })
        .await;
        assert!(second.ok, "second toggle should remove stored breakpoint");
        let second_state = second.data.expect("state payload should be returned");
        assert!(second_state.breakpoints.is_empty());
    }

    #[tokio::test]
    async fn deactivate_deep_trace_preserves_breakpoints() {
        let session_handle = get_dap_session_handle();
        {
            let mut session = session_handle.lock().await;
            *session = None;
        }

        let signals_handle = get_runtime_signals_handle();
        {
            let mut store = signals_handle.lock().await;
            store.signals.clear();
            store.healthy = true;
            store.breakpoints.clear();
            store.breakpoints.insert("main.go".to_string(), vec![7, 9]);
        }

        let response = deactivate_deep_trace().await;
        assert!(response.ok, "deactivate should succeed without a live session");

        let store = signals_handle.lock().await;
        assert_eq!(store.breakpoints.get("main.go"), Some(&vec![7, 9]));
        assert!(!store.healthy);
    }
}
