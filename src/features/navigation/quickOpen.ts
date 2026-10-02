import { listWorkspaceEntries } from "../../lib/ipc/client";

const IGNORED = new Set([".git", "node_modules", "dist", "target", ".turbo", ".cache", "vendor"]);
export type FileIndex = { files: string[]; notice: string | null };
export async function indexWorkspace(root: string, cancelled: () => boolean): Promise<FileIndex> {
  const files: string[] = [];
  const seen = new Set<string>();
  const queue: { path?: string; depth: number }[] = [{ depth: 0 }];
  const started = performance.now();
  let notice: string | null = null;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    if (cancelled()) throw new Error("File indexing cancelled.");
    if (cursor >= 2000 || files.length >= 20000 || performance.now() - started > 5000) {
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
        files.push(entry.path);
        if (files.length >= 20000) { notice = "File index limit reached; use Explorer for remaining files."; break; }
      }
    }
  }
  return { files: files.sort((a, b) => a.localeCompare(b)), notice };
}

function score(path: string, query: string): number {
  const text = path.replace(/\\/g, "/").toLowerCase();
  const name = text.split("/").pop() ?? text;
  if (name === query) return -10000 + text.length / 100;
  if (name.startsWith(query)) return -5000 + name.length;
  let offset = 0, points = 0;
  for (const char of query.replace(/\s+/g, "")) {
    const index = text.indexOf(char, offset);
    if (index < 0) return Infinity;
    points += index - offset;
    if (index === 0 || /[/_.-]/.test(text[index - 1])) points -= 8;
    offset = index + 1;
  }
  return points + text.length / 100;
}
export function rankFiles(files: string[], query: string, recent: string[]): string[] {
  const normalized = query.trim().toLowerCase();
  const order = new Map(recent.map((path, index) => [path, index]));
  return files.map(path => ({ path, score: normalized ? score(path, normalized) : 0 }))
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score || (order.get(a.path) ?? 999) - (order.get(b.path) ?? 999) || a.path.localeCompare(b.path))
    .slice(0, 200).map(item => item.path);
}
