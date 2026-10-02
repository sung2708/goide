import { useEffect, useRef, useState } from "react";
import { searchGitHistory, type GitHistoryCommit, type GitHistorySearchRequest } from "../../lib/ipc/git";

type Props = { root: string; tips: string[]; initialFilePath?: string | null; onSelect: (commit: GitHistoryCommit) => void; onClose: () => void };
export default function GitHistorySearch({ root, tips, initialFilePath, onSelect, onClose }: Props) {
  const [field, setField] = useState<GitHistorySearchRequest["field"]>(initialFilePath ? "file" : "message");
  const [text, setText] = useState(initialFilePath ?? "");
  const [results, setResults] = useState<{ commits: GitHistoryCommit[]; tips: string[]; hasMore: boolean } | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  const generation = useRef(0), pending = useRef(false);
  const reset = () => { generation.current++; pending.current = false; setLoading(false); setResults(null); setError(null); };
  useEffect(() => { reset(); return () => { generation.current++; }; }, [root]);
  const search = async (more = false) => {
    if (pending.current || !text.trim()) return;
    const id = ++generation.current; pending.current = true; setLoading(true); setError(null);
    if (!more) setResults(null);
    try {
      const response = await searchGitHistory(root, { field, text, offset: more ? results?.commits.length ?? 0 : 0, tips: more ? results?.tips ?? tips : tips });
      if (id !== generation.current) return;
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Git history search unavailable.");
      const page = response.data;
      setResults({ ...page, commits: more ? [...results?.commits ?? [], ...page.commits] : page.commits });
    } catch (error) { if (id === generation.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (id === generation.current) { pending.current = false; setLoading(false); } }
  };
  useEffect(() => { if (initialFilePath) void search(); }, [root, initialFilePath]);
  return <section aria-label="Search repository history" className="border-b border-(--border-muted) p-3 text-xs">
    <form onSubmit={event => { event.preventDefault(); void search(); }} className="flex flex-wrap gap-2">
      <select aria-label="Commit search field" value={field} onChange={event => { reset(); setField(event.target.value as GitHistorySearchRequest["field"]); }} className="bg-(--mantle)"><option value="message">Message</option><option value="author">Author</option><option value="hash">Commit hash</option><option value="file">File history</option></select>
      <input aria-label="Search commits" maxLength={field === "file" ? 4096 : 512} value={text} onChange={event => { reset(); setText(event.target.value); }} placeholder={field === "hash" ? "At least 7 hex characters" : field === "file" ? "Exact relative file path" : "Literal text"} className="min-w-0 flex-1 border border-(--border-muted) bg-(--crust) px-2 py-1" />
      <button disabled={loading || !text.trim()}>Search</button><button type="button" onClick={onClose}>Close search</button>
    </form>
    <p className="mt-2 text-(--overlay1)">{field === "hash" ? "Find a commit object in this repository." : field === "file" ? "Exact file path in pinned history. Git follows renames where detectable; deleted files are supported." : "Search pinned repository history, including commits not loaded in the graph. Literal, case-insensitive matches."}</p>
    {loading && <p role="status">Searching Git history…</p>}{error && <p role="alert" className="text-(--red)">{error}</p>}
    {results && <><p role="status" className="mt-2">{results.commits.length} results{results.hasMore ? " loaded · more available" : ""}</p>
      <ul className="max-h-60 overflow-auto">{results.commits.map(commit => <li key={commit.hash}><button className="w-full break-words py-2 text-left hover:bg-(--bg-hover)" onClick={() => onSelect(commit)}><span className="font-mono">{commit.hash.slice(0, 12)}</span> · {commit.subject}<span className="block text-(--overlay1)">{commit.author} · {commit.date}</span></button></li>)}</ul>
      {results.hasMore && <button disabled={loading || results.commits.length >= 2000} onClick={() => void search(true)}>{results.commits.length >= 2000 ? "2000-result view limit — use terminal for more" : "Load 100 more search results"}</button>}
    </>}
  </section>;
}
