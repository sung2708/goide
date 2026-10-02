import { useMemo, useState } from "react";
import type { Problem } from "./model";
type Props = { problems: Problem[]; onNavigate: (problem: Problem) => void };
export default function ProblemsPanel({ problems, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const filtered = useMemo(() => problems.filter(problem => (severity === "all" || severity === problem.severity) && `${problem.file} ${problem.message} ${problem.source} ${problem.code ?? ""}`.toLowerCase().includes(query.toLowerCase())), [problems, severity, query]);
  const choose = (problem: Problem) => { setSelected(problem.id); onNavigate(problem); };
  return <section aria-label="Problems" className="flex h-full min-h-0 flex-col text-xs text-(--text)"><div className="flex flex-wrap items-center gap-3 border-b border-(--border-muted) p-2"><span role="status">{problems.filter(problem => problem.severity === "error").length} errors · {problems.filter(problem => problem.severity === "warning").length} warnings · {filtered.length} shown</span><input aria-label="Filter problems" value={query} onChange={event => setQuery(event.target.value)} className="rounded bg-(--base) p-1" /><select aria-label="Problem severity" value={severity} onChange={event => setSeverity(event.target.value)} className="rounded bg-(--base) p-1">{["all", "error", "warning", "info", "hint"].map(value => <option key={value} value={value}>{value}</option>)}</select></div><div role="list" aria-label="Problem results" className="min-h-0 flex-1 overflow-auto" onKeyDown={event => {
    if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key) || filtered.length === 0) return;
    event.preventDefault(); const index = filtered.findIndex(problem => problem.id === selected);
    const next = event.key === "Enter" ? Math.max(0, index) : index < 0 ? (event.key === "ArrowDown" ? 0 : filtered.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length;
    const problem = filtered[next]; choose(problem);
    (event.currentTarget.querySelectorAll("button")[next] as HTMLElement | undefined)?.focus();
  }}>{filtered.length === 0 && <p className="p-3">No problems in the current known results.</p>}{filtered.map(problem => <div role="listitem" key={problem.id}><button onClick={() => choose(problem)} className={`flex w-full items-start gap-3 px-3 py-2 text-left ${selected === problem.id ? "bg-(--selection-bg)" : "hover:bg-(--bg-hover)"}`}><span aria-label={problem.severity} className={problem.severity === "error" ? "text-(--red)" : problem.severity === "warning" ? "text-(--yellow)" : "text-(--blue)"}>{problem.severity === "error" ? "×" : problem.severity === "warning" ? "⚠" : "i"}</span><span className="min-w-0 flex-1"><span className="block">{problem.message}</span><span className="text-(--overlay1)">{problem.file}:{problem.line}:{problem.column} · {problem.source}{problem.code ? ` (${problem.code})` : ""}</span></span></button></div>)}</div></section>;
}
