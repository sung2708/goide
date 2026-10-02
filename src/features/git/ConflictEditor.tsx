import { useEffect, useRef, useState } from "react";
import { getGitConflictContent, type GitConflictContent, type GitMutation } from "../../lib/ipc/git";
import type { GitTransaction } from "./useSourceControl";
import { getConflictDraft, retainConflictDraft, removeConflictDraft } from "./conflictDrafts";

type Props = { root: string; path: string; busy: boolean; transaction?: GitTransaction; mutate: (mutation: GitMutation) => Promise<boolean>; onClose: () => void };
const button = "rounded border border-(--border-muted) px-2 py-1 text-xs hover:bg-(--bg-hover) disabled:opacity-40";

export default function ConflictEditor({ root, path, busy, transaction, mutate, onClose }: Props) {
  const [content, setContent] = useState<GitConflictContent | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    const load = async () => {
      try {
        if (!transaction) throw new Error("Document transaction unavailable.");
        await transaction(async () => {
          const response = await getGitConflictContent(root, path);
          if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Conflict unavailable.");
          if (active) {
            const draft = getConflictDraft(root, path);
            setContent(draft?.content ?? response.data); setResult(draft?.result ?? response.data.result);
            if (draft && (draft.content.indexSignature !== response.data.indexSignature || draft.content.result !== response.data.result)) setError("Disk/index changed while your result draft was retained. Copy your draft and review the current file before saving.");
          }
        }, true, false);
      } catch (error) { if (active) setError(error instanceof Error ? error.message : String(error)); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; mounted.current = false; };
    // The parent keys this view by repository and path; transaction functions can change during saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, path]);
  const dirty = content !== null && result !== content.result;
  const edit = (value: string) => { if (content) retainConflictDraft(root, content, value); setResult(value); };
  const close = () => { if (!dirty || window.confirm("Close conflict editor and discard its unsaved result edits?")) { removeConflictDraft(root, path); onClose(); } };
  return <section aria-label="Git conflict editor" className="min-h-0 overflow-auto border-t border-(--border-muted) p-3 text-xs">
    <div className="flex items-center justify-between gap-2"><strong className="truncate">Resolve {path}</strong><button className={button} disabled={busy} onClick={close}>Close conflict editor</button></div>
    {loading && <p role="status">Loading index stages…</p>}
    {error && <p role="alert" className="py-2 text-(--red)">{error}</p>}
    {content && <>
      <p className="my-2 text-(--overlay1)">Current is index stage 2; Incoming is stage 3. During rebase these are the rebased target and your replayed change. Saving does not stage this file.</p>
      <div className="grid gap-2 lg:grid-cols-3">{(["base", "current", "incoming"] as const).map((side) => <div key={side}><label className="capitalize">{side}</label><pre aria-label={`Conflict ${side}`} className="max-h-48 overflow-auto whitespace-pre border border-(--border-muted) bg-(--crust) p-2">{content[side] ?? "Absent index stage (added/deleted file)"}</pre></div>)}</div>
      <div className="my-2 flex flex-wrap gap-2">
        <button className={button} disabled={busy || content.current === null} onClick={() => { if (!dirty || window.confirm("Replace unsaved result edits with Current?")) edit(content.current ?? ""); }}>Accept Current</button>
        <button className={button} disabled={busy || content.incoming === null} onClick={() => { if (!dirty || window.confirm("Replace unsaved result edits with Incoming?")) edit(content.incoming ?? ""); }}>Accept Incoming</button>
        <button className={button} disabled={busy || content.current === null || content.incoming === null} onClick={() => { if (window.confirm("Concatenate Current then Incoming? This may duplicate code and requires manual review.")) edit((content.current ?? "") + (content.incoming ?? "")); }}>Accept Both (review)</button>
      </div>
      <label htmlFor="git-conflict-result">Result</label><textarea id="git-conflict-result" aria-label="Conflict result" value={result} disabled={busy} onChange={(event) => edit(event.target.value)} rows={12} className="w-full border border-(--border-muted) bg-(--crust) p-2 font-mono" />
      <button className={button} onClick={() => void navigator.clipboard.writeText(result).catch(() => setError("Clipboard unavailable."))}>Copy conflict result</button>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={button} disabled={busy || !dirty} onClick={async () => {
          const saved = result;
          if (await mutate({ kind: "saveConflict", path, expectedIndex: content.indexSignature, expectedDisk: content.result, result: saved }) && mounted.current) { removeConflictDraft(root, path); setContent({ ...content, result: saved }); }
        }}>Save result (keep unresolved)</button>
        <button className={button} disabled={busy || dirty} onClick={async () => {
          if (window.confirm(`Stage reviewed result for ${path} as resolved? Git does not validate code correctness.`) && await mutate({ kind: "stageResolved", path, expectedIndex: content.indexSignature, expectedDisk: content.result }) && mounted.current) onClose();
        }}>Stage resolved</button>
      </div>
    </>}
  </section>;
}
