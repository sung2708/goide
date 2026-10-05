import { invoke } from "@tauri-apps/api/core";
import type {
  LanguageQuery, LanguageQueryResult, LanguageCancelRequest, SignatureHelp, LanguageCodeAction, LanguageCodeActionPreview, LanguageCodeActionQuery,
  LanguageFormatRequest, LanguageEditPlan,
  LanguageRenameRequest,
  WorkspaceFileInfo,
  WorkspaceFileIndexReport,
  WorkspaceReplacementRequest,
  WorkspaceReplacementPlan,
  WorkspaceSearchOptions,
  WorkspaceSearchReport,
  ActivateDeepTraceRequest,
  ActivateDeepTraceResponse,
  AnalyzeConcurrencyRequest,
  StartDebugSessionRequest,
  ApiResponse,
  CompletionItem,
  CompletionRequest,
  ConcurrencyConstruct,
  DiagnosticsResponse,
  DebuggerState,
  FsEntry,
  StartWorkspaceFsWatchResponse,
  RuntimeAvailabilityResponse,
  RuntimePanelSnapshot,
  RuntimeTopologySnapshot,
  RuntimeSignal,
  ToolchainStatus,
  ToggleBreakpointRequest,
  WorkspaceBranchSnapshot,
  WorkspaceGitSnapshot,
  WorkspaceSearchFile,
  SwitchWorkspaceBranchRequest,
  EnsureShellSessionRequest,
  EnsureShellSessionResponse,
  ShellInputRequest,
  ShellResizeRequest,
  DisposeShellSessionRequest,
  WorkspaceGitCommitDetail,
  WorkspaceGitCommitRequest,
  WorkspaceGitFileActionRequest,
  WorkspaceGitGraphEntry,
  WorkspaceGitGraphCommit,
} from "./types";

function hasTauriInternals(): boolean {
  return Boolean((globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}
function gitNativeRequired<T>(): ApiResponse<T> {
  return { ok: false, error: { code: "git_native_required", message: "Git operations require the desktop app and a real repository." } };
}

export async function inspectGoProject(request: import("./types").GoProjectRequest): Promise<ApiResponse<import("./types").GoProjectInfo>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "go_project_native_required", message: "Go project inspection requires the desktop app and Go." } };
  return invoke("inspect_go_project", { request });
}
export async function createGoProject(request: import("./types").CreateGoProjectRequest): Promise<ApiResponse<string>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "go_project_native_required", message: "Creating a project requires the desktop app and an installed Go toolchain." } };
  return invoke("create_go_project", { request });
}
export async function subscribeGoTestOutput(request: import("./types").GoTestRequest, receive: (event: import("./types").GoTestEvent) => void): Promise<() => void> {
  if (!hasTauriInternals()) throw new Error("Live test output requires the desktop app.");
  const { listen } = await import("@tauri-apps/api/event");
  return listen<import("./types").GoTestEvent>("go-test-output", event => {
    if (event.payload.workspaceRoot === request.workspaceRoot && event.payload.requestId === request.requestId) receive(event.payload);
  });
}
export async function runGoTests(request: import("./types").GoTestRequest): Promise<ApiResponse<import("./types").GoTestOutput>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "go_test_native_required", message: "Test execution requires the desktop app and Go." } };
  return invoke("run_go_tests", { request });
}
export async function confirmGoTestCleanup(request: LanguageCancelRequest): Promise<ApiResponse<boolean>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "go_test_native_required", message: "Test cleanup requires the desktop app." } };
  return invoke("confirm_go_test_cleanup", { request });
}
export async function runGoModuleAction(request: import("./types").GoModuleRequest): Promise<ApiResponse<import("./types").GoModuleOutput>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "go_module_native_required", message: "Go module commands require the desktop app." } };
  return invoke("run_go_module_action", { request });
}
export async function confirmGoModuleCleanup(request: LanguageCancelRequest): Promise<ApiResponse<boolean>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "go_module_native_required", message: "Module cleanup confirmation requires the desktop app." } };
  return invoke("confirm_go_module_cleanup", { request });
}

