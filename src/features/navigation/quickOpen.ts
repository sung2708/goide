import { cancelWorkspaceSearch, indexWorkspaceFiles } from "../../lib/ipc/client";
export { matchFile, rankFiles } from "./fileRanking";
import type { WorkspaceFileIndexReport } from "../../lib/ipc/types";
export type FileIndex = WorkspaceFileIndexReport;
export async function indexWorkspace(root: string, signal: AbortSignal): Promise<FileIndex> {
  if (signal.aborted) throw new Error("File indexing cancelled");
  const requestId = crypto.randomUUID();
  const cancel = () => { void cancelWorkspaceSearch(requestId).catch(() => { /* Stale responses are also rejected locally. */ }); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const response = await indexWorkspaceFiles(root, requestId);
    if (signal.aborted) throw new Error("File indexing cancelled");
    if (!response.ok || !response.data) throw new Error(response.error?.message ?? "File indexing failed.");
    return response.data;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
