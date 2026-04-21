import { useEffect, useMemo, useState } from "react";
import type { WorkspaceGitChangedFileSummary } from "../../lib/ipc/types";

const MAX_VISIBLE_FILES = 5;

function statusLabel(status: string): string {
  // Git status codes are positional: first char = index (staging area),
  // second char = worktree. Do not trim — preserve positional meaning.
  if (status.startsWith("??")) return "U";
  const indexChar = status[0] ?? " ";
  const worktreeChar = status[1] ?? " ";
  if (indexChar !== " " && indexChar !== "?") return "S";
  if (worktreeChar !== " " && worktreeChar !== "?") return "M";
  return "M";
}

function statusTitle(label: string): string {
  switch (label) {
    case "U": return "untracked";
    case "S": return "staged";
    default: return "modified";
  }
}

type BranchSwitchDialogProps = {
  open: boolean;
  targetBranch: string;
  changedFiles: WorkspaceGitChangedFileSummary[];
  onConfirm: (payload: { action: "commit" | "stash" | "discard"; commitMessage?: string }) => void;
  onCancel: () => void;
};

export default function BranchSwitchDialog({ open, targetBranch, changedFiles, onConfirm, onCancel }: BranchSwitchDialogProps) {
  const [action, setAction] = useState<"commit" | "stash" | "discard">("stash");
  const [commitMessage, setCommitMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    setAction("stash");
    setCommitMessage("");
  }, [open]);

  const canConfirm = useMemo(() => action !== "commit" || commitMessage.trim().length > 0, [action, commitMessage]);

  const visibleFiles = changedFiles.slice(0, MAX_VISIBLE_FILES);
  const hiddenCount = changedFiles.length - visibleFiles.length;

  if (!open) return null;

  return (
    <div role="dialog" aria-label="Branch switch confirmation" className="rounded-lg border border-[var(--border-muted)] bg-[var(--mantle)] p-4 shadow-[var(--panel-shadow)]">
      <h3 className="text-sm font-semibold text-[var(--text)]">Switch to {targetBranch}</h3>
      <p className="mt-2 text-sm text-[var(--subtext0)]">You have uncommitted changes that must be handled before switching.</p>

      {changedFiles.length > 0 && (
        <div className="mt-3 rounded border border-[var(--border-subtle)] bg-[var(--crust)] px-2 py-1.5" aria-label="Changed files summary">
          <ul className="space-y-0.5">
            {visibleFiles.map((file) => {
              const badge = statusLabel(file.status);
              const title = statusTitle(badge);
              return (
                <li key={file.path} className="flex items-center gap-2 text-[12px]">
                  <span
                    className={
                      badge === "U"
                        ? "font-bold text-[var(--decoration-untracked)]"
                        : badge === "S"
                          ? "font-bold text-[var(--decoration-staged)]"
                          : "font-bold text-[var(--decoration-modified)]"
                    }
                    title={title}
                  >
                    {badge}
                  </span>
                  <span className="truncate text-[var(--subtext0)]">{file.path}</span>
                </li>
              );
            })}
          </ul>
          {hiddenCount > 0 && (
            <p className="mt-1 text-[11px] text-[var(--overlay1)]">+{hiddenCount} more file{hiddenCount !== 1 ? "s" : ""}</p>
          )}
        </div>
      )}

      <div className="mt-3 space-y-2">
        <button type="button" onClick={() => setAction("commit")}>Commit changes</button>
        <button type="button" onClick={() => setAction("stash")}>Stash changes</button>
        <button type="button" onClick={() => setAction("discard")}>Discard changes</button>
      </div>
      {action === "commit" && (
        <input
          aria-label="Commit message"
          value={commitMessage}
          onChange={(event) => setCommitMessage(event.target.value)}
          className="mt-3 h-9 w-full rounded-md border border-[var(--border-muted)] bg-[var(--crust)] px-3 text-sm text-[var(--text)]"
        />
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" disabled={!canConfirm} aria-label="Confirm branch switch" onClick={() => onConfirm({ action, commitMessage })}>Confirm</button>
      </div>
    </div>
  );
}