export async function queryWorkspaceLanguage(request: LanguageQuery): Promise<ApiResponse<LanguageQueryResult>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "language_unavailable", message: "Language queries require the desktop app and gopls." } };
  return invoke<ApiResponse<LanguageQueryResult>>("query_workspace_language", { request });
}

export async function queryWorkspaceSignature(request: LanguageQuery): Promise<ApiResponse<SignatureHelp | null>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "signature_unavailable", message: "Signature help requires the desktop gopls integration." } };
  return invoke<ApiResponse<SignatureHelp | null>>("query_workspace_signature", { request });
}
export async function cancelLanguageRequest(request: LanguageCancelRequest): Promise<ApiResponse<boolean>> {
  if (!hasTauriInternals()) return { ok: true, data: false };
  return invoke<ApiResponse<boolean>>("cancel_language_request", { request });
}

export async function formatWorkspaceDocument(request: LanguageFormatRequest): Promise<ApiResponse<LanguageEditPlan>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "language_unavailable", message: "Formatting requires the desktop app and gopls." } };
  return invoke<ApiResponse<LanguageEditPlan>>("format_workspace_document", { request });
}

export async function organizeWorkspaceImports(request: LanguageFormatRequest): Promise<ApiResponse<LanguageEditPlan>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "language_unavailable", message: "Organize Imports requires the desktop app and gopls." } };
  return invoke<ApiResponse<LanguageEditPlan>>("organize_workspace_imports", { request });
}

export async function previewWorkspaceRename(request: LanguageRenameRequest): Promise<ApiResponse<LanguageEditPlan>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "language_unavailable", message: "Symbol rename requires the desktop app and gopls." } };
  return invoke<ApiResponse<LanguageEditPlan>>("preview_workspace_rename", { request });
}

export async function listWorkspaceEntries(
  workspaceRoot: string,
  relativePath?: string
): Promise<ApiResponse<FsEntry[]>> {
  return invoke<ApiResponse<FsEntry[]>>("list_workspace_entries", {
    workspaceRoot,
    relativePath: relativePath ?? null,
  });
}

export async function readWorkspaceFile(
  workspaceRoot: string,
  relativePath: string
): Promise<ApiResponse<string>> {
  return invoke<ApiResponse<string>>("read_workspace_file", {
    workspaceRoot,
    relativePath,
  });
}

export async function writeWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
  content: string,
  expectedContent?: string
): Promise<ApiResponse<void>> {
  return invoke<ApiResponse<void>>("write_workspace_file", {
    workspaceRoot,
    relativePath,
    content,
    expectedContent: expectedContent ?? null,
  });
}

export async function getWorkspaceFileState(workspaceRoot: string, relativePath: string): Promise<ApiResponse<{ exists: boolean; content: string | null }>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "fs_state_unavailable", message: "File state checks require the desktop app." } };
  return invoke("get_workspace_file_state", { workspaceRoot, relativePath });
}
export async function getWorkspaceFileInfo(workspaceRoot: string, relativePath: string): Promise<ApiResponse<WorkspaceFileInfo>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "fs_info_unavailable", message: "File metadata requires the desktop app." } };
  return invoke("get_workspace_file_info", { workspaceRoot, relativePath });
}

export async function startWorkspaceFsWatch(
  workspaceRoot: string
): Promise<ApiResponse<StartWorkspaceFsWatchResponse>> {
  if (!hasTauriInternals()) {
    return {
      ok: false,
      error: { code: "fs_watch_unavailable", message: "Automatic filesystem sync requires the desktop app. Use Explorer refresh in the browser preview." },
    };
  }
  return invoke<ApiResponse<StartWorkspaceFsWatchResponse>>("start_workspace_fs_watch", {
    workspaceRoot,
  });
}

export async function stopWorkspaceFsWatch(watchId: string): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("stop_workspace_fs_watch", { watchId });
}

