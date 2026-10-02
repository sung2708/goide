import { useCallback, useEffect, useRef, useState } from "react";
import { getGitStashList, getGitStashPreview, type GitFileDiff, type GitMutation, type GitStashEntry, type GitStashList } from "../../lib/ipc/git";
import GitDiffView from "./GitDiffView";

type Props = { root: string; revision: number; disabled: boolean; busy: boolean; error: string | null; output?: string[]; mutate: (mutation: GitMutation) => Promise<boolean>; cancel: () => Promise<void> };
const button = "rounded px-2 py-1 text-xs hover:bg-(--bg-hover) focus-visible:outline disabled:opacity-40";
export default function StashPanel({ root, revision, disabled, busy, error: operationError, output = [], mutate, cancel }: Props) {
  const [list, setList] = useState<GitStashList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState<GitFileDiff | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [message, setMessage] = useState("");
  const [restoreIndex, setRestoreIndex] = useState(false);
  const generation = useRef(0), previewGeneration = useRef(0);
  const lifetime = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++generation.current; setLoading(true);
    try {
      const response = await getGitStashList(root);
      if (id !== generation.current) return;
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Stash list unavailable.");
      setList(response.data); setError(null);
    } catch (failure) { if (id === generation.current) { setList(null); setError(String(failure)); } }
    finally { if (id === generation.current) setLoading(false); }
  }, [root]);
  useEffect(() => {
    lifetime.current++;
    setList(null); setDiff(null); setMessage(""); setError(null); setPreviewPending(false);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => { lifetime.current++; generation.current++; previewGeneration.current++; window.removeEventListener("focus", focus); };
  }, [refresh]);
  useEffect(() => { void refresh(); }, [revision, refresh]);
  const preview = async (entry: GitStashEntry) => {
    const id = ++previewGeneration.current; setDiff(null); setPreviewPending(true); setError(null);
    try {
      const response = await getGitStashPreview(root, entry.reference, entry.hash);
      if (id !== previewGeneration.current) return;
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Stash diff unavailable.");
      setDiff(response.data);
    } catch (failure) { if (id === previewGeneration.current) setError(String(failure)); }
    finally { if (id === previewGeneration.current) setPreviewPending(false); }
  };
  const act = async (mutation: GitMutation) => {
    const id = lifetime.current;
    previewGeneration.current++; setDiff(null); setPreviewPending(false);
    const result = await mutate(mutation);
    if (id !== lifetime.current) return;
    if (result && mutation.kind === "stashPush") setMessage("");
    previewGeneration.current++; setDiff(null); setPreviewPending(false);
    await refresh();
  };
  return <section aria-label="Stashes" className="flex min-h-0 flex-1 flex-col overflow-auto p-2 text-xs">
    <p className="mb-2">Stash saved changes. Unsaved editor buffers are saved first; ignored files are excluded.</p>
    <input aria-label="Stash message" maxLength={4096} value={message} disabled={busy} onChange={event => setMessage(event.target.value)} className="rounded bg-(--crust) p-2" placeholder="Optional stash message" />
    <div className="flex flex-wrap gap-1">
      <button className={button} disabled={disabled} onClick={() => { if (window.confirm("Save open buffers, stash tracked changes, and restore HEAD files?")) void act({ kind: "stashPush", message, includeUntracked: false }); }}>Stash Changes</button>
      <button className={button} disabled={disabled} onClick={() => { if (window.confirm("Save open buffers and stash tracked plus untracked files? Ignored files are excluded.")) void act({ kind: "stashPush", message, includeUntracked: true }); }}>Stash Including Untracked</button>
      <button className={button} disabled={loading || busy} onClick={() => { previewGeneration.current++; setDiff(null); void refresh(); }}>Refresh stashes</button>
    </div>
    <label className="my-2"><input type="checkbox" checked={restoreIndex} disabled={busy} onChange={event => setRestoreIndex(event.target.checked)} /> Restore staged state on Apply/Pop</label>
    {(operationError || error) && <p role="alert" className="break-words text-(--red)">{operationError || error}</p>}
    {(loading || busy || previewPending) && <p role="status">{busy ? "Git operation in progress…" : previewPending ? "Loading stash diff…" : "Loading stashes…"}{busy && <button className={button} onClick={() => void cancel()}>Cancel Git operation</button>}</p>}
    {list && !list.entries.length && <p>No saved stashes.</p>}
    {list?.hasMore && <p role="status">Showing the latest 100 stashes. Use the repository terminal for older entries.</p>}
    <ul aria-label="Saved stashes">{list?.entries.map(entry => <li key={`${entry.reference}:${entry.hash}`} className="my-2 border border-(--border) p-2">
      <button className={`${button} break-all text-left`} disabled={busy} onClick={() => void preview(entry)}>{entry.reference} — {entry.message}</button>
      <p>{entry.date} · {entry.hash.slice(0, 12)}</p>
      <div className="flex gap-1">{(["stashApply", "stashPop", "stashDrop"] as const).map(kind => <button key={kind} className={button} disabled={disabled} aria-label={`${kind === "stashApply" ? "Apply" : kind === "stashPop" ? "Pop" : "Drop"} ${entry.reference}`} onClick={() => {
        const action = kind === "stashApply" ? "Apply (keep stash)" : kind === "stashPop" ? "Pop (drop only after successful apply)" : "Permanently drop";
        if (window.confirm(`${action} ${entry.reference}: ${entry.message}?${kind === "stashDrop" ? " This deletes the saved stash entry." : " Open buffers will be saved first."}`)) void act(kind === "stashDrop" ? { kind, reference: entry.reference, hash: entry.hash } : { kind, reference: entry.reference, hash: entry.hash, restoreIndex });
      }}>{kind === "stashApply" ? "Apply" : kind === "stashPop" ? "Pop" : "Drop"}</button>)}</div>
    </li>)}</ul>
    {diff && <GitDiffView diff={diff} onClose={() => { previewGeneration.current++; setDiff(null); }} />}
    {output.length > 0 && <details><summary>Git output</summary><pre className="whitespace-pre-wrap break-words">{output.join("\n")}</pre></details>}
  </section>;
}
