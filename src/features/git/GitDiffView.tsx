import { useEffect, useMemo, useRef, useState } from "react";
import type { GitFileDiff } from "../../lib/ipc/git";

export default function GitDiffView({ diff, onClose }: { diff: GitFileDiff; onClose: () => void }) {
  const lines = useMemo(() => diff.patch.split("\n"), [diff.patch]);
  const hunks = useMemo(() => lines.flatMap((line, index) => line.startsWith("@@ ") ? [index] : []), [lines]);
  const [hunk, setHunk] = useState(0);
  const active = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setHunk(0); }, [diff]);
  useEffect(() => { active.current?.scrollIntoView?.({ block: "center" }); }, [hunk]);
  const navigate = (delta: number) => setHunk((current) => (current + delta + hunks.length) % hunks.length);
  return <section aria-label="Git diff" className="flex min-h-0 flex-1 flex-col border-t border-(--border-muted)">
    <header className="flex items-center gap-2 px-3 py-2 text-xs">
      <span className="min-w-0 flex-1 break-all">{diff.originalPath ? `${diff.originalPath} → ` : ""}{diff.path}</span>
      <button aria-label="Previous change" disabled={!hunks.length} onClick={() => navigate(-1)}>↑</button>
      <button aria-label="Next change" disabled={!hunks.length} onClick={() => navigate(1)}>↓</button>
      <button aria-label="Close diff" onClick={onClose}>×</button>
    </header>
    {diff.limited ? <p className="p-3 text-xs">Diff exceeds 256 KiB. Inspect it in the repository terminal.</p> : diff.binary ? <p className="p-3 text-xs">Binary file changed. Text diff is unavailable.</p> : !diff.patch ? <p className="p-3 text-xs">No changes in this comparison.</p> :
      <div tabIndex={0} aria-label="Unified diff" className="overflow-auto font-mono text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-(--border-active)" onKeyDown={(event) => {
        if (hunks.length && event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); navigate(event.key === "ArrowDown" ? 1 : -1); }
      }}>{lines.map((line, index) => <div key={index} ref={index === hunks[hunk] ? active : undefined} className={`whitespace-pre px-3 ${line.startsWith("+") ? "text-(--green)" : line.startsWith("-") ? "text-(--red)" : line.startsWith("@@") ? "bg-(--surface0) text-(--blue)" : "text-(--subtext0)"}`}>{line || " "}</div>)}</div>}
  </section>;
}