export async function analyzeActiveFileConcurrency(
  request: AnalyzeConcurrencyRequest
): Promise<ApiResponse<ConcurrencyConstruct[]>> {
  return invoke<ApiResponse<ConcurrencyConstruct[]>>(
    "analyze_active_file_concurrency",
    {
      request,
    }
  );
}

export async function runWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
  runId: string
): Promise<ApiResponse<void>> {
  return invoke<ApiResponse<void>>("run_workspace_file", {
    workspaceRoot,
    relativePath,
    runId,
  });
}

export async function runWorkspaceFileWithRace(
  workspaceRoot: string,
  relativePath: string,
  runId: string
): Promise<ApiResponse<void>> {
  return invoke<ApiResponse<void>>("run_workspace_file_with_race", {
    workspaceRoot,
    relativePath,
    runId,
  });
}

export async function stopCurrentRun(context: import("./types").RunContext): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "run_native_required", message: "Run cleanup requires the desktop app." } };
  return invoke<ApiResponse<void>>("stop_current_run", { context });
}

export async function fetchWorkspaceDiagnostics(
  workspaceRoot: string,
  relativePath: string,
  live?: { buffers: { path: string; content: string }[]; requestId: string }
): Promise<ApiResponse<DiagnosticsResponse>> {
  return invoke<ApiResponse<DiagnosticsResponse>>("get_active_file_diagnostics", {
    workspaceRoot,
    relativePath,
    ...live,
  });
}

export async function fetchWorkspaceCompletions(
  request: CompletionRequest
): Promise<ApiResponse<CompletionItem[]>> {
  return invoke<ApiResponse<CompletionItem[]>>("get_active_file_completions", {
    request,
  });
}

export async function activateScopedDeepTrace(
  request: ActivateDeepTraceRequest
): Promise<ApiResponse<ActivateDeepTraceResponse>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "debugger_native_required", message: "Debug startup requires the desktop app and actual Go/Delve." } };
  return invoke<ApiResponse<ActivateDeepTraceResponse>>(
    "activate_scoped_deep_trace",
    {
      request,
    }
  );
}

export async function startDebugSession(
  request: StartDebugSessionRequest
): Promise<ApiResponse<ActivateDeepTraceResponse>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "debugger_native_required", message: "Debug startup requires the desktop app and actual Go/Delve." } };
  return invoke<ApiResponse<ActivateDeepTraceResponse>>("start_debug_session", {
    request,
  });
}

export async function cancelDebuggerStartup(request: LanguageCancelRequest): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "debugger_native_required", message: "Debug startup cleanup requires the desktop app." } };
  return invoke("cancel_debugger_startup", { request });
}

export async function deactivateDeepTrace(request: import("./types").DebuggerStopContext = { sessionId: null }): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: false, error: { code: "debugger_native_required", message: "Debugger teardown requires the desktop app." } };
  }
  return invoke<ApiResponse<void>>("deactivate_deep_trace", { request });
}

export async function createWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
  content = ""
): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("create_workspace_file", {
    workspaceRoot,
    relativePath,
    content: content ?? "",
  });
}

export async function createWorkspaceFolder(
  workspaceRoot: string,
  relativePath: string
): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("create_workspace_folder", {
    workspaceRoot,
    relativePath,
  });
}

export async function deleteWorkspaceEntry(
  workspaceRoot: string,
  relativePath: string
): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("delete_workspace_entry", {
    workspaceRoot,
    relativePath,
  });
}

export async function renameWorkspaceEntry(
  workspaceRoot: string,
  relativePath: string,
  newName: string
): Promise<ApiResponse<string>> {
  if (!hasTauriInternals()) {
    return { ok: true, data: relativePath };
  }
  return invoke<ApiResponse<string>>("rename_workspace_entry", {
    workspaceRoot,
    relativePath,
    newName,
  });
}

