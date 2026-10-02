import { useEffect, useMemo, useRef, useState } from "react";
import { getGitHistoryPage, type GitHistoryCommit } from "../../lib/ipc/git";
import { layoutGraph } from "./graphLayout";

const ROW = 36;
const colors = ["var(--blue)", "var(--green)", "var(--mauve)", "var(--peach)", "var(--teal)"];

export default function GitGraph({ root }: { root: string }) {
  const [commits, setCommits] = useState<GitHistoryCommit[]>([]);
  const [tips, setTips] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GitHistoryCommit | null>(null);
  const [scroll, setScroll] = useState(0);
  const generation = useRef(0);
  const pending = useRef(false);
  const rows = useMemo(() => layoutGraph(commits), [commits]);
  const load = async (reset: boolean) => {
    if (pending.current && !reset) return;
    const id = ++generation.current;
    pending.current = true; setLoading(true); setError(null);
    if (reset) { setCommits([]); setSelected(null); setScroll(0); }
    try {
      const response = await getGitHistoryPage(root, reset ? 0 : commits.length, reset ? [] : tips);
      if (id !== generation.current) return;
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Git history unavailable.");
      const page = response.data;
      setCommits((current) => reset ? page.commits : [...current, ...page.commits]);
      setTips(page.tips); setHasMore(page.hasMore);
    } catch (err) { if (id === generation.current) setError(err instanceof Error ? err.message : "Git history unavailable."); }
    finally { if (id === generation.current) { pending.current = false; setLoading(false); } }
  };
  useEffect(() => { void load(true); return () => { generation.current++; pending.current = false; }; }, [root]);
  const first = Math.max(0, Math.floor(scroll / ROW) - 3);
  const visible = rows.slice(first, first + 24);
  return <section aria-label="Git Graph" className="flex min-h-0 flex-1 flex-col">
    <header className="flex items-center justify-between border-b border-(--border-muted) px-3 py-2 text-xs"><span>Git Graph · {commits.length} loaded</span><button aria-label="Refresh Git Graph" disabled={loading} onClick={() => void load(true)}>↻</button></header>
    {error && <p role="alert" className="p-3 text-xs text-(--red)">{error}</p>}
    {!loading && !error && !commits.length && <p className="p-3 text-xs">No commits yet.</p>}
    <div className="min-h-0 flex-1 overflow-auto" style={{ maxHeight: 600 }} onScroll={(event) => setScroll(event.currentTarget.scrollTop)}>
      <div role="list" aria-label="Commit graph" style={{ height: rows.length * ROW, position: "relative" }}>
        {visible.map((row, offset) => <button role="listitem" key={row.commit.hash} aria-label={`${row.commit.subject}; ${row.commit.hash}; ${row.commit.parents.length} parents`} aria-pressed={selected?.hash === row.commit.hash} onClick={() => setSelected(row.commit)} className="absolute flex w-full items-center gap-2 overflow-hidden px-2 text-left text-xs hover:bg-(--bg-hover) focus-visible:outline focus-visible:outline-(--border-active)" style={{ top: (first + offset) * ROW, height: ROW }}>
          <svg aria-hidden="true" width={Math.max(30, row.width * 14 + 12)} height={ROW} className="shrink-0">
            {row.incoming && <path d={`M${row.lane * 14 + 10} 0 V18`} stroke={colors[row.lane % colors.length]} />}
            {row.edges.map((edge, index) => <path key={index} d={`M${edge.from * 14 + 10} ${edge.parent ? 18 : 0} L${edge.to * 14 + 10} 36`} stroke={colors[edge.from % colors.length]} fill="none" strokeWidth={1.5} />)}
            <circle cx={row.lane * 14 + 10} cy={18} r={row.commit.parents.length > 1 ? 4.5 : 3.5} stroke={colors[row.lane % colors.length]} fill="var(--base)" strokeWidth={2} />
          </svg>
          <span className="min-w-0 flex-1"><span className="block truncate">{row.commit.subject}</span><span className="block truncate text-[10px] text-(--overlay1)">{row.commit.hash.slice(0, 8)} · {row.commit.author} · {row.commit.date.slice(0, 10)}</span></span>
          {row.commit.refs.length > 0 && <span className="max-w-24 truncate rounded border border-(--border-muted) px-1 text-[10px]" title={row.commit.refs.join(", ")}>{row.commit.refs.join(", ")}</span>}
        </button>)}
      </div>
    </div>
    {loading && <p role="status" className="px-3 py-2 text-xs">Loading Git history…</p>}
    {hasMore && <button disabled={loading || commits.length >= 2000} className="border-t border-(--border-muted) px-3 py-2 text-xs" onClick={() => void load(false)}>{commits.length >= 2000 ? "2000-commit view limit — use terminal for more" : "Load 100 more commits"}</button>}
    {selected && <div className="max-h-40 overflow-auto border-t border-(--border-muted) p-3 text-xs"><p className="break-all font-mono">{selected.hash}</p><p>{selected.subject}</p><p className="text-(--overlay1)">{selected.author} · {selected.date}</p><p className="break-all">Parents: {selected.parents.join(", ") || "Root commit"}</p><p>{selected.refs.join(", ")}</p><button className="mt-2" onClick={() => void navigator.clipboard.writeText(selected.hash).catch(() => setError("Clipboard unavailable. Select and copy the full hash above."))}>Copy full hash</button></div>}
  </section>;
}
