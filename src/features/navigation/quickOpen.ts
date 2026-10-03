import { listWorkspaceEntries } from "../../lib/ipc/client";

const IGNORED = new Set([".git", "node_modules", "dist", "target", ".turbo", ".cache", "vendor"]);
export type FileIndex = { files: string[]; notice: string | null };
export async function indexWorkspace(root: string, cancelled: () => boolean): Promise<FileIndex> {
  const files: string[] = [];
  let pathCharacters = 0;
  const seen = new Set<string>();
  const queue: { path?: string; depth: number }[] = [{ depth: 0 }];
  const started = performance.now();
  let notice: string | null = null;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    if (cancelled()) throw new Error("File indexing cancelled.");
    if (cursor >= 2000 || files.length >= 20000 || pathCharacters >= 4 * 1024 * 1024 || performance.now() - started > 5000) {
      notice = "File index reached its limit. Use Explorer for files outside these results."; break;
    }
    const current = queue[cursor];
    const response = await listWorkspaceEntries(root, current.path);
    if (cancelled()) throw new Error("File indexing cancelled.");
    if (!response.ok || !response.data) {
      if (cursor === 0) throw new Error(response.error?.message ?? "Cannot index workspace files.");
      notice = `Some folders could not be indexed: ${response.error?.message ?? current.path}`;
      continue;
    }
    for (const entry of response.data) {
      if (seen.has(entry.path)) continue;
      seen.add(entry.path);
      if (entry.isDir) {
        if (!IGNORED.has(entry.name) && current.depth < 64 && queue.length < 2000) queue.push({ path: entry.path, depth: current.depth + 1 });
        else if (!IGNORED.has(entry.name) && queue.length >= 2000) notice = "Folder index limit reached; use Explorer for remaining folders.";
        else if (!IGNORED.has(entry.name)) notice = "Folder depth limit reached; use Explorer for deeper files.";
      } else {
        pathCharacters += entry.path.length;
        if (pathCharacters > 4 * 1024 * 1024) { notice = "File index reached its 4 MiB path budget; use Explorer for remaining files."; break; }
        files.push(entry.path);
        if (files.length >= 20000) { notice = "File index limit reached; use Explorer for remaining files."; break; }
      }
    }
  }
  return { files: files.sort((a, b) => a.localeCompare(b)), notice };
}

export { matchFile, rankFiles } from "./fileRanking";
