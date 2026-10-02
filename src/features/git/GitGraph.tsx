import { useEffect, useMemo, useRef, useState } from "react";
import { getGitHistoryPage, type GitHistoryCommit } from "../../lib/ipc/git";
import { layoutGraph } from "./graphLayout";
import { rendererModel } from "./graphRendererModel";
import GitGraphCustomRenderer from "../../components/panels/GitGraphCustomRenderer";
import CommitDetailsView from "./CommitDetailsView";
import GitHistorySearch from "./GitHistorySearch";

const ROW = 36;


export default function GitGraph({ root, initialFilePath }: { root: string; initialFilePath?: string | null }) {
  const [commits, setCommits] = useState<GitHistoryCommit[]>([]);
  const [tips, setTips] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GitHistoryCommit | null>(null);
  const [scroll, setScroll] = useState(0);
  const [searching, setSearching] = useState(Boolean(initialFilePath));
  const generation = useRef(0);
  const pending = useRef(false);
  const rows = useMemo(() => layoutGraph(commits), [commits]);
  const model = useMemo(() => rendererModel(commits), [commits]);
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
    <header className="flex items-center justify-between border-b border-(--border-muted) px-3 py-2 text-xs"><span>Git Graph · {commits.length} loaded</span><button aria-pressed={searching} onClick={() => setSearching(value => !value)}>Search commits</button><button aria-label="Refresh Git Graph" disabled={loading} onClick={() => { setSearching(false); void load(true); }}>↻</button></header>
    {searching && <GitHistorySearch key={`${root}:${initialFilePath ?? ""}`} root={root} tips={tips} initialFilePath={initialFilePath} onSelect={setSelected} onClose={() => setSearching(false)} />}
    {error && <p role="alert" className="p-3 text-xs text-(--red)">{error}</p>}
    {!loading && !error && !commits.length && <p className="p-3 text-xs">No commits yet.</p>}
    <div className="min-h-0 flex-1 overflow-auto" style={{ maxHeight: 600 }} onScroll={(event) => setScroll(event.currentTarget.scrollTop)}>
      <GitGraphCustomRenderer model={model} virtualized virtualRows={visible.map((_, offset) => ({ index: first + offset, start: (first + offset) * ROW, size: ROW }))} totalHeight={rows.length * ROW} rowHeight={ROW} onCommitHover={() => undefined} onCommitLeave={() => undefined} onCommitSelect={(node) => setSelected(commits.find((commit) => commit.hash === node.hash) ?? null)} />
    </div>
    {loading && <p role="status" className="px-3 py-2 text-xs">Loading Git history…</p>}
    {hasMore && <button disabled={loading || commits.length >= 2000} className="border-t border-(--border-muted) px-3 py-2 text-xs" onClick={() => void load(false)}>{commits.length >= 2000 ? "2000-commit view limit — use terminal for more" : "Load 100 more commits"}</button>}
    {selected && <CommitDetailsView key={`${root}:${selected.hash}`} root={root} hash={selected.hash} />}
  </section>;
}
