import { useEffect, useRef, useState } from "react";
import { getGitCommitDetails, getGitHistoricalDiff, type GitCommitDetails, type GitFileDiff } from "../../lib/ipc/git";
import GitDiffView from "./GitDiffView";
export default function CommitDetailsView({ root, hash }: { root: string; hash: string }) {
  const [details, setDetails] = useState<GitCommitDetails | null>(null);
  const [parent, setParent] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitFileDiff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const epoch = useRef(0), diffRequest = useRef(0);
  useEffect(() => {
    const id = ++epoch.current;
    diffRequest.current++; setDiff(null); setDetails(null); setLoading(true); setError(null);
    void getGitCommitDetails(root, hash, parent).then((response) => {
      if (id !== epoch.current) return;
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Commit details unavailable.");
      setDetails(response.data);
    }).catch((error) => { if (id === epoch.current) setError(String(error instanceof Error ? error.message : error)); })
      .finally(() => { if (id === epoch.current) setLoading(false); });
    return () => { epoch.current++; diffRequest.current++; };
  }, [root, hash, parent]);
  const openDiff = async (path: string) => {
    const session = epoch.current, request = ++diffRequest.current;
    setDiff(null); setError(null);
    try {
      const response = await getGitHistoricalDiff(root, hash, details?.selectedParent ?? null, path);
      if (session !== epoch.current || request !== diffRequest.current) return;
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Historical diff unavailable.");
      setDiff(response.data);
    } catch (error) { if (session === epoch.current && request === diffRequest.current) setError(error instanceof Error ? error.message : String(error)); }
  };
  return <section aria-label="Commit details" className="max-h-80 overflow-auto border-t border-(--border-muted) p-3 text-xs">
    {loading && <p role="status">Loading commit details…</p>}{error && <p role="alert" className="text-(--red)">{error}</p>}
    {details && <><p className="break-all font-mono">{details.hash}</p><p>{details.author} &lt;{details.email}&gt; · {details.date}</p>
      <pre className="my-2 whitespace-pre-wrap break-words">{details.message}</pre>
      <p className="break-all">Parents: {details.parents.join(", ") || "Root commit"}</p>
      {details.parents.length > 1 && <label>Compare parent <select aria-label="Compare parent" value={details.selectedParent ?? ""} onChange={(event) => setParent(event.target.value)} className="ml-2 bg-(--mantle)">{details.parents.map((parent, index) => <option key={parent} value={parent}>{index + 1}: {parent.slice(0, 12)}</option>)}</select></label>}
      <p className="mt-2">{details.files.length} changed files</p><ul>{details.files.map((file) => <li key={file.path}><button className="w-full break-all py-1 text-left hover:bg-(--bg-hover)" onClick={() => void openDiff(file.path)}>{file.status} {file.originalPath ? `${file.originalPath} → ` : ""}{file.path}</button></li>)}</ul>
      <button className="mt-2" onClick={() => void navigator.clipboard.writeText(details.hash).catch(() => setError("Clipboard unavailable."))}>Copy full hash</button>
      <button className="ml-3" onClick={() => void navigator.clipboard.writeText(details.message).catch(() => setError("Clipboard unavailable."))}>Copy commit message</button>
    </>}
    {diff && <GitDiffView diff={diff} onClose={() => { diffRequest.current++; setDiff(null); }} />}
  </section>;
}
