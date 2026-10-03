import { useEffect, useState } from "react";
import type { GitFileStatus } from "../../lib/ipc/git";
import type { WorkspaceBranchSnapshot, WorkspaceGitSnapshot } from "../../lib/ipc/types";
import GitDiffView from "./GitDiffView";
import GitGraph from "./GitGraph";
import StashPanel from "./StashPanel";
import { useSettings } from "../settings/useSettings";
import ConflictEditor from "./ConflictEditor";
import { useSourceControl, type GitTransaction } from "./useSourceControl";

type Props = {
  requestedView?: { view: "changes" | "graph" | "stashes"; id: number };
  workspacePath?: string | null; revision?: number;
  snapshot: WorkspaceGitSnapshot | null; branchSnapshot?: WorkspaceBranchSnapshot | null;
  loading?: boolean; error?: string | null;
  transaction?: GitTransaction; onChanged?: () => void;
  onOpenBranchPicker?: () => void; onOpenFile?: (path: string) => void; onOpenTerminal?: () => void;
};
const names: Record<string, string> = { M: "Modified", A: "Added", D: "Deleted", R: "Renamed", C: "Copied", "?": "Untracked", U: "Conflicted", T: "Type changed" };
const button = "rounded-none px-2 py-0.5 text-xs border border-[var(--border-subtle)] bg-[var(--surface0)]/50 text-[var(--subtext0)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-muted)] focus-visible:outline focus-visible:outline-[var(--focus-ring)] transition-colors duration-100 disabled:opacity-40";

