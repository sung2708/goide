import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FsEntry } from "../../lib/ipc/types";
import { listWorkspaceEntries } from "../../lib/ipc/client";
import { FileIcon, FolderIconComponent } from "./FileIcon";

const IGNORED_FOLDERS = new Set([
  ".git",
  "node_modules",
  "dist",
  "target",
  ".turbo",
  ".cache",
]);

type ExplorerProps = {
  workspacePath: string | null;
  activeFilePath: string | null;
  onOpenFile: (relativePath: string) => void;
};

type EntryState = {
  entries: FsEntry[];
  loading: boolean;
  error: string | null;
};

const emptyState: EntryState = {
  entries: [],
  loading: false,
  error: null,
};

function Explorer({ workspacePath, activeFilePath, onOpenFile }: ExplorerProps) {
  const [rootState, setRootState] = useState<EntryState>(emptyState);
  const [childrenByPath, setChildrenByPath] = useState<Record<string, EntryState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const workspacePathRef = useRef(workspacePath);
  workspacePathRef.current = workspacePath;

  const resetTree = useCallback(() => {
    setRootState(emptyState);
    setChildrenByPath({});
    setExpanded(new Set());
  }, []);

  const filteredEntries = useCallback((entries: FsEntry[]) => {
    return entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    }).filter((entry) => !IGNORED_FOLDERS.has(entry.name));
  }, []);

  useEffect(() => {
    if (!workspacePath) {
      resetTree();
      return;
    }

    let canceled = false;

    const loadRoot = async () => {
      setRootState({ entries: [], loading: true, error: null });
      const response = await listWorkspaceEntries(workspacePath);
      if (canceled) {
        return;
      }
      if (!response.ok || !response.data) {
        setRootState({
          entries: [],
          loading: false,
          error: response.error?.message ?? "Unable to load workspace",
        });
        return;
      }
      setRootState({
        entries: filteredEntries(response.data),
        loading: false,
        error: null,
      });
    };

    loadRoot();

    return () => {
      canceled = true;
    };
  }, [filteredEntries, resetTree, workspacePath]);

  const toggleDirectory = useCallback(
    async (entry: FsEntry) => {
      if (!workspacePath) {
        return;
      }

      const startingPath = workspacePath;
      const next = new Set(expanded);
      if (next.has(entry.path)) {
        next.delete(entry.path);
        setExpanded(next);
        return;
      }

      next.add(entry.path);
      setExpanded(next);

      if (childrenByPath[entry.path]?.entries.length) {
        return;
      }

      setChildrenByPath((prev) => ({
        ...prev,
        [entry.path]: { entries: [], loading: true, error: null },
      }));

      const response = await listWorkspaceEntries(workspacePath, entry.path);

      // If the workspace changed while we were loading, ignore the result
      if (workspacePathRef.current !== startingPath) {
        return;
      }

      setChildrenByPath((prev) => ({
        ...prev,
        [entry.path]: {
          entries:
            response.ok && response.data ? filteredEntries(response.data) : [],
          loading: false,
          error: response.ok
            ? null
            : response.error?.message ?? "Unable to load folder",
        },
      }));
    },
    [childrenByPath, expanded, filteredEntries, workspacePath]
  );

  const renderEntry = useCallback(
    (entry: FsEntry, depth: number) => {
      const padding = `${depth * 12 + 16}px`;
      const isActive = entry.path === activeFilePath;
      const state = childrenByPath[entry.path];
      const isExpanded = expanded.has(entry.path);

      return (
        <div key={entry.path} className="animate-fade-in" style={{ animationDelay: `${depth * 0.05}s` }}>
          <button
            type="button"
            onClick={() => {
              if (entry.isDir) {
                void toggleDirectory(entry);
              } else {
                onOpenFile(entry.path);
              }
            }}
            title={entry.isDir ? `Expand or collapse ${entry.name}` : `Open ${entry.name}`}
            className={`group animate-reveal-right flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-all duration-300 ${
              isActive 
                ? "bg-[rgba(137,180,250,0.1)] text-[var(--blue)] shadow-[inset_2px_0_0_0_var(--blue)]" 
                : "text-[var(--subtext0)] hover:bg-[var(--surface0)] hover:text-[var(--text)]"
            }`}
            style={{ paddingLeft: padding, animationDelay: `${depth * 0.05}s` }}
          >
            <span className="flex items-center justify-center w-4 h-4 opacity-80 group-hover:opacity-100">
              {entry.isDir ? (
                <FolderIconComponent isOpen={isExpanded} size={14} />
              ) : (
                <FileIcon fileName={entry.name} size={14} />
              )}
            </span>
            <span className="truncate">{entry.name}</span>
          </button>
          {entry.isDir && isExpanded && (
            <div className="border-l border-[var(--surface0)] ml-[23px] opacity-80 hover:opacity-100 transition-opacity">
              {state?.loading && (
                <div className="px-6 py-1 text-[11px] text-[var(--overlay0)] italic">Loading…</div>
              )}
              {state?.error && (
                <div className="px-6 py-1 text-[11px] text-[var(--red)]">
                  {state.error}
                </div>
              )}
              {state?.entries.map((child) => renderEntry(child, depth + 1))}
              {state && !state.loading && state.entries.length === 0 && !state.error && (
                <div className="px-6 py-1 text-[11px] text-[var(--surface2)] italic">No items</div>
              )}
            </div>
          )}
        </div>
      );
    },
    [activeFilePath, childrenByPath, expanded, onOpenFile, toggleDirectory]
  );

  const headerMeta = useMemo(() => {
    if (!workspacePath) {
      return "Workspace Not Open";
    }
    if (rootState.loading) {
      return "Loading…";
    }
    if (rootState.error) {
      return "Load Failed";
    }
    return "Workspace Connected";
  }, [rootState, workspacePath]);

  return (
    <div className="flex h-full flex-col">
      <div className="beveled-edge border-b border-[var(--surface0)] bg-[var(--base)] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--overlay1)]">
          Explorer
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className={`h-1.5 w-1.5 rounded-full ${workspacePath ? "bg-[var(--blue)] animate-pulse" : "bg-[var(--surface2)]"}`}></span>
          <p className="text-[11px] font-semibold text-[var(--text)] tracking-tight">{headerMeta}</p>
        </div>
      </div>
      {!workspacePath && (
        <div className="flex flex-1 flex-col gap-3 px-4 py-4 text-xs text-[#9399b2]">
          <p>Open a workspace to browse files.</p>
        </div>
      )}
      {workspacePath && (
        <div className="flex-1 overflow-auto py-2">
          {rootState.loading && (
            <div className="px-4 py-2 text-[11px] text-[#9399b2]">Loading…</div>
          )}
          {rootState.error && (
            <div className="px-4 py-2 text-[11px] text-[#f38ba8]">
              {rootState.error}
            </div>
          )}
          {rootState.entries.map((entry) => renderEntry(entry, 0))}
          {!rootState.loading && !rootState.error && rootState.entries.length === 0 && (
            <div className="px-4 py-2 text-[11px] text-[#6c7086]">No files found.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default Explorer;
