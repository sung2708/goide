import { invoke } from "@tauri-apps/api/core";
import type {
  AnalyzeConcurrencyRequest,
  ApiResponse,
  ConcurrencyConstruct,
  FsEntry,
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
