import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ApiResponse } from "../../lib/ipc/types";
export async function exportDocumentCopy(path: string, content: string): Promise<string | null> {
  if (!isTauri()) throw new Error("Saving a document copy requires the desktop app.");
  const filename = path.split(/[\\/]/).pop() || "recovered.go";
  const result = await invoke<ApiResponse<string | null>>("export_document_copy", { filename, content });
  if (!result.ok) throw new Error(result.error?.message ?? "Cannot export this draft. The editor buffer is unchanged.");
  return result.data ?? null;
}
