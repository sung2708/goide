import type { Command } from "./registry";
import { fuzzyMatch } from "../navigation/fuzzy";
const historyKey = "goide.recentCommands:v1";
export function recentCommands(): string[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(historyKey) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length <= 128))].slice(0, 30) : [];
  } catch { return []; }
}
export function rememberCommand(id: string): void {
  try { sessionStorage.setItem(historyKey, JSON.stringify([id, ...recentCommands().filter(item => item !== id)].slice(0, 30))); }
  catch { /* Optional local history must never prevent execution. */ }
}
export function rankCommands(commands: Command[], query: string, recent: string[]) {
  const order = new Map(recent.map((id, index) => [id, index]));
  return commands.flatMap(command => {
    const title = fuzzyMatch(command.title, query);
    const secondary = title ? null : fuzzyMatch(`${command.category ?? ""} ${command.id}`, query);
    if (!title && !secondary) return [];
    return [{ command, positions: title?.positions ?? [], score: title?.score ?? 20000 + secondary!.score }];
  }).sort((a, b) => a.score - b.score || (order.get(a.command.id) ?? 999) - (order.get(b.command.id) ?? 999)
    || a.command.title.localeCompare(b.command.title)).slice(0, 200);
}
