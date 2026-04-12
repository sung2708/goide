import { invoke } from "@tauri-apps/api/core";
import type {
  ActivateDeepTraceRequest,
  ActivateDeepTraceResponse,
  AnalyzeConcurrencyRequest,
  ApiResponse,
  CompletionItem,
  CompletionRequest,
  ConcurrencyConstruct,
  EditorDiagnostic,
  FsEntry,
  RuntimeAvailabilityResponse,
  RuntimeSignal,
} from "./types";

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

export async function fetchWorkspaceDiagnostics(
  workspaceRoot: string,
  relativePath: string
): Promise<ApiResponse<EditorDiagnostic[]>> {
  return invoke<ApiResponse<EditorDiagnostic[]>>("get_active_file_diagnostics", {
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

export async function deactivateDeepTrace(): Promise<ApiResponse<void>> {
  const tauriInternals = (globalThis as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
  if (!tauriInternals) {
    return { ok: true };
  }
  return invoke<ApiResponse<void>>("deactivate_deep_trace");
}

export async function getRuntimeAvailability(): Promise<
  ApiResponse<RuntimeAvailabilityResponse>
> {
  return invoke<ApiResponse<RuntimeAvailabilityResponse>>(
    "get_runtime_availability"
  );
}

export async function getRuntimeSignals(): Promise<ApiResponse<RuntimeSignal[]>> {
  return invoke<ApiResponse<RuntimeSignal[]>>("get_runtime_signals");
}
