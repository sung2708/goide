import { useState } from "react";
import type { GitFileStatus } from "../../lib/ipc/git";
import type { WorkspaceBranchSnapshot, WorkspaceGitSnapshot } from "../../lib/ipc/types";
import GitDiffView from "./GitDiffView";
import GitGraph from "./GitGraph";
import { useSourceControl, type GitTransaction } from "./useSourceControl";

type Props = {
  workspacePath?: string | null; revision?: number;
  snapshot: WorkspaceGitSnapshot | null; branchSnapshot?: WorkspaceBranchSnapshot | null;
  loading?: boolean; error?: string | null;
  transaction?: GitTransaction; onChanged?: () => void;
  onOpenBranchPicker?: () => void; onOpenFile?: (path: string) => void; onOpenTerminal?: () => void;
};
const names: Record<string, string> = { M: "Modified", A: "Added", D: "Deleted", R: "Renamed", C: "Copied", "?": "Untracked", U: "Conflicted", T: "Type changed" };
const button = "rounded px-1.5 py-1 text-xs hover:bg-(--bg-hover) focus-visible:outline focus-visible:outline-(--border-active) disabled:opacity-40";

export default function SourceControlPanel(props: Props) {
  const git = useSourceControl(props.workspacePath ?? null, props.revision ?? 0, props.transaction, props.onChanged);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"changes" | "graph">("changes");
  const files = git.status?.files ?? [];
  const staged = files.filter((f) => !f.conflicted && f.indexStatus !== "." && f.indexStatus !== "?");
  const changed = files.filter((f) => !f.conflicted && f.worktreeStatus !== "." && f.worktreeStatus !== "?");
  const untracked = files.filter((f) => f.indexStatus === "?");
  const conflicts = files.filter((f) => f.conflicted);
  const disabled = git.busy || !props.transaction || Boolean(git.status?.operation) || conflicts.length > 0;
  const section = (title: string, items: GitFileStatus[], stagedView: boolean, untrackedView = false) =>
    <details open className="border-b border-(--border-subtle)" key={title}>
      <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-wide">{title} <span className="text-(--overlay1)">{items.length}</span></summary>
      {items.length > 0 && !conflicts.length && <div className="px-2 pb-1 text-right"><button className={button} disabled={disabled || items.some((f) => f.submodule)} onClick={() => void git.mutate({ kind: stagedView ? "unstage" : "stage", paths: items.map((f) => f.path) })}>{stagedView ? "Unstage" : "Stage"} all {title.toLowerCase()}</button></div>}
      <ul aria-label={title}>{items.map((file) => <li key={file.path} className="flex items-center gap-1 px-2 py-1 text-xs">
        <span title={names[stagedView ? file.indexStatus : file.worktreeStatus] ?? "Git status"} className="w-4 shrink-0 text-center font-mono text-(--blue)">{file.conflicted ? "!" : untrackedView ? "U" : stagedView ? file.indexStatus : file.worktreeStatus}</span>
        <button className={`${button} min-w-0 flex-1 truncate text-left`} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path} aria-label={`${untrackedView || file.conflicted ? "Open file" : "Open changes"} ${file.path}${stagedView ? " staged" : ""}`} onClick={() => untrackedView || file.conflicted ? props.onOpenFile?.(file.path) : void git.openDiff(file.path, stagedView)}>{file.path}</button>
        {!untrackedView && <button className={button} aria-label={`Open file ${file.path}${stagedView ? " staged" : ""}`} onClick={() => props.onOpenFile?.(file.path)}>↗</button>}
        {!file.conflicted && <button className={button} disabled={disabled || file.submodule} aria-label={`${stagedView ? "Unstage" : "Stage"} ${file.path}`} onClick={() => void git.mutate({ kind: stagedView ? "unstage" : "stage", paths: [file.path] })}>{stagedView ? "−" : "+"}</button>}
      </li>)}</ul>
    </details>;
  return <div className="flex h-full min-h-0 flex-col text-(--text)">
    <header className="border-b border-(--border-muted) px-3 py-2">
      <div className="flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase tracking-wide">Source Control</h2><button className={button} aria-label="Refresh Source Control" disabled={git.loading || git.busy} onClick={() => void git.refresh()}>↻</button></div>
      <div className="mt-1 flex items-center justify-between gap-1 text-xs"><span className="truncate">{git.status ? git.status.branch ?? `Detached HEAD @ ${git.status.head?.slice(0, 8) ?? "unknown"}` : props.snapshot?.branch ?? "Repository unavailable"}</span>{git.status?.upstream && <span title={git.status.upstream}>↑{git.status.ahead} ↓{git.status.behind}</span>}</div>
      <div className="mt-2 flex gap-1">{props.branchSnapshot && props.onOpenBranchPicker && <button className={button} disabled={git.busy} onClick={props.onOpenBranchPicker}>Switch branch</button>}{props.onOpenTerminal && <button className={button} onClick={props.onOpenTerminal}>Open terminal</button>}</div>
    </header>
    {props.workspacePath && <div className="flex gap-2 border-b border-(--border-muted) px-3 py-1"><button className={button} aria-pressed={view === "changes"} onClick={() => setView("changes")}>Changes</button><button className={button} aria-pressed={view === "graph"} onClick={() => setView("graph")}>Git Graph</button></div>}
    {view === "graph" && props.workspacePath ? <GitGraph root={props.workspacePath} /> : <>
    {git.status && <div className="border-b border-(--border-subtle) p-2">
      <label className="sr-only" htmlFor="git-commit-message">Commit message</label>
      <textarea id="git-commit-message" value={message} onChange={(event) => setMessage(event.target.value)} disabled={git.busy} rows={3} placeholder="Message for staged changes" className="w-full resize-y rounded border border-(--border-muted) bg-(--crust) px-2 py-1.5 text-xs outline-none focus:border-(--border-active)" />
      <button className={`${button} mt-1 w-full border border-(--border-muted)`} disabled={disabled || !staged.length || !message.trim()} onClick={async () => { if (await git.mutate({ kind: "commit", message })) setMessage(""); }}>Commit staged ({staged.length})</button>
      {!staged.length && <p className="mt-1 text-[11px] text-(--overlay1)">Stage files explicitly before committing.</p>}
    </div>}
    {(git.error ?? (!props.workspacePath ? props.error : null)) && <p role="alert" className="break-words px-3 py-2 text-xs text-(--red)">{git.error ?? props.error}</p>}
    {(git.loading || git.busy) && <p role="status" className="px-3 py-1 text-xs text-(--overlay1)">{git.busy ? "Git operation in progress…" : "Refreshing Git…"}</p>}
    {git.status?.operation && <p role="status" className="px-3 py-2 text-xs text-(--yellow)">{git.status.operation.toUpperCase()} IN PROGRESS. Continue in the repository terminal.</p>}
    <div className="min-h-0 flex-1 overflow-auto">{git.status && (files.length ? <>{conflicts.length > 0 && section("Merge changes / conflicts", conflicts, false)}{section("Staged changes", staged, true)}{section("Changes", changed, false)}{section("Untracked", untracked, false, true)}</> : <p className="p-3 text-xs text-(--overlay1)">Working tree clean.</p>)}{!props.workspacePath && <p className="p-3 text-xs text-(--overlay1)">Open a repository root to inspect Source Control.</p>}</div>
    {git.diffLoading && <p role="status" className="p-2 text-xs">Loading diff…</p>}
    {git.diff && <GitDiffView diff={git.diff} onClose={git.closeDiff} />}
    {git.output.length > 0 && <details className="max-h-32 overflow-auto border-t border-(--border-muted) text-xs"><summary className="px-3 py-2">Git output</summary><pre className="whitespace-pre-wrap break-words px-3 pb-2">{git.output.join("\n")}</pre></details>}
    </>}
  </div>;
}
