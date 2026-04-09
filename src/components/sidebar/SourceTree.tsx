import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FsEntry } from "../../lib/ipc/types";
import { listWorkspaceEntries } from "../../lib/ipc/client";

const IGNORED_FOLDERS = new Set([
  ".git",
  "node_modules",
  "dist",
  "target",
  ".turbo",
  ".cache",
]);

type SourceTreeProps = {
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

function SourceTree({ workspacePath, activeFilePath, onOpenFile }: SourceTreeProps) {
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
    return entries.filter((entry) => !IGNORED_FOLDERS.has(entry.name));
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
      const padding = `${depth * 12 + 12}px`;
      const isActive = entry.path === activeFilePath;
      const state = childrenByPath[entry.path];
      const isExpanded = expanded.has(entry.path);

      return (
        <div key={entry.path}>
          <button
            type="button"
            onClick={() => {
              if (entry.isDir) {
                void toggleDirectory(entry);
              } else {
                onOpenFile(entry.path);
              }
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
              isActive ? "bg-[#313244] text-[#f5e0dc]" : "text-[#cdd6f4]"
            } hover:bg-[#2b2f3a]`}
            style={{ paddingLeft: padding }}
          >
            <span className="text-[11px] text-[#9399b2]">
              {entry.isDir ? (isExpanded ? "▾" : "▸") : "•"}
            </span>
            <span className="truncate">{entry.name}</span>
          </button>
          {entry.isDir && isExpanded && (
            <div>
              {state?.loading && (
                <div className="px-6 py-2 text-[11px] text-[#9399b2]">Loading…</div>
              )}
              {state?.error && (
                <div className="px-6 py-2 text-[11px] text-[#f38ba8]">
                  {state.error}
                </div>
              )}
              {state?.entries.map((child) => renderEntry(child, depth + 1))}
              {state && !state.loading && state.entries.length === 0 && !state.error && (
                <div className="px-6 py-2 text-[11px] text-[#6c7086]">Empty folder</div>
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
      <div className="border-b border-[#313244] px-4 py-3">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[#a6adc8]">
          Source Tree
        </p>
        <p className="mt-2 text-xs text-[#cdd6f4]">{headerMeta}</p>
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

export default SourceTree;
