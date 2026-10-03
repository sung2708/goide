import { fuzzyMatch, prepareFuzzyText, matchPreparedText } from "./fuzzy";
export function matchFile(path: string, query: string) {
  const text = path.replace(/\\/g, "/");
  const start = text.lastIndexOf("/") + 1;
  const name = fuzzyMatch(text.slice(start), query);
  if (name) return { score: name.score - 2000 + text.length / 100, positions: name.positions.map(offset => offset + start) };
  return fuzzyMatch(text, query);
}
function score(path: string, query: string): number { return matchFile(path, query)?.score ?? Infinity; }
export function rankFiles(files: string[], query: string, recent: string[]): string[] {
  const normalized = query.trim().toLowerCase();
  const order = new Map(recent.map((path, index) => [path, index]));
  return files.map(path => ({ path, score: normalized ? score(path, normalized) : 0 }))
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score || (order.get(a.path) ?? 999) - (order.get(b.path) ?? 999) || a.path.localeCompare(b.path))
    .slice(0, 200).map(item => item.path);
}

export function prepareFileIndex(files: string[]) {
  return files.map(path => { const normalized = path.replace(/\\/g, "/"); return { path, text: prepareFuzzyText(normalized), name: prepareFuzzyText(normalized.slice(normalized.lastIndexOf("/") + 1)) }; });
}
export function rankPreparedFiles(files: ReturnType<typeof prepareFileIndex>, query: string, recent: string[]): string[] {
  const normalized = query.trim().toLowerCase(), order = new Map(recent.map((path, index) => [path, index]));
  return files.flatMap(file => {
    const name = normalized ? matchPreparedText(file.name, normalized, false) : { score: 0 };
    const path = name ? null : matchPreparedText(file.text, normalized, false);
    if (!name && !path) return [];
    const score = normalized ? name ? name.score - 2000 + file.path.length / 100 : path!.score : 0;
    return [{ path: file.path, score }];
  }).sort((a, b) => a.score - b.score || (order.get(a.path) ?? 999) - (order.get(b.path) ?? 999) || a.path.localeCompare(b.path)).slice(0, 200).map(item => item.path);
}