export async function moveWorkspaceEntry(
  workspaceRoot: string,
  relativePath: string,
  destinationRelativePath: string
): Promise<ApiResponse<string>> {
  if (!hasTauriInternals()) {
    return { ok: true, data: destinationRelativePath };
  }
  return invoke<ApiResponse<string>>("move_workspace_entry", {
    workspaceRoot,
    relativePath,
    destinationRelativePath,
  });
}

export async function getRuntimeAvailability(): Promise<
  ApiResponse<RuntimeAvailabilityResponse>
> {
  return invoke<ApiResponse<RuntimeAvailabilityResponse>>(
    "get_runtime_availability"
  );
}

export async function getToolchainStatus(): Promise<ApiResponse<ToolchainStatus>> {
  if (!hasTauriInternals()) {
    return {
      ok: false,
      error: { code: "toolchain_native_required", message: "Toolchain detection requires the desktop app. Native tools cannot be inspected in browser preview." },
    };
  }
  return invoke<ApiResponse<ToolchainStatus>>("get_toolchain_status");
}
export async function configureToolchainPaths(paths: import("./types").ToolPaths): Promise<ApiResponse<import("./types").ToolPaths>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "toolchain_native_required", message: "Executable configuration requires the desktop app." } };
  return invoke<ApiResponse<import("./types").ToolPaths>>("configure_toolchain_paths", { paths });
}

export async function getRuntimeSignals(): Promise<ApiResponse<RuntimeSignal[]>> {
  return invoke<ApiResponse<RuntimeSignal[]>>("get_runtime_signals");
}

export async function getRuntimePanelSnapshot(): Promise<
  ApiResponse<RuntimePanelSnapshot>
> {
  return invoke<ApiResponse<RuntimePanelSnapshot>>("get_runtime_panel_snapshot");
}

export async function getRuntimeTopologySnapshot(): Promise<
  ApiResponse<RuntimeTopologySnapshot>
> {
  return invoke<ApiResponse<RuntimeTopologySnapshot>>(
    "get_runtime_topology_snapshot"
  );
}

export async function queryDebuggerInspection(request: import("./types").DebuggerInspectionRequest): Promise<ApiResponse<import("./types").DebuggerInspectionOutput>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "debugger_native_required", message: "Debugger inspection requires the desktop app and an observed Delve stop." } };
  return invoke("query_debugger_inspection", { request });
}

export async function getDebuggerState(): Promise<ApiResponse<DebuggerState>> {
  if (!hasTauriInternals()) {
    return {
      ok: true,
      data: {
        sessionActive: false,
        paused: false,
        activeRelativePath: null,
        activeLine: null,
        activeColumn: null,
        breakpoints: [],
      },
    };
  }
  return invoke<ApiResponse<DebuggerState>>("get_debugger_state");
}

export async function debuggerContinue(request: import("./types").DebuggerControlContext): Promise<ApiResponse<import("./types").DebuggerControlObservation>> {
  if (!hasTauriInternals()) {
    return { ok: false, error: { code: "debugger_native_required", message: "Debugger control requires the desktop app and an observed session." } };
  }
  return invoke<ApiResponse<import("./types").DebuggerControlObservation>>("debugger_continue", { request });
}

export async function debuggerPause(request: import("./types").DebuggerControlContext): Promise<ApiResponse<import("./types").DebuggerControlObservation>> {
  if (!hasTauriInternals()) {
    return { ok: false, error: { code: "debugger_native_required", message: "Debugger control requires the desktop app and an observed session." } };
  }
  return invoke<ApiResponse<import("./types").DebuggerControlObservation>>("debugger_pause", { request });
}

export async function debuggerStepOver(request: import("./types").DebuggerControlContext): Promise<ApiResponse<import("./types").DebuggerControlObservation>> {
  if (!hasTauriInternals()) {
    return { ok: false, error: { code: "debugger_native_required", message: "Debugger control requires the desktop app and an observed session." } };
  }
  return invoke<ApiResponse<import("./types").DebuggerControlObservation>>("debugger_step_over", { request });
}