export default function SourceControlPanel(props: Props) {
  const { values: settings } = useSettings();
  const git = useSourceControl(props.workspacePath ?? null, props.revision ?? 0, props.transaction, props.onChanged);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"changes" | "graph" | "stashes">(settings["git.defaultView"]);
  const [historyPath, setHistoryPath] = useState<string | null>(null);
  useEffect(() => { if (props.requestedView) { setHistoryPath(null); setView(props.requestedView.view); } }, [props.requestedView]);
  useEffect(() => { setHistoryPath(null); }, [props.workspacePath]);
  const [chosenRemote, setChosenRemote] = useState("");
  const [conflictPath, setConflictPath] = useState<string | null>(null);
  const [branchName, setBranchName] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const remotes = git.status?.remotes ?? [];
  const remote = remotes.includes(chosenRemote) ? chosenRemote : remotes[0] ?? "";
  const targetBranch = git.status?.upstream?.startsWith(`${remote}/`) ? git.status.upstream.slice(remote.length + 1) : git.status?.branch;
  const files = git.status?.files ?? [];
  const staged = files.filter((f) => !f.conflicted && f.indexStatus !== "." && f.indexStatus !== "?");
  const changed = files.filter((f) => !f.conflicted && f.worktreeStatus !== "." && f.worktreeStatus !== "?");
  const untracked = files.filter((f) => f.indexStatus === "?");
  const conflicts = files.filter((f) => f.conflicted);
  const disabled = git.busy || !props.transaction || Boolean(git.status?.operation) || conflicts.length > 0;
  const commitDisabled = git.busy || !props.transaction || conflicts.length > 0 || Boolean(git.status?.operation && git.status.operation !== "merge");
  const section = (title: string, items: GitFileStatus[], stagedView: boolean, untrackedView = false) =>
    <details open className="border-b border-(--border-subtle)" key={title}>
      <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase tracking-wide">{title} <span className="text-(--overlay1)">{items.length}</span></summary>
      {items.length > 0 && !conflicts.length && <div className="px-2 pb-1 text-right"><button className={button} disabled={disabled || items.some((f) => f.submodule)} onClick={() => void git.mutate({ kind: stagedView ? "unstage" : "stage", paths: items.map((f) => f.path) })}>{stagedView ? "Unstage" : "Stage"} all {title.toLowerCase()}</button></div>}
      <ul aria-label={title}>{items.map((file) => <li key={file.path} className="flex items-center gap-1 px-2 py-1 text-xs">
        <span title={names[stagedView ? file.indexStatus : file.worktreeStatus] ?? "Git status"} className="w-4 shrink-0 text-center font-mono text-(--blue)">{file.conflicted ? "!" : untrackedView ? "U" : stagedView ? file.indexStatus : file.worktreeStatus}</span>
        <button className={`${button} min-w-0 flex-1 truncate text-left`} title={file.originalPath ? `${file.originalPath} → ${file.path}` : file.path} aria-label={`${untrackedView || file.conflicted ? "Open file" : "Open changes"} ${file.path}${stagedView ? " staged" : ""}`} onClick={() => untrackedView || file.conflicted ? props.onOpenFile?.(file.path) : void git.openDiff(file.path, stagedView)}>{file.path}</button>
        {!untrackedView && <button className={button} aria-label={`Open file ${file.path}${stagedView ? " staged" : ""}`} onClick={() => props.onOpenFile?.(file.path)}>↗</button>}
        <button className={button} aria-label={`File history ${file.path}${stagedView ? " staged" : ""}`} onClick={() => { setHistoryPath(file.path); setView("graph"); }}>History</button>
        {file.conflicted && <button className={button} disabled={git.busy || !props.transaction} onClick={() => setConflictPath(file.path)}>Resolve conflict</button>}
        {!file.conflicted && <button className={button} disabled={disabled || file.submodule} aria-label={`${stagedView ? "Unstage" : "Stage"} ${file.path}`} onClick={() => void git.mutate({ kind: stagedView ? "unstage" : "stage", paths: [file.path] })}>{stagedView ? "−" : "+"}</button>}
        {!file.conflicted && !stagedView && <button className={button} disabled={disabled || file.submodule} aria-label={`${untrackedView ? "Delete untracked" : "Discard changes"} ${file.path}`} onClick={() => {
          if (window.confirm(untrackedView ? `Permanently delete untracked file ${file.path}, including editor changes? This cannot be undone by Git.` : `Discard working-tree changes to ${file.path}, including editor edits? Staged content is retained.`)) void git.mutate({ kind: untrackedView ? "deleteUntracked" : "discard", path: file.path });
        }}>×</button>}
      </li>)}</ul>
    </details>;
  return <div className="flex h-full min-h-0 flex-col text-(--text)">
    <header className="border-b border-[var(--border-structural)] bg-[var(--surface-solid)] px-3 py-2 text-xs">
      {/* Row 1: Title + Action Icons Toolbar */}
      <div className="flex items-center justify-between gap-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--subtext1)]">Source Control</h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="flex size-6 items-center justify-center text-[var(--subtext0)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40"
            aria-label="Refresh Source Control"
            title="Refresh Source Control"
            disabled={git.loading || git.busy}
            onClick={() => void git.refresh()}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={git.loading || git.busy ? "animate-spin" : ""}>
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
              <path d="M16 16h5v5"/>
            </svg>
          </button>

          {remotes.length > 0 && (
            <>
              <button
                type="button"
                className="flex size-6 items-center justify-center text-[var(--subtext0)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40"
                aria-label="Pull (FF only)"
                title={targetBranch ? `Fast-forward pull from ${remote}/${targetBranch}` : "Pull (FF only)"}
                disabled={disabled || !targetBranch}
                onClick={() => {
                  if (targetBranch && window.confirm(`Fast-forward current branch from ${remote}/${targetBranch}? Your buffer will be saved first.`)) {
                    void git.mutate({ kind: "pull", remote, branch: targetBranch });
                  }
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M19 12l-7 7-7-7"/>
                </svg>
              </button>

              <button
                type="button"
                className="flex size-6 items-center justify-center text-[var(--subtext0)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40"
                aria-label="Push"
                title={targetBranch ? `Push to ${remote}/${targetBranch}` : "Push"}
                disabled={disabled || !targetBranch || !git.status?.head}
                onClick={() => {
                  if (targetBranch && window.confirm(`Push current HEAD to ${remote}/${targetBranch}${git.status?.upstream ? "" : " and set upstream"}?`)) {
                    void git.mutate({ kind: "push", remote, branch: targetBranch, setUpstream: !git.status?.upstream });
                  }
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7"/>
                </svg>
              </button>
            </>
          )}

          <button
            type="button"
            className={`flex size-6 items-center justify-center transition-colors disabled:opacity-40 ${
              creatingBranch ? "bg-[var(--surface1)] text-[var(--text)]" : "text-[var(--subtext0)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]"
            }`}
            aria-label="Create branch"
            title="Create branch"
            disabled={disabled || !git.status?.head}
            onClick={() => setCreatingBranch(!creatingBranch)}
          >
            <span className="sr-only">Create branch</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>

          {props.onOpenTerminal && (
            <button
              type="button"
              className="flex size-6 items-center justify-center text-[var(--subtext0)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors"
              aria-label="Open terminal"
              title="Open terminal"
              onClick={props.onOpenTerminal}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
            </button>
          )}

          {remotes.length > 0 && (
            <button
              type="button"
              className={`flex size-6 items-center justify-center transition-colors ${
                showMoreActions ? "bg-[var(--surface1)] text-[var(--text)]" : "text-[var(--subtext0)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]"
              }`}
              aria-label="More git actions"
              title="More actions (Remote, Fetch)"
              onClick={() => setShowMoreActions(!showMoreActions)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Branch Selector Pill + Upstream Ahead/Behind Status */}
      <div className="mt-1.5 flex items-center justify-between gap-1.5 min-w-0">
        <button
          type="button"
          onClick={props.onOpenBranchPicker}
          disabled={git.busy || !props.branchSnapshot}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 bg-[var(--surface0)]/60 hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-muted)] text-xs text-[var(--text)] transition-colors truncate"
          title={git.status ? (git.status.branch ?? "Detached HEAD") : "Repository unavailable"}
          aria-label={git.status ? `Current branch: ${git.status.branch ?? "Detached HEAD"}. Switch branch.` : "Switch branch"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--blue)]">
            <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
          <span className="font-mono font-medium truncate">
            {git.status ? (git.status.branch ?? `HEAD @ ${git.status.head?.slice(0, 7) ?? "unknown"}`) : (props.snapshot?.branch ?? "No repository")}
          </span>
          <span className="shrink-0 text-[10px] text-[var(--overlay1)] ml-auto">▾</span>
        </button>

        {git.status?.upstream && (git.status.ahead > 0 || git.status.behind > 0) && (
          <span className="shrink-0 flex items-center gap-1 font-mono text-[10px] px-1.5 py-1 bg-[var(--surface0)]/50 border border-[var(--border-subtle)] text-[var(--subtext1)]" title={git.status.upstream}>
            {git.status.ahead > 0 && <span className="text-[var(--blue)]">↑{git.status.ahead}</span>}
            {git.status.behind > 0 && <span className="text-[var(--yellow)]">↓{git.status.behind}</span>}
          </span>
        )}
      </div>

      {/* Row 3: Collapsible More Actions (Remote, Fetch) */}
      {showMoreActions && remotes.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
          <select
            aria-label="Git remote"
            value={remote}
            disabled={git.busy}
            onChange={(event) => setChosenRemote(event.target.value)}
            className="min-w-0 flex-1 bg-[var(--mantle)] border border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text)] outline-none"
          >
            {remotes.map((name) => <option key={name}>{name}</option>)}
          </select>
          <button
            type="button"
            className={button}
            disabled={git.busy || !props.transaction}
            onClick={() => void git.mutate({ kind: "fetch", remote })}
          >
            Fetch
          </button>
        </div>
      )}

      {/* Row 4: Collapsible Branch Creation */}
      {creatingBranch && (
        <form
          className="mt-2 flex flex-col gap-1.5 pt-1.5 border-t border-[var(--border-subtle)]"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await git.mutate({ kind: "createBranch", name: branchName, start: null })) {
              setBranchName("");
              setCreatingBranch(false);
            }
          }}
        >
          <div className="flex items-center gap-1">
            <input
              aria-label="New branch name"
              placeholder="Branch name…"
              value={branchName}
              disabled={git.busy}
              onChange={(event) => setBranchName(event.target.value)}
              className="min-w-0 flex-1 border border-[var(--border-muted)] bg-[var(--crust)] px-2 py-1 text-xs outline-none focus:border-[var(--border-active)]"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setCreatingBranch(false)}
              className="px-1.5 py-1 text-xs text-[var(--overlay1)] hover:text-[var(--text)]"
              title="Cancel"
            >
              ✕
            </button>
          </div>
          <button
            type="submit"
            className={`${button} w-full py-1 text-center font-medium bg-[var(--surface1)]`}
            disabled={disabled || !branchName.trim()}
          >
            Create from HEAD (stay here)
          </button>
        </form>
      )}
    </header>
    {props.workspacePath && (
      <div className="flex border-b border-[var(--border-structural)] bg-[var(--surface0)]/40 p-1 gap-1">
        <button
          className="flex-1 rounded-none px-2 py-1 text-xs font-medium text-[var(--subtext0)] transition-colors hover:text-[var(--text)] aria-pressed:bg-[var(--surface-solid)] aria-pressed:text-[var(--text)] aria-pressed:shadow-sm border border-transparent aria-pressed:border-[var(--border-subtle)]"
          aria-pressed={view === "changes"}
          onClick={() => setView("changes")}
        >
          Changes
        </button>
        <button
          className="flex-1 rounded-none px-2 py-1 text-xs font-medium text-[var(--subtext0)] transition-colors hover:text-[var(--text)] aria-pressed:bg-[var(--surface-solid)] aria-pressed:text-[var(--text)] aria-pressed:shadow-sm border border-transparent aria-pressed:border-[var(--border-subtle)]"
          aria-pressed={view === "graph"}
          onClick={() => { setHistoryPath(null); setView("graph"); }}
        >
          Git Graph
        </button>
        <button
          className="flex-1 rounded-none px-2 py-1 text-xs font-medium text-[var(--subtext0)] transition-colors hover:text-[var(--text)] aria-pressed:bg-[var(--surface-solid)] aria-pressed:text-[var(--text)] aria-pressed:shadow-sm border border-transparent aria-pressed:border-[var(--border-subtle)]"
          aria-pressed={view === "stashes"}
          onClick={() => setView("stashes")}
        >
          Stashes
        </button>
      </div>
    )}
    {view === "graph" && props.workspacePath ? <GitGraph key={`${props.workspacePath}:${historyPath ?? ""}`} root={props.workspacePath} initialFilePath={historyPath} /> : view === "stashes" && props.workspacePath ? <StashPanel root={props.workspacePath} revision={props.revision ?? 0} disabled={disabled} busy={git.busy} error={git.error} output={git.output} mutate={git.mutate} cancel={git.cancel} /> : <>
    {git.status && <div className="border-b border-(--border-subtle) p-2">
      <label className="sr-only" htmlFor="git-commit-message">Commit message</label>
      <textarea id="git-commit-message" value={message} onChange={(event) => setMessage(event.target.value)} disabled={git.busy} rows={3} placeholder="Message for staged changes" className="w-full resize-none rounded-none border border-(--border-muted) bg-(--crust) px-2 py-1.5 text-xs outline-none focus:border-(--border-active)" />
      <button className={`${button} mt-1 w-full border border-(--border-muted)`} disabled={commitDisabled || !staged.length || !message.trim()} onClick={async () => { if (await git.mutate({ kind: "commit", message })) setMessage(""); }}>{git.status?.operation === "merge" ? "Commit merge" : "Commit staged"} ({staged.length})</button>
      {!staged.length && <p className="mt-1 text-[11px] text-(--overlay1)">Stage files explicitly before committing.</p>}
    </div>}
    {(git.error ?? (!props.workspacePath ? props.error : null)) && <p role="alert" className="break-words px-3 py-2 text-xs text-(--red)">{git.error ?? props.error}</p>}
    {(git.loading || git.busy) && <p role="status" className="px-3 py-1 text-xs text-(--overlay1)">{git.busy ? "Git operation in progress…" : "Refreshing Git…"}{git.busy && <button className={button} onClick={() => void git.cancel()}>Cancel Git operation</button>}</p>}
    {git.status?.operation && <p role="status" className="px-3 py-2 text-xs text-(--yellow)">{git.status.operation.toUpperCase()} IN PROGRESS. Continue in the repository terminal.</p>}
    <div className="min-h-0 flex-1 overflow-auto">{git.status && (files.length ? <>{conflicts.length > 0 && section("Merge changes / conflicts", conflicts, false)}{section("Staged changes", staged, true)}{section("Changes", changed, false)}{section("Untracked", untracked, false, true)}</> : <p className="p-3 text-xs text-(--overlay1)">Working tree clean.</p>)}{!props.workspacePath && <p className="p-3 text-xs text-(--overlay1)">Open a repository root to inspect Source Control.</p>}</div>
    {git.diffLoading && <p role="status" className="p-2 text-xs">Loading diff…</p>}
    {git.diff && <GitDiffView diff={git.diff} onClose={git.closeDiff} />}
    {conflictPath && props.workspacePath && <ConflictEditor key={`${props.workspacePath}:${conflictPath}`} root={props.workspacePath} path={conflictPath} busy={git.busy} transaction={props.transaction} mutate={git.mutate} onClose={() => setConflictPath(null)} />}
    {git.output.length > 0 && <details className="max-h-32 overflow-auto border-t border-(--border-muted) text-xs"><summary className="px-3 py-2">Git output</summary><pre className="whitespace-pre-wrap break-words px-3 pb-2">{git.output.join("\n")}</pre></details>}
    </>}
  </div>;
}
