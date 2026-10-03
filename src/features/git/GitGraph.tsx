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
  return (
    <section aria-label="Git Graph" className="flex min-h-0 flex-1 flex-col bg-[var(--base)]">
      <header className="flex items-center justify-between border-b border-[var(--border-structural)] bg-[var(--surface-solid)] px-3 py-1.5 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-[11px] uppercase tracking-wider text-[var(--subtext1)]">Git Graph</span>
          <span className="font-mono text-[9px] text-[var(--overlay1)] px-1.5 py-0.2 bg-[var(--surface0)]/60 border border-[var(--border-subtle)] shrink-0">
            {commits.length}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-0.5 text-xs border border-[var(--border-subtle)] bg-[var(--surface0)]/60 hover:bg-[var(--bg-hover)] text-[var(--subtext0)] hover:text-[var(--text)] transition-colors"
            aria-pressed={searching}
            onClick={() => setSearching((value) => !value)}
            title="Search commits"
            aria-label="Search commits"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <span className="hidden sm:inline">Search commits</span>
          </button>
          <button
            type="button"
            className="size-6 flex items-center justify-center border border-[var(--border-subtle)] bg-[var(--surface0)] hover:bg-[var(--bg-hover)] text-[var(--subtext0)] hover:text-[var(--text)] transition-colors disabled:opacity-40"
            aria-label="Refresh Git Graph"
            disabled={loading}
            onClick={() => { setSearching(false); void load(true); }}
            title="Refresh Git Graph"
          >
            <svg width="12" height="12" className={loading ? "animate-spin" : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
            </svg>
          </button>
        </div>
      </header>
      {searching && <GitHistorySearch key={`${root}:${initialFilePath ?? ""}`} root={root} tips={tips} initialFilePath={initialFilePath} onSelect={setSelected} onClose={() => setSearching(false)} />}
      {error && <p role="alert" className="p-3 text-xs text-[var(--red)]">{error}</p>}
      {!loading && !error && !commits.length && <p className="p-3 text-xs text-[var(--overlay1)]">No commits yet.</p>}
      <div className="min-h-0 flex-1 overflow-auto" style={{ maxHeight: 600 }} onScroll={(event) => setScroll(event.currentTarget.scrollTop)}>
        <GitGraphCustomRenderer
          model={model}
          virtualized
          virtualRows={visible.map((_, offset) => ({ index: first + offset, start: (first + offset) * ROW, size: ROW }))}
          totalHeight={rows.length * ROW}
          rowHeight={ROW}
          selectedHash={selected?.hash}
          onCommitHover={() => undefined}
          onCommitLeave={() => undefined}
          onCommitSelect={(node) => setSelected(commits.find((commit) => commit.hash === node.hash) ?? null)}
        />
      </div>
      {loading && <p role="status" className="px-3 py-2 text-xs text-[var(--overlay1)]">Loading Git history…</p>}
      {hasMore && (
        <button
          disabled={loading || commits.length >= 2000}
          className="border-t border-[var(--border-structural)] bg-[var(--surface0)]/40 hover:bg-[var(--bg-hover)] text-[var(--subtext0)] hover:text-[var(--text)] px-3 py-2 text-xs transition-colors"
          onClick={() => void load(false)}
        >
          {commits.length >= 2000 ? "2000-commit view limit — use terminal for more" : "Load 100 more commits"}
        </button>
      )}
      {selected && <CommitDetailsView key={`${root}:${selected.hash}`} root={root} hash={selected.hash} />}
    </section>
  );
}
