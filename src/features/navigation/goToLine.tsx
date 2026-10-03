import { useEffect, useState } from "react";
import QuickPick from "../../components/primitives/QuickPick";
export function parseLineTarget(query: string, text: string): { line: number; column: number } | null {
  const found = /^\s*(\d+)(?::(\d+))?\s*$/.exec(query);
  if (!found) return null;
  const lines = text.split("\n"), line = Number(found[1]), column = Number(found[2] ?? 1);
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1) return null;
  const boundedLine = Math.min(line, lines.length);
  return { line: boundedLine, column: Math.min(column, lines[boundedLine - 1].replace(/\r$/, "").length + 1) };
}
export function useGoToLine(context: string, text: string, currentLine: number, enabled: boolean, navigate: (line: number, column: number) => void) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  useEffect(() => { setOpen(false); }, [context]);
  const target = parseLineTarget(query, text);
  return { open: () => { if (enabled) { setQuery(String(currentLine)); setOpen(true); } },
    dialog: open && <QuickPick title="Go to Line" inputLabel="Line and column" placeholder="Line:column, for example 42:8" query={query} onQuery={setQuery}
      items={target ? [{ id: "go", label: `Go to ${target.line}:${target.column}`, disabled: enabled ? undefined : "Wait for document operations." }] : []}
      empty="Enter a positive line number, optionally followed by :column" onClose={() => setOpen(false)} onChoose={() => {
        const current = parseLineTarget(query, text); if (!current || !enabled) return; setOpen(false); navigate(current.line, current.column);
      }} /> };
}
