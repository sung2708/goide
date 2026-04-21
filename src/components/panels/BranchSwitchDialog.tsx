import { useMemo, useState } from "react";
import type { WorkspaceGitChangedFileSummary } from "../../lib/ipc/types";

type BranchSwitchDialogProps = {
  open: boolean;
  targetBranch: string;
  changedFiles: WorkspaceGitChangedFileSummary[];
  onConfirm: (payload: { action: "commit" | "stash" | "discard"; commitMessage?: string }) => void;
  onCancel: () => void;
};

export default function BranchSwitchDialog({ open, targetBranch, changedFiles: _changedFiles, onConfirm, onCancel }: BranchSwitchDialogProps) {
  const [action, setAction] = useState<"commit" | "stash" | "discard">("stash");
  const [commitMessage, setCommitMessage] = useState("");
  const canConfirm = useMemo(() => action !== "commit" || commitMessage.trim().length > 0, [action, commitMessage]);

  if (!open) return null;

  return (
    <div role="dialog" aria-label="Branch switch confirmation" className="rounded-lg border border-[var(--border-muted)] bg-[var(--mantle)] p-4 shadow-[var(--panel-shadow)]">
      <h3 className="text-sm font-semibold text-[var(--text)]">Switch to {targetBranch}</h3>
      <p className="mt-2 text-sm text-[var(--subtext0)]">You have uncommitted changes that must be handled before switching.</p>
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
