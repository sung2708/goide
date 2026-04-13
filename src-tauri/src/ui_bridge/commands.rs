use crate::core::analysis::causal::{
    enrich_runtime_signals_with_correlation, StaticCounterpartHint,
};
use crate::integration::delve::{self, DapClient, LaunchMode, RuntimeSignal, RuntimeSignalScope};
use crate::integration::fs;
use crate::integration::gopls;
use crate::integration::process::{emit_run_failure, run_go_file, ProcessHandle};
use crate::ui_bridge::types::{
    ActivateDeepTraceRequestDto, ActivateDeepTraceResponseDto, AnalyzeConcurrencyRequest,
    ApiResponse, ChannelOperationDto, CompletionItemDto, CompletionRangeDto, CompletionRequestDto,
    ConcurrencyConfidenceDto, ConcurrencyConstructDto, ConcurrencyConstructKindDto,
    DeepTraceConstructKindDto, DiagnosticRangeDto, DiagnosticSeverityDto, EditorDiagnosticDto,
    FsEntryDto, RuntimeAvailabilityResponseDto, RuntimeSignalDto,
};
use std::path::{Component, Path};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{oneshot, Mutex};

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
static RUNTIME_SIGNALS: std::sync::OnceLock<Arc<Mutex<Vec<RuntimeSignal>>>> =
    std::sync::OnceLock::new();

struct DapSessionHandle {
    child: tokio::process::Child,
    stop_tx: oneshot::Sender<()>,
    sampler_task: tokio::task::JoinHandle<()>,
}

fn get_dap_session_handle() -> Arc<Mutex<Option<DapSessionHandle>>> {
    DAP_SESSION_HANDLE
        .get_or_init(|| Arc::new(Mutex::new(None)))
        .clone()
}

fn get_runtime_signals_handle() -> Arc<Mutex<Vec<RuntimeSignal>>> {
    RUNTIME_SIGNALS
        .get_or_init(|| Arc::new(Mutex::new(Vec::new())))
        .clone()
}

async fn stop_dap_session(session: DapSessionHandle) {
    let DapSessionHandle {
        mut child,
        stop_tx,
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
        relative_path: signal.relative_path,
        line: signal.line,
        column: signal.column,
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
) -> ApiResponse<Vec<EditorDiagnosticDto>> {
    if let Err(message) = validate_go_diagnostics_path(&relative_path) {
        return ApiResponse::err("diagnostics_invalid_input", &message);
    }

    let result = tauri::async_runtime::spawn_blocking(move || {
        gopls::analyze_file_diagnostics(&workspace_root, &relative_path)
    })
    .await;

    match result {
        Ok(Ok(diagnostics)) => {
            let mapped = diagnostics
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
            ApiResponse::ok(mapped)
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
                    kind: item.kind,
                    insert_text: item.insert_text,
                    range: item.range.map(|range| CompletionRangeDto {
                        start_line: range.start_line,
                        start_column: range.start_column,
                        end_line: range.end_line,
                        end_column: range.end_column,
                    }),
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
    {
        let mut signals = signals_handle.lock().await;
        signals.clear();
    }

    let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
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
    let sampler_task = tokio::spawn(async move {
        let mut client = client;
        loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    let _ = client.disconnect().await;
                    break;
                }
                _ = tokio::time::sleep(Duration::from_millis(500)) => {
                    match client.threads().await {
                        Ok(threads) => {
                            let mut mapped = Vec::new();
                            for thread in threads {
                                // Performance: only fetch stack trace for relevant concurrency threads
                                if delve::parse_thread_wait_state(&thread.name).is_some() {
                                    let frame = client.stack_trace(thread.id).await.unwrap_or(None);
                                    if let Some(signal) = delve::thread_to_runtime_signal(
                                        &thread,
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
                            *store = correlated;
                        }
                        Err(_) => {
                            let _ = client.disconnect().await;
                            {
                                let mut store = signals_handle.lock().await;
                                store.clear();
                            }
                            let mut session_guard = session_handle_for_sampler.lock().await;
                            let should_clear_current = session_guard
                                .as_ref()
                                .and_then(|session| session.child.id())
                                == session_pid;
                            if should_clear_current {
                                *session_guard = None;
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
    let result =
        tauri::async_runtime::spawn_blocking(move || Command::new("dlv").arg("version").output())
            .await;

    let runtime_availability = match result {
        Ok(Ok(output)) if output.status.success() => "available",
        _ => "unavailable",
    };

    ApiResponse::ok(RuntimeAvailabilityResponseDto {
        runtime_availability: runtime_availability.to_string(),
    })
}

#[tauri::command]
pub async fn get_runtime_signals() -> ApiResponse<Vec<RuntimeSignalDto>> {
    let signals = get_runtime_signals_handle().lock().await.clone();
    ApiResponse::ok(signals.into_iter().map(map_runtime_signal).collect())
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
    let mut signals = signals_handle.lock().await;
    signals.clear();
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
        validate_completion_cursor, validate_go_analysis_path, validate_go_completion_path,
        validate_go_diagnostics_path, validate_workspace_scoped_go_path,
    };
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
}
