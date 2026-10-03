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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const visibleBranches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return branches;
    return branches.filter((branch) => branch.name.toLowerCase().includes(needle));
  }, [branches, query]);

  const grouped = useMemo(() => {
    const current = visibleBranches.filter((b) => b.isCurrent);
    const local = visibleBranches.filter((b) => !b.isCurrent && b.kind !== "remote");
    const remote = visibleBranches.filter((b) => b.kind === "remote");
    return [
      { key: "current", title: "Current", items: current },
      { key: "local", title: "Local", items: local },
      { key: "remote", title: "Remote", items: remote },
    ].filter((g) => g.items.length > 0);
  }, [visibleBranches]);

  const branchIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleBranches.forEach((branch, index) => {
      const key = branch.remoteRef ? `remote:${branch.remoteRef}` : `${branch.kind}:${branch.name}`;
      map.set(key, index);
    });
    return map;
  }, [visibleBranches]);

  useEffect(() => { setSelectedIndex(0); }, [query, open]);

  useEffect(() => {
    setSelectedIndex((cur) => {
      if (visibleBranches.length === 0) return 0;
      return Math.min(cur, visibleBranches.length - 1);
    });
  }, [visibleBranches]);

  // Scroll selected item into view safely
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected='true']");
    if (selected && typeof selected.scrollIntoView === "function") {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((cur) => visibleBranches.length === 0 ? 0 : Math.min(cur + 1, visibleBranches.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((cur) => Math.max(cur - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const branch = visibleBranches[selectedIndex];
        if (branch) onSelectBranch(branch);
      }
    };
    const handlePointerDown = (e: MouseEvent) => {
      if (!open || !containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open, onClose, onSelectBranch, selectedIndex, visibleBranches]);

  if (!open) return null;

  return (
    <div className="branch-picker-backdrop" aria-hidden="false">
      <div
        ref={containerRef}
        role="dialog"
        aria-label="Branch picker"
        aria-modal="true"
        className="branch-picker-panel"
      >
        {/* Header */}
        <div className="branch-picker-header">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          <span className="branch-picker-header-title">Switch Branch</span>
        </div>

        {/* Search */}
        <div className="branch-picker-search-wrap">
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            aria-label="Filter branches"
            placeholder="Search branches..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="branch-picker-input"
          />
        </div>

        {/* List */}
        <div ref={listRef} className="branch-picker-list">
          {grouped.length === 0 ? (
            <div className="branch-picker-empty">No branches match "{query}"</div>
          ) : grouped.map((group) => (
            <div key={group.key} className="branch-picker-group">
              <div className="branch-picker-group-label">{group.title}</div>
              {group.items.map((branch) => {
                const rowKey = branch.remoteRef ? `remote:${branch.remoteRef}` : `${branch.kind}:${branch.name}`;
                const index = branchIndexMap.get(rowKey) ?? -1;
                const isSelected = index === selectedIndex;
                const secondaryLabel = branch.remoteRef
                  ? branch.remoteName ?? branch.kind
                  : branch.kind;
                return (
                  <button
                    key={rowKey}
                    type="button"
                    data-selected={isSelected}
                    onClick={() => onSelectBranch(branch)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`branch-picker-item${isSelected ? " branch-picker-item--selected" : ""}${branch.isCurrent ? " branch-picker-item--current" : ""}`}
                  >
                    <span className="branch-picker-item-icon">
                      {branch.isCurrent ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
                        </svg>
                      )}
                    </span>
                    <span className="branch-picker-item-name">{branch.name}</span>
                    <span className="branch-picker-item-kind">{secondaryLabel}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="branch-picker-footer">
          <div className="branch-picker-footer-hints">
            <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
            <span><kbd>↵</kbd> switch</span>
            <span><kbd>Esc</kbd> close</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="branch-picker-close-btn"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