export async function debuggerStepInto(request: import("./types").DebuggerControlContext): Promise<ApiResponse<import("./types").DebuggerControlObservation>> {
  if (!hasTauriInternals()) {
    return { ok: false, error: { code: "debugger_native_required", message: "Debugger control requires the desktop app and an observed session." } };
  }
  return invoke<ApiResponse<import("./types").DebuggerControlObservation>>("debugger_step_into", { request });
}

export async function debuggerStepOut(request: import("./types").DebuggerControlContext): Promise<ApiResponse<import("./types").DebuggerControlObservation>> {
  if (!hasTauriInternals()) {
    return { ok: false, error: { code: "debugger_native_required", message: "Debugger control requires the desktop app and an observed session." } };
  }
  return invoke<ApiResponse<import("./types").DebuggerControlObservation>>("debugger_step_out", { request });
}

export async function debuggerToggleBreakpoint(
  request: ToggleBreakpointRequest
): Promise<ApiResponse<DebuggerState>> {
  if (!hasTauriInternals()) {
    return { ok: false, error: { code: "debugger_native_required", message: "Breakpoint registration requires the desktop app." } };
  }
  return invoke<ApiResponse<DebuggerState>>("debugger_toggle_breakpoint", {
    request,
  });
}

export async function searchWorkspaceText(
  workspaceRoot: string,
  query: string,
  options: WorkspaceSearchOptions = { matchCase: false, wholeWord: false, useRegex: false, include: [], exclude: [] },
  requestId: string = crypto.randomUUID(),
): Promise<ApiResponse<WorkspaceSearchFile[]> & { limited?: boolean; reason?: string | null }> {
  if (!hasTauriInternals()) {
    return {
      ok: false,
      error: { code: "search_native_required", message: "Workspace search requires the desktop app." },
    };
  }
  const response = await invoke<ApiResponse<WorkspaceSearchReport>>("search_workspace_text_v2", {
    workspaceRoot,
    query,
    options,
    requestId,
  });
  return { ok: response.ok, error: response.error, data: response.data?.files, limited: response.data?.limited, reason: response.data?.reason };
}
export async function cancelWorkspaceSearch(requestId: string): Promise<ApiResponse<boolean>> {
  if (!hasTauriInternals()) return { ok: true, data: false };
  return invoke<ApiResponse<boolean>>("cancel_workspace_search", { requestId });
}
export async function previewWorkspaceReplacement(request: WorkspaceReplacementRequest): Promise<ApiResponse<WorkspaceReplacementPlan[]>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "replacement_native_required", message: "Replacement requires the desktop app." } };
  return invoke<ApiResponse<WorkspaceReplacementPlan[]>>("preview_workspace_replacement", { request });
}

export async function getWorkspaceGitSnapshot(
  workspaceRoot: string
): Promise<ApiResponse<WorkspaceGitSnapshot>> {
  if (!hasTauriInternals()) {
    return gitNativeRequired();
  }
  return invoke<ApiResponse<WorkspaceGitSnapshot>>(
    "get_workspace_git_snapshot",
    {
      workspaceRoot,
    }
  );
}

export async function getWorkspaceBranches(
  workspaceRoot: string,
): Promise<ApiResponse<WorkspaceBranchSnapshot>> {
  if (!hasTauriInternals()) return gitNativeRequired();
  return invoke<ApiResponse<WorkspaceBranchSnapshot>>("get_workspace_branches", {
    workspaceRoot,
  });
}

export async function switchWorkspaceBranch(
  request: SwitchWorkspaceBranchRequest,
): Promise<ApiResponse<WorkspaceBranchSnapshot>> {
  if (!hasTauriInternals()) return gitNativeRequired();
  return invoke<ApiResponse<WorkspaceBranchSnapshot>>("switch_workspace_branch", {
    request,
  });
}

export async function stageWorkspaceGitFile(
  request: WorkspaceGitFileActionRequest,
): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return gitNativeRequired();
  }
  return invoke<ApiResponse<void>>("stage_workspace_git_file", { request });
}

