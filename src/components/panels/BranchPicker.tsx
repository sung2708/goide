import { useEffect, useMemo, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const visibleBranches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return branches;
    return branches.filter((branch) => branch.name.toLowerCase().includes(needle));
  }, [branches, query]);
  const grouped = useMemo(() => {
    const current = visibleBranches.filter((branch) => branch.isCurrent);
    const local = visibleBranches.filter((branch) => !branch.isCurrent && branch.kind !== "remote");
    const remote = visibleBranches.filter((branch) => branch.kind === "remote");
    return [
      { key: "current", title: "Current", items: current },
      { key: "local", title: "Local", items: local },
      { key: "remote", title: "Remote", items: remote },
    ].filter((group) => group.items.length > 0);
  }, [visibleBranches]);
  const branchIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleBranches.forEach((branch, index) => {
      const key = branch.remoteRef ? `remote:${branch.remoteRef}` : `${branch.kind}:${branch.name}`;
      map.set(key, index);
    });
    return map;
  }, [visibleBranches]);

  if (!open) return null;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, open]);

  useEffect(() => {
    setSelectedIndex((current) => {
      if (visibleBranches.length === 0) return 0;
      return Math.min(current, visibleBranches.length - 1);
    });
  }, [visibleBranches]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) =>
          visibleBranches.length === 0 ? 0 : Math.min(current + 1, visibleBranches.length - 1)
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => Math.max(current - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const branch = visibleBranches[selectedIndex];
        if (branch) {
          onSelectBranch(branch);
        }
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [onClose, onSelectBranch, selectedIndex, visibleBranches]);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Branch picker"
      className="rounded-lg border border-[var(--border-muted)] bg-[var(--mantle)] p-3 shadow-[var(--panel-shadow)]"
    >
      <input
        aria-label="Filter branches"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        autoFocus
        className="mb-3 h-9 w-full rounded-md border border-[var(--border-muted)] bg-[var(--crust)] px-3 text-sm text-[var(--text)]"
      />
      <div className="max-h-80 overflow-auto space-y-1">
        {grouped.map((group) => (
          <div key={group.key}>
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--overlay1)]">
              {group.title}
            </p>
            {group.items.map((branch) => {
              const rowKey = branch.remoteRef
                ? `remote:${branch.remoteRef}`
                : `${branch.kind}:${branch.name}`;
              const index = branchIndexMap.get(rowKey) ?? -1;
              const secondaryLabel = branch.remoteRef
                ? branch.remoteName ?? branch.kind
                : branch.kind;
              return (
                <button
                  key={rowKey}
                  type="button"
                  onClick={() => onSelectBranch(branch)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-[var(--subtext1)] hover:bg-[var(--bg-hover)] ${
                    index === selectedIndex ? "bg-[var(--bg-hover)]" : ""
                  }`}
                >
                  <span>{branch.name}</span>
                  <span className="text-xs uppercase text-[var(--overlay1)]">{secondaryLabel}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <button type="button" onClick={onClose} className="mt-3 text-xs text-[var(--overlay1)] hover:text-[var(--text)]">
        Close
      </button>
    </div>
  );
}
