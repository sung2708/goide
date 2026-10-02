import type { EditorDiagnostic, RunOutputPayload } from "../../lib/ipc/types";
export type Problem = { id: string; source: string; severity: "error" | "warning" | "info" | "hint"; message: string; file: string; line: number; column: number; code?: string | null };
export function diagnosticProblems(file: string, diagnostics: EditorDiagnostic[]): Problem[] {
  return diagnostics.map((diagnostic, index) => ({ id: `gopls:${file}:${index}`, file, line: diagnostic.range.startLine, column: diagnostic.range.startColumn, source: diagnostic.source || "gopls", severity: diagnostic.severity, message: diagnostic.message, code: diagnostic.code }));
}
export function buildProblems(root: string | null, output: RunOutputPayload[]): Problem[] {
  if (!root) return [];
  const prefix = root.replace(/\\/g, "/").replace(/\/$/, "");
  const unique = new Map<string, Problem>();
  for (const entry of output) {
    if (entry.stream !== "stderr") continue;
    const match = /^(.+\.go):(\d+):(\d+):\s+(.+)$/.exec(entry.line);
    if (!match) continue;
    let file = match[1].replace(/\\/g, "/").replace(/^\.\//, "");
    if (file.toLowerCase().startsWith(`${prefix.toLowerCase()}/`)) file = file.slice(prefix.length + 1);
    if (file.startsWith("/") || /^[A-Za-z]:/.test(file) || file.split("/").includes("..")) continue;
    const line = Number(match[2]), column = Number(match[3]);
    if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1) continue;
    const id = `build:${file}:${line}:${column}:${match[4]}`;
    unique.set(id, { id, source: "go build", severity: "error", file, line, column, message: match[4] });
  }
  return [...unique.values()].slice(0, 1000);
}
