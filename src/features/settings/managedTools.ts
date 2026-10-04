import { invoke } from "@tauri-apps/api/core";
import type { ApiResponse, ToolPaths } from "../../lib/ipc/types";
export type ToolCatalog = { goVersion: string; goplsVersion: string; delveVersion: string; platform: string; url: string; sha256: string; archiveBytes: number };
export type ManagedBundle = { id: string; catalog: ToolCatalog; paths: ToolPaths };
export type ManagedState = { catalog: ToolCatalog | null; catalogError: string | null; installed: ManagedBundle[]; progress: { requestId: string | null; phase: string; downloadedBytes: number; error: string | null } };
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!(globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) throw new Error("Managed setup requires the desktop app. Existing tools can be configured in Settings.");
  const response = await invoke<ApiResponse<T>>(command, args);
  if (!response.ok || response.data === undefined) throw new Error(response.error?.message ?? "Tool setup failed.");
  return response.data;
}
export const managedTools = {
  state: () => call<ManagedState>("managed_toolchain_state"),
  start: () => call<string>("managed_toolchain_start"),
  cancel: (id: string) => call<null>("managed_toolchain_cancel", { id }),
  use: (id: string) => call<ToolPaths>("managed_toolchain_use", { id }),
  remove: (id: string) => call<null>("managed_toolchain_remove", { id }),
};
