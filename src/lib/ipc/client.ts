import { invoke } from "@tauri-apps/api/core";
import type {
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
} from "./types";

function hasTauriInternals(): boolean {
  return Boolean((globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
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
  content: string
): Promise<ApiResponse<void>> {
  return invoke<ApiResponse<void>>("write_workspace_file", {
    workspaceRoot,
    relativePath,
    content,
  });
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

export async function fetchWorkspaceDiagnostics(
  workspaceRoot: string,
  relativePath: string
): Promise<ApiResponse<DiagnosticsResponse>> {
  return invoke<ApiResponse<DiagnosticsResponse>>("get_active_file_diagnostics", {
    workspaceRoot,
    relativePath,
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
  if (!hasTauriInternals()) {
    return {
      ok: true,
      data: { mode: "deep-trace", scopeKey: "runtime_session" },
    };
  }
  return invoke<ApiResponse<ActivateDeepTraceResponse>>("start_debug_session", {
    request,
  });
}

export async function deactivateDeepTrace(): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("deactivate_deep_trace");
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
      ok: true,
      data: {
        go: { available: false },
        gopls: { available: false },
        delve: { available: false },
      },
    };
  }
  return invoke<ApiResponse<ToolchainStatus>>("get_toolchain_status");
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

export async function debuggerContinue(): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("debugger_continue");
}

export async function debuggerPause(): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("debugger_pause");
}

export async function debuggerStepOver(): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("debugger_step_over");
}

export async function debuggerStepInto(): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("debugger_step_into");
}

export async function debuggerStepOut(): Promise<ApiResponse<void>> {
  if (!hasTauriInternals()) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("debugger_step_out");
}

export async function debuggerToggleBreakpoint(
  request: ToggleBreakpointRequest
): Promise<ApiResponse<DebuggerState>> {
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
  return invoke<ApiResponse<DebuggerState>>("debugger_toggle_breakpoint", {
    request,
  });
}

export async function searchWorkspaceText(
  workspaceRoot: string,
  query: string
): Promise<ApiResponse<WorkspaceSearchFile[]>> {
  return invoke<ApiResponse<WorkspaceSearchFile[]>>("search_workspace_text", {
    workspaceRoot,
    query,
  });
}

export async function getWorkspaceGitSnapshot(
  workspaceRoot: string
): Promise<ApiResponse<WorkspaceGitSnapshot>> {
  if (!hasTauriInternals()) {
    return {
      ok: true,
      data: {
        branch: "unknown",
        changedFiles: [],
        commits: [],
      },
    };
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
  return invoke<ApiResponse<WorkspaceBranchSnapshot>>("get_workspace_branches", {
    workspaceRoot,
  });
}

export async function switchWorkspaceBranch(
  request: SwitchWorkspaceBranchRequest,
): Promise<ApiResponse<WorkspaceBranchSnapshot>> {
  return invoke<ApiResponse<WorkspaceBranchSnapshot>>("switch_workspace_branch", {
    request,
  });
}
