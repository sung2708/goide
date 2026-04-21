import { useMemo } from "react";
import type { WorkspaceGitBranch } from "../../lib/ipc/types";

type BranchPickerProps = {
  open: boolean;
  currentBranch: string | null;
  branches: WorkspaceGitBranch[];
  query: string;
  onQueryChange: (value: string) => void;
  onSelectBranch: (branch: WorkspaceGitBranch) => void;
  onClose: () => void;
};

export default function BranchPicker({
  open,
  branches,
  query,
  onQueryChange,
  onSelectBranch,
  onClose,
}: BranchPickerProps) {
  const visibleBranches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return branches;
    return branches.filter((branch) => branch.name.toLowerCase().includes(needle));
  }, [branches, query]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Branch picker"
      className="rounded-lg border border-[var(--border-muted)] bg-[var(--mantle)] p-3 shadow-[var(--panel-shadow)]"
    >
      <input
        aria-label="Filter branches"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className="mb-3 h-9 w-full rounded-md border border-[var(--border-muted)] bg-[var(--crust)] px-3 text-sm text-[var(--text)]"
      />
      <div className="max-h-80 overflow-auto space-y-1">
        {visibleBranches.map((branch) => (
          <button
            key={`${branch.kind}:${branch.name}`}
            type="button"
            onClick={() => onSelectBranch(branch)}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-[var(--subtext1)] hover:bg-[var(--bg-hover)]"
          >
            <span>{branch.name}</span>
            <span className="text-xs uppercase text-[var(--overlay1)]">{branch.kind}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onClose} className="mt-3 text-xs text-[var(--overlay1)] hover:text-[var(--text)]">
        Close
      </button>
    </div>
  );
}