export async function unstageWorkspaceGitFile(
  request: WorkspaceGitFileActionRequest,
): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return gitNativeRequired();
  }
  return invoke<ApiResponse<void>>("unstage_workspace_git_file", { request });
}

export async function commitWorkspaceGitChanges(
  request: WorkspaceGitCommitRequest,
): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return gitNativeRequired();
  }
  return invoke<ApiResponse<void>>("commit_workspace_git_changes", { request });
}

export async function getWorkspaceCommitDetail(
  workspaceRoot: string,
  hash: string,
): Promise<ApiResponse<WorkspaceGitCommitDetail>> {
  if (!hasTauriInternals()) {
    return gitNativeRequired();
  }
  return invoke<ApiResponse<WorkspaceGitCommitDetail>>("get_workspace_commit_detail", {
    workspaceRoot,
    hash,
  });
}

export async function getWorkspaceGitGraph(
  workspaceRoot: string,
): Promise<ApiResponse<WorkspaceGitGraphEntry[]>> {
  if (!hasTauriInternals()) {
    return gitNativeRequired();
  }
  return invoke<ApiResponse<WorkspaceGitGraphEntry[]>>("get_workspace_git_graph", {
    workspaceRoot,
  });
}

export async function getWorkspaceGitGraphCommits(
  workspaceRoot: string,
): Promise<ApiResponse<WorkspaceGitGraphCommit[]>> {
  if (!hasTauriInternals()) {
    return gitNativeRequired();
  }
  return invoke<ApiResponse<WorkspaceGitGraphCommit[]>>("get_workspace_git_graph_commits", {
    workspaceRoot,
  });
}

// ---- Shell session client wrappers ----

/**
 * Ensure a shell session exists for the given workspace surface.
 * Creates a new PTY session or returns the existing one.
 *
 * This wrapper is intentionally a no-op guard: in non-Tauri environments
 * (tests, browser), it returns a stable mock response so the frontend can
 * be wired and tested without the backend.
 */
export async function ensureShellSession(
  request: EnsureShellSessionRequest
): Promise<ApiResponse<EnsureShellSessionResponse>> {
  if (!hasTauriInternals()) {
    return {
      ok: true,
      data: {
        shellSessionId: `shell:${request.surfaceKey}`,
        reused: false,
        shellHealth: "launch",
        selectedShell: null,
        replay: "",
      },
    };
  }
  return invoke<ApiResponse<EnsureShellSessionResponse>>("ensure_shell_session", {
    request,
  });
}

/**
 * Write raw PTY input to an active shell session.
 */
export async function writeShellInput(
  request: ShellInputRequest
): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("write_shell_input", { request });
}

/**
 * Notify the backend of a terminal resize for an active shell session.
 */
export async function resizeShellSession(
  request: ShellResizeRequest
): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("resize_shell_session", { request });
}

/**
 * Dispose (terminate) an active shell session.
 */
export async function disposeShellSession(
  request: DisposeShellSessionRequest
): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("dispose_shell_session", { request });
}

export async function listWorkspaceCodeActions(request: LanguageCodeActionQuery): Promise<ApiResponse<LanguageCodeAction[]>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "language_unavailable", message: "Code Actions require the desktop app and gopls." } };
  return invoke<ApiResponse<LanguageCodeAction[]>>("list_workspace_code_actions", { request });
}
export async function previewWorkspaceCodeAction(request: LanguageCodeActionPreview): Promise<ApiResponse<LanguageEditPlan>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "language_unavailable", message: "Code Actions require the desktop app and gopls." } };
  return invoke<ApiResponse<LanguageEditPlan>>("preview_workspace_code_action", { request });
}

export async function indexWorkspaceFiles(workspaceRoot: string, requestId: string): Promise<ApiResponse<WorkspaceFileIndexReport>> {
  if (!hasTauriInternals()) return { ok: false, error: { code: "index_native_required", message: "File indexing requires the desktop app." } };
  return invoke("index_workspace_files", { workspaceRoot, requestId });
}
