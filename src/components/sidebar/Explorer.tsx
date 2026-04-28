import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FsEntry } from "../../lib/ipc/types";
import {
  createWorkspaceFile,
  createWorkspaceFolder,
  deleteWorkspaceEntry,
  listWorkspaceEntries,
  moveWorkspaceEntry,
  renameWorkspaceEntry,
} from "../../lib/ipc/client";
import { FileIcon, FolderIconComponent } from "./FileIcon";
import { cn } from "../../lib/utils/cn";

const IGNORED_FOLDERS = new Set([
  ".git",
  "node_modules",
  "dist",
  "target",
  ".turbo",
  ".cache",
]);

export type FileDecoration = {
  gitStatus?: "untracked" | "modified" | "staged" | null;
  hasErrors?: boolean;
  hasWarnings?: boolean;
};

type ExplorerProps = {
  workspacePath: string | null;
  activeFilePath: string | null;
  onOpenFile: (relativePath: string) => void;
  onEntryPathChanged?: (previousPath: string, nextPath: string, isDir: boolean) => void;
  onEntryDeleted?: (deletedPath: string, isDir: boolean) => void;
  fileDecorations?: Map<string, FileDecoration>;
  /** Incrementing this value from outside forces the tree to reload from disk. */
  explorerRevision?: number;
};

type EntryState = {
  entries: FsEntry[];
  loading: boolean;
  error: string | null;
};

type FlatTreeItem = {
  entry: FsEntry;
  depth: number;
  parentPath: string | null;
};

type ContextMenuState = {
  x: number;
  y: number;
  targetPath: string | null;
} | null;

type RenameState = {
  path: string;
  value: string;
};

type CreateState = {
  kind: "file" | "folder";
  value: string;
  parentPath: string | null;
};

const emptyState: EntryState = {
  entries: [],
  loading: false,
  error: null,
};

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function remapPath(currentPath: string, oldBasePath: string, newBasePath: string): string {
  const current = normalizePath(currentPath);
  const oldBase = normalizePath(oldBasePath);
  const newBase = normalizePath(newBasePath);
  if (current === oldBase) {
    return newBase;
  }
  if (current.startsWith(`${oldBase}/`)) {
    return `${newBase}${current.slice(oldBase.length)}`;
  }
  return current;
}

function basename(path: string): string {
  const normalized = normalizePath(path);
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function isDescendantPath(path: string, maybeAncestor: string): boolean {
  const normalized = normalizePath(path);
  const ancestor = normalizePath(maybeAncestor);
  return normalized === ancestor || normalized.startsWith(`${ancestor}/`);
}

function getParentPath(path: string): string | null {
  const normalized = normalizePath(path);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return null;
  }
  segments.pop();
  return segments.join("/");
}

function toSortedVisibleEntries(entries: FsEntry[]): FsEntry[] {
  return [...entries]
    .filter((entry) => !IGNORED_FOLDERS.has(entry.name))
    .sort((left, right) => {
      if (left.isDir !== right.isDir) {
        return left.isDir ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}

/* ─── Decoration dot helpers ─── */
const DECORATION_DOT_CLASS = "inline-block size-[6px] shrink-0 rounded-full";

function gitStatusTextClass(gitStatus: string | null | undefined, isSelected: boolean): string {
  if (isSelected) return "";
  switch (gitStatus) {
    case "untracked": return "text-[var(--decoration-untracked)]";
    case "modified": return "text-[var(--decoration-modified)]";
    case "staged": return "text-[var(--decoration-staged)]";
    default: return "";
  }
}

function gitStatusLabel(gitStatus: string | null | undefined): string | null {
  switch (gitStatus) {
    case "untracked": return "U";
    case "modified": return "M";
    case "staged": return "S";
    default: return null;
  }
}

/* ─── Memoized TreeRow ─── */
type TreeRowProps = {
  entry: FsEntry;
  depth: number;
  isSelected: boolean;
  isActive: boolean;
  isExpanded: boolean;
  isRenameTarget: boolean;
  renameValue: string;
  isDropTarget: boolean;
  draggingPath: string | null;
  decoration: FileDecoration | undefined;
  rowRef: (element: HTMLDivElement | null) => void;
  onClick: (entryPath: string, isDir: boolean) => void;
  onContextMenu: (entryPath: string, x: number, y: number) => void;
  onDragStart: (entryPath: string) => void;
  onDragEnd: () => void;
  onDragOver: (entryPath: string) => void;
  onDragLeave: (entryPath: string) => void;
  onDrop: (entryPath: string, sourcePath: string) => void;
  onChevronClick: (entryPath: string) => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: (entry: FsEntry) => void;
  onRenameCancel: () => void;
};

const TreeRow = memo(function TreeRow({
  entry, depth, isSelected, isActive, isExpanded, isRenameTarget, renameValue,
  isDropTarget, draggingPath, decoration, rowRef,
  onClick, onContextMenu, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  onChevronClick, onRenameChange, onRenameCommit, onRenameCancel,
}: TreeRowProps) {
  const rowPaddingLeft = `${depth * 12 + 8}px`;
  const gitText = gitStatusTextClass(decoration?.gitStatus, isSelected);
  const gitBadge = gitStatusLabel(decoration?.gitStatus);

  return (
    <div
      ref={rowRef}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={entry.isDir ? isExpanded : undefined}
      tabIndex={-1}
      draggable
      onDragStart={(event) => {
        onDragStart(entry.path);
        event.dataTransfer.setData("text/plain", entry.path);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!entry.isDir || !draggingPath || draggingPath === entry.path) return;
        event.preventDefault();
        onDragOver(entry.path);
        event.dataTransfer.dropEffect = "move";
      }}
      onDragLeave={() => onDragLeave(entry.path)}
      onDrop={(event) => {
        event.preventDefault();
        const sourcePath = event.dataTransfer.getData("text/plain") || draggingPath;
        if (!sourcePath || !entry.isDir) return;
        onDrop(entry.path, sourcePath);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(entry.path, event.clientX, event.clientY);
      }}
      onClick={() => onClick(entry.path, entry.isDir)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick(entry.path, entry.isDir);
        }
      }}
      title={entry.path}
      className={cn(
        "group flex w-full items-center gap-1.5 rounded px-2 py-[5px] text-left text-[13px] transition-colors duration-75",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--blue)]",
        isSelected
          ? "bg-[var(--selection-bg)] text-[var(--text)]"
          : "text-[var(--subtext0)] hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]",
        isActive && !isSelected && "bg-[rgba(166,209,137,0.08)] text-[var(--text)]",
        isDropTarget && "ring-1 ring-[var(--blue)]"
      )}
      style={{ paddingLeft: rowPaddingLeft }}
    >
      <span className="flex w-4 shrink-0 items-center justify-center">
        {entry.isDir ? (
          <button
            type="button"
            className="flex size-4 items-center justify-center rounded text-[10px] text-[var(--overlay1)] hover:bg-[var(--bg-hover)]"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onChevronClick(entry.path);
            }}
            title={isExpanded ? "Collapse folder" : "Expand folder"}
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : null}
      </span>
      <span className="flex size-4 shrink-0 items-center justify-center">
        {entry.isDir ? (
          <FolderIconComponent isOpen={isExpanded} size={14} />
        ) : (
          <FileIcon fileName={entry.name} size={14} />
        )}
      </span>
      {isRenameTarget ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(event) => onRenameChange(event.target.value)}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); onRenameCommit(entry); }
            if (event.key === "Escape") { event.preventDefault(); onRenameCancel(); }
          }}
          onBlur={() => onRenameCommit(entry)}
          className="w-full rounded border border-[var(--surface1)] bg-[var(--crust)] px-1.5 py-0.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--border-active)]"
        />
      ) : (
        <span className={cn("truncate", gitText)}>{entry.name}</span>
      )}
      {!isRenameTarget && (decoration?.hasErrors || decoration?.hasWarnings || decoration?.gitStatus) && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
          {decoration?.hasErrors ? (
            <span className={cn(DECORATION_DOT_CLASS, "bg-[var(--decoration-error)]")} title="Error" />
          ) : decoration?.hasWarnings ? (
            <span className={cn(DECORATION_DOT_CLASS, "bg-[var(--decoration-warning)]")} title="Warning" />
          ) : decoration?.gitStatus ? (
            <span 
              className={cn(
                DECORATION_DOT_CLASS,
                decoration.gitStatus === "untracked" && "bg-[var(--decoration-untracked)]",
                decoration.gitStatus === "modified" && "bg-[var(--decoration-modified)]",
                decoration.gitStatus === "staged" && "bg-[var(--decoration-staged)]",
              )} 
              title={decoration.gitStatus} 
            />
          ) : null}
          {gitBadge && (
            <span
              className={cn(
                "text-[10px] font-bold leading-none opacity-80",
                decoration?.gitStatus === "untracked" && "text-[var(--decoration-untracked)]",
                decoration?.gitStatus === "modified" && "text-[var(--decoration-modified)]",
                decoration?.gitStatus === "staged" && "text-[var(--decoration-staged)]",
              )}
              title={decoration?.gitStatus ?? ""}
            >
              {gitBadge}
            </span>
          )}
        </span>
      )}
    </div>
  );
});

function Explorer({
  workspacePath,
  activeFilePath,
  onOpenFile,
  onEntryPathChanged,
  onEntryDeleted,
  fileDecorations,
  explorerRevision = 0,
}: ExplorerProps) {
  const [rootState, setRootState] = useState<EntryState>(emptyState);
  const [childrenByPath, setChildrenByPath] = useState<Record<string, EntryState>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [internalTreeRevision, setInternalTreeRevision] = useState(0);
  const treeRevision = internalTreeRevision + explorerRevision;
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);
  const [createState, setCreateState] = useState<CreateState | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const workspacePathRef = useRef(workspacePath);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const typeAheadRef = useRef<{ query: string; resetTimer: number | null }>({
    query: "",
    resetTimer: null,
  });
  workspacePathRef.current = workspacePath;

  const loadDirectory = useCallback(
    async (targetPath: string | null): Promise<EntryState> => {
      if (!workspacePath) {
        return emptyState;
      }
      const response = await listWorkspaceEntries(workspacePath, targetPath ?? undefined);
      if (!response.ok || !response.data) {
        return {
          entries: [],
          loading: false,
          error: response.error?.message ?? "Unable to load directory",
        };
      }
      return {
        entries: toSortedVisibleEntries(response.data),
        loading: false,
        error: null,
      };
    },
    [workspacePath]
  );

  const resetTree = useCallback(() => {
    setRootState(emptyState);
    setChildrenByPath({});
    setExpanded(new Set());
    setSelectedPath(null);
    setContextMenu(null);
    setRenameState(null);
    setCreateState(null);
    setOperationError(null);
  }, []);

  const refreshTree = useCallback(() => {
    setInternalTreeRevision((prev) => prev + 1);
  }, []);

  const hydrateExpandedPaths = useCallback(
    async (expandedPaths: string[]) => {
      if (!workspacePath || expandedPaths.length === 0) {
        return;
      }
      const nextChildren: Record<string, EntryState> = {};
      const invalidPaths = new Set<string>();
      const sorted = [...expandedPaths].sort(
        (left, right) => left.split("/").length - right.split("/").length
      );
      for (const path of sorted) {
        const state = await loadDirectory(path);
        if (state.error) {
          invalidPaths.add(path);
          continue;
        }
        nextChildren[path] = state;
      }
      setChildrenByPath((prev) => ({ ...prev, ...nextChildren }));
      if (invalidPaths.size > 0) {
        setExpanded((prev) => {
          const next = new Set(prev);
          for (const path of invalidPaths) {
            next.delete(path);
          }
          return next;
        });
      }
    },
    [loadDirectory, workspacePath]
  );

  // Track expanded paths in a ref so the root-load effect doesn't re-run on every expand/collapse
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  useEffect(() => {
    if (!workspacePath) {
      resetTree();
      return;
    }

    let canceled = false;
    const currentExpanded = [...expandedRef.current];

    const loadRoot = async () => {
      setRootState({ entries: [], loading: true, error: null });
      const nextRootState = await loadDirectory(null);
      if (canceled) {
        return;
      }
      setRootState(nextRootState);
      if (!nextRootState.error) {
        await hydrateExpandedPaths(currentExpanded);
      }
    };

    void loadRoot();
    return () => {
      canceled = true;
    };
    // NOTE: `expanded` intentionally excluded — folder toggle must NOT reload root.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateExpandedPaths, loadDirectory, resetTree, treeRevision, workspacePath]);

  useEffect(() => {
    if (!activeFilePath) {
      return;
    }
    setSelectedPath(activeFilePath);
  }, [activeFilePath]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const handleGlobalPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && menuRef.current.contains(target)) {
        return;
      }
      setContextMenu(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handleGlobalPointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleGlobalPointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  const flatItems = useMemo<FlatTreeItem[]>(() => {
    const result: FlatTreeItem[] = [];
    const walk = (entries: FsEntry[], depth: number, parentPath: string | null) => {
      for (const entry of entries) {
        result.push({ entry, depth, parentPath });
        if (entry.isDir && expanded.has(entry.path)) {
          const childEntries = childrenByPath[entry.path]?.entries ?? [];
          walk(childEntries, depth + 1, entry.path);
        }
      }
    };
    walk(rootState.entries, 0, null);
    return result;
  }, [childrenByPath, expanded, rootState.entries]);

  const itemByPath = useMemo(() => {
    const map = new Map<string, FlatTreeItem>();
    for (const item of flatItems) {
      map.set(item.entry.path, item);
    }
    return map;
  }, [flatItems]);

  const selectPath = useCallback((path: string | null) => {
    setSelectedPath(path);
    if (path) {
      const row = rowRefs.current[path];
      row?.focus();
    }
  }, []);

  const toggleDirectory = useCallback(
    async (path: string) => {
      if (!workspacePath) {
        return;
      }

      if (expanded.has(path)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        return;
      }

      setExpanded((prev) => new Set(prev).add(path));
      if (childrenByPath[path]?.entries.length) {
        return;
      }

      setChildrenByPath((prev) => ({
        ...prev,
        [path]: { entries: [], loading: true, error: null },
      }));
      const state = await loadDirectory(path);
      setChildrenByPath((prev) => ({
        ...prev,
        [path]: state,
      }));
    },
    [childrenByPath, expanded, loadDirectory, workspacePath]
  );

  const refreshParentDirectory = useCallback(
    async (childPath: string) => {
      const parentPath = getParentPath(childPath);
      const state = await loadDirectory(parentPath);
      if (parentPath === null) {
        setRootState(state);
      } else {
        setChildrenByPath((prev) => ({ ...prev, [parentPath]: state }));
      }
    },
    [loadDirectory]
  );

  const runMutation = useCallback(
    async <T,>(operation: () => Promise<{ ok: boolean; data?: T; error?: { message: string } }>, affectedPath?: string) => {
      setOperationError(null);
      const response = await operation();
      if (!response.ok) {
        setOperationError(response.error?.message ?? "Operation failed");
        return null;
      }
      if (affectedPath) {
        await refreshParentDirectory(affectedPath);
      } else {
        refreshTree();
      }
      return response.data ?? null;
    },
    [refreshParentDirectory, refreshTree]
  );

  const remapTreePaths = useCallback((previousPath: string, nextPath: string) => {
    setExpanded((prev) => {
      const next = new Set<string>();
      for (const path of prev) {
        next.add(remapPath(path, previousPath, nextPath));
      }
      return next;
    });
    setSelectedPath((prev) => (prev ? remapPath(prev, previousPath, nextPath) : prev));
  }, []);

  const commitRename = useCallback(
    async (entry: FsEntry) => {
      if (!workspacePath || !renameState) {
        return;
      }
      const trimmed = renameState.value.trim();
      if (!trimmed || trimmed === entry.name) {
        setRenameState(null);
        return;
      }

      const nextPath = await runMutation(() =>
        renameWorkspaceEntry(workspacePath, entry.path, trimmed),
        entry.path
      );
      if (!nextPath) {
        return;
      }

      remapTreePaths(entry.path, nextPath);
      onEntryPathChanged?.(entry.path, nextPath, entry.isDir);
      setRenameState(null);
    },
    [onEntryPathChanged, remapTreePaths, renameState, runMutation, workspacePath]
  );

  const commitDelete = useCallback(
    async (entry: FsEntry) => {
      if (!workspacePath) {
        return;
      }
      const confirmed = window.confirm(
        `Delete ${entry.isDir ? "folder" : "file"} "${entry.path}"?`
      );
      if (!confirmed) {
        return;
      }
      const result = await runMutation(() => deleteWorkspaceEntry(workspacePath, entry.path), entry.path);
      if (result === null && result !== undefined) {
        return;
      }
      setExpanded((prev) => {
        const next = new Set<string>();
        for (const path of prev) {
          if (!isDescendantPath(path, entry.path)) {
            next.add(path);
          }
        }
        return next;
      });
      setSelectedPath((prev) =>
        prev && isDescendantPath(prev, entry.path) ? getParentPath(entry.path) : prev
      );
      onEntryDeleted?.(entry.path, entry.isDir);
    },
    [onEntryDeleted, runMutation, workspacePath]
  );

  const commitMove = useCallback(
    async (sourcePath: string, destinationFolderPath: string | null) => {
      if (!workspacePath) {
        return;
      }
      const sourceItem = itemByPath.get(sourcePath);
      if (!sourceItem) {
        return;
      }
      if (destinationFolderPath && destinationFolderPath === sourcePath) {
        return;
      }
      if (
        sourceItem.entry.isDir &&
        destinationFolderPath &&
        isDescendantPath(destinationFolderPath, sourcePath)
      ) {
        setOperationError("Cannot move a folder into itself.");
        return;
      }
      const destinationRelativePath = destinationFolderPath
        ? `${destinationFolderPath}/${basename(sourcePath)}`
        : basename(sourcePath);
      if (normalizePath(destinationRelativePath) === normalizePath(sourcePath)) {
        return;
      }

      const nextPath = await runMutation(() =>
        moveWorkspaceEntry(workspacePath, sourcePath, destinationRelativePath),
        sourcePath
      );
      if (!nextPath) {
        return;
      }

      remapTreePaths(sourcePath, nextPath);
      onEntryPathChanged?.(sourcePath, nextPath, sourceItem.entry.isDir);
    },
    [itemByPath, onEntryPathChanged, remapTreePaths, runMutation, workspacePath]
  );

  const startCreate = useCallback((kind: "file" | "folder", parentPath: string | null) => {
    const fallbackName = kind === "file" ? "new.go" : "new-folder";
    const defaultPath = parentPath ? `${parentPath}/${fallbackName}` : fallbackName;
    setCreateState({
      kind,
      value: defaultPath,
      parentPath,
    });
    setContextMenu(null);
  }, []);

  const submitCreate = useCallback(async () => {
    if (!workspacePath || !createState) {
      return;
    }
    const relativePath = createState.value.trim();
    if (!relativePath) {
      return;
    }
    const created = await runMutation(
      () =>
        createState.kind === "file"
          ? createWorkspaceFile(workspacePath, relativePath, "")
          : createWorkspaceFolder(workspacePath, relativePath),
      relativePath
    );
    if (created === null) {
      return;
    }
    setCreateState(null);
    selectPath(relativePath);
    if (createState.kind === "file") {
      onOpenFile(relativePath);
    }
  }, [createState, onOpenFile, runMutation, selectPath, workspacePath]);

  const openContextMenuForSelected = useCallback(() => {
    if (!selectedPath) {
      return;
    }
    const row = rowRefs.current[selectedPath];
    if (!row) {
      return;
    }
    const rect = row.getBoundingClientRect();
    setContextMenu({
      x: rect.left + 24,
      y: rect.top + 16,
      targetPath: selectedPath,
    });
  }, [selectedPath]);

  const handleTreeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (event.key === "Escape") {
        if (contextMenu) {
          event.preventDefault();
          setContextMenu(null);
          return;
        }
        if (renameState) {
          event.preventDefault();
          setRenameState(null);
          return;
        }
        if (createState) {
          event.preventDefault();
          setCreateState(null);
          return;
        }
      }

      if (renameState || createState) {
        return;
      }

      const selectedIndex = selectedPath
        ? flatItems.findIndex((item) => item.entry.path === selectedPath)
        : -1;
      const selectedItem = selectedIndex >= 0 ? flatItems[selectedIndex] : null;

      if (isMod && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (event.shiftKey) {
          startCreate("folder", selectedItem?.entry.isDir ? selectedItem.entry.path : selectedItem?.parentPath ?? null);
        } else {
          startCreate("file", selectedItem?.entry.isDir ? selectedItem.entry.path : selectedItem?.parentPath ?? null);
        }
        return;
      }

      if (event.key === "F2" && selectedItem) {
        event.preventDefault();
        setRenameState({
          path: selectedItem.entry.path,
          value: selectedItem.entry.name,
        });
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedItem) {
        event.preventDefault();
        void commitDelete(selectedItem.entry);
        return;
      }

      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        openContextMenuForSelected();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = Math.min(flatItems.length - 1, Math.max(0, selectedIndex + 1));
        const next = flatItems[nextIndex];
        if (next) {
          selectPath(next.entry.path);
        }
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        const nextIndex = Math.max(0, selectedIndex - 1);
        const next = flatItems[nextIndex];
        if (next) {
          selectPath(next.entry.path);
        }
        return;
      }

      if (event.key === "ArrowRight" && selectedItem) {
        event.preventDefault();
        if (selectedItem.entry.isDir) {
          if (!expanded.has(selectedItem.entry.path)) {
            void toggleDirectory(selectedItem.entry.path);
            return;
          }
          const firstChild = flatItems.find(
            (item) => item.parentPath === selectedItem.entry.path
          );
          if (firstChild) {
            selectPath(firstChild.entry.path);
          }
        }
        return;
      }

      if (event.key === "ArrowLeft" && selectedItem) {
        event.preventDefault();
        if (selectedItem.entry.isDir && expanded.has(selectedItem.entry.path)) {
          setExpanded((prev) => {
            const next = new Set(prev);
            next.delete(selectedItem.entry.path);
            return next;
          });
          return;
        }
        if (selectedItem.parentPath) {
          selectPath(selectedItem.parentPath);
        }
        return;
      }

      if (event.key === "Enter" && selectedItem) {
        event.preventDefault();
        if (selectedItem.entry.isDir) {
          void toggleDirectory(selectedItem.entry.path);
        } else {
          onOpenFile(selectedItem.entry.path);
        }
        return;
      }

      if (
        !isMod &&
        event.key.length === 1 &&
        /\S/.test(event.key) &&
        flatItems.length > 0
      ) {
        const now = Date.now();
        if (typeAheadRef.current.resetTimer) {
          window.clearTimeout(typeAheadRef.current.resetTimer);
        }
        typeAheadRef.current.query += event.key.toLowerCase();
        typeAheadRef.current.resetTimer = window.setTimeout(() => {
          typeAheadRef.current.query = "";
          typeAheadRef.current.resetTimer = null;
        }, 500);
        const query = typeAheadRef.current.query;
        const startIndex = Math.max(0, selectedIndex + 1);
        const reordered = [...flatItems.slice(startIndex), ...flatItems.slice(0, startIndex)];
        const match = reordered.find((item) =>
          item.entry.name.toLowerCase().startsWith(query)
        );
        if (match) {
          selectPath(match.entry.path);
        }
        void now;
      }
    },
    [
      commitDelete,
      contextMenu,
      createState,
      expanded,
      flatItems,
      onOpenFile,
      openContextMenuForSelected,
      renameState,
      selectPath,
      selectedPath,
      startCreate,
      toggleDirectory,
    ]
  );

  const activeContextTarget = contextMenu?.targetPath
    ? itemByPath.get(contextMenu.targetPath)?.entry ?? null
    : null;

  const renderContextMenu = () => {
    if (!contextMenu) {
      return null;
    }
    const target = activeContextTarget;
    const commonMenuItemClass =
      "w-full rounded px-2.5 py-1.5 text-left text-[13px] text-[var(--subtext1)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)] transition-colors duration-75";
    return (
      <div
        ref={menuRef}
        className="fixed z-50 min-w-[180px] rounded-lg border border-[var(--border-muted)] bg-[var(--mantle)] p-1 shadow-[var(--panel-shadow)]"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        role="menu"
      >
        {(target?.isDir || target === null) && (
          <>
            <button
              type="button"
              className={commonMenuItemClass}
              onClick={() => startCreate("file", target?.path ?? null)}
            >
              New File
            </button>
            <button
              type="button"
              className={commonMenuItemClass}
              onClick={() => startCreate("folder", target?.path ?? null)}
            >
              New Folder
            </button>
          </>
        )}
        {target && (
          <>
            <button
              type="button"
              className={commonMenuItemClass}
              onClick={() => {
                setRenameState({ path: target.path, value: target.name });
                setContextMenu(null);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className={commonMenuItemClass}
              onClick={() => {
                void commitDelete(target);
                setContextMenu(null);
              }}
            >
              Delete
            </button>
            <button
              type="button"
              className={commonMenuItemClass}
              onClick={async () => {
                await navigator.clipboard.writeText(target.path);
                setContextMenu(null);
              }}
            >
              Copy Path
            </button>
          </>
        )}
        <button
          type="button"
          className={commonMenuItemClass}
          onClick={() => {
            refreshTree();
            setContextMenu(null);
          }}
        >
          Refresh
        </button>
      </div>
    );
  };

  const handleRowClick = useCallback(
    (entryPath: string, isDir: boolean) => {
      selectPath(entryPath);
      setContextMenu(null);
      if (isDir) {
        void toggleDirectory(entryPath);
      } else {
        onOpenFile(entryPath);
      }
    },
    [onOpenFile, selectPath, toggleDirectory]
  );

  const handleRowContextMenu = useCallback(
    (entryPath: string, x: number, y: number) => {
      setSelectedPath(entryPath);
      setContextMenu({ x, y, targetPath: entryPath });
    },
    []
  );

  const handleRowDragStart = useCallback((entryPath: string) => {
    setDraggingPath(entryPath);
  }, []);

  const handleRowDragEnd = useCallback(() => {
    setDraggingPath(null);
    setDropTargetPath(null);
  }, []);

  const handleRowDragOver = useCallback((entryPath: string) => {
    setDropTargetPath(entryPath);
  }, []);

  const handleRowDragLeave = useCallback((entryPath: string) => {
    setDropTargetPath((prev) => (prev === entryPath ? null : prev));
  }, []);

  const handleRowDrop = useCallback(
    (entryPath: string, sourcePath: string) => {
      setDropTargetPath(null);
      setDraggingPath(null);
      void commitMove(sourcePath, entryPath);
    },
    [commitMove]
  );

  const handleChevronClick = useCallback(
    (entryPath: string) => {
      void toggleDirectory(entryPath);
    },
    [toggleDirectory]
  );

  const handleRenameChange = useCallback((value: string) => {
    setRenameState((prev) => (prev ? { ...prev, value } : prev));
  }, []);

  const handleRenameCancel = useCallback(() => {
    setRenameState(null);
  }, []);

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
  }, [rootState.error, rootState.loading, workspacePath]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="border-b border-[var(--border-muted)] bg-[var(--mantle)] px-3 py-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold uppercase text-[var(--overlay1)] text-balance">Explorer</p>
          {workspacePath && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[12px] text-[var(--subtext0)] hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)] transition-colors duration-75"
                onClick={() => startCreate("file", null)}
              >
                +File
              </button>
              <button
                type="button"
                className="rounded border border-[var(--border-subtle)] px-1.5 py-0.5 text-[12px] text-[var(--subtext0)] hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)] transition-colors duration-75"
                onClick={() => startCreate("folder", null)}
              >
                +Dir
              </button>
            </div>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={cn(
              "size-1.5 rounded-full",
              workspacePath ? "bg-[var(--green)]" : "bg-[var(--surface2)]"
            )}
          />
          <p className="text-[12px] text-[var(--subtext0)]">{headerMeta}</p>
        </div>
        {createState && (
          <div className="mt-2 flex items-center gap-1">
            <input
              autoFocus
              value={createState.value}
              onChange={(event) =>
                setCreateState((prev) =>
                  prev ? { ...prev, value: event.target.value } : prev
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitCreate();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCreateState(null);
                }
              }}
              className="flex-1 rounded border border-[var(--surface1)] bg-[var(--crust)] px-2 py-1 text-[13px] text-[var(--text)] outline-none focus:border-[var(--border-active)]"
              placeholder={
                createState.kind === "file" ? "new-file.go" : "new-folder"
              }
            />
            <button
              type="button"
              className="rounded border border-[rgba(166,209,137,0.3)] px-2 py-1 text-[12px] text-[var(--green)] hover:bg-[rgba(166,209,137,0.1)] transition-colors duration-75"
              onClick={() => void submitCreate()}
            >
              Create
            </button>
            <button
              type="button"
              className="rounded border border-[var(--border-subtle)] px-2 py-1 text-[12px] text-[var(--subtext0)] hover:bg-[var(--bg-hover)] transition-colors duration-75"
              onClick={() => setCreateState(null)}
            >
              Cancel
            </button>
          </div>
        )}
        {operationError && (
          <p className="mt-2 text-[12px] text-[var(--red)]">{operationError}</p>
        )}
      </div>

      <div
        ref={treeRef}
        tabIndex={0}
        role="tree"
        onKeyDown={handleTreeKeyDown}
        onContextMenu={(event) => {
          if (event.target === treeRef.current) {
            event.preventDefault();
            setContextMenu({
              x: event.clientX,
              y: event.clientY,
              targetPath: null,
            });
          }
        }}
        onDragOver={(event) => {
          if (!draggingPath) {
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          const sourcePath = event.dataTransfer.getData("text/plain") || draggingPath;
          setDropTargetPath(null);
          setDraggingPath(null);
          if (!sourcePath) {
            return;
          }
          void commitMove(sourcePath, null);
        }}
        className="flex-1 overflow-auto p-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--blue)]"
      >
        {!workspacePath && (
          <div className="px-2 py-2 text-[12px] text-[var(--overlay1)]">
            Open a workspace to browse files.
          </div>
        )}
        {workspacePath && rootState.loading && (
          <div className="px-2 py-2 text-[12px] text-[var(--overlay1)]">Loading…</div>
        )}
        {workspacePath && rootState.error && (
          <div className="px-2 py-2 text-[12px] text-[var(--red)]">{rootState.error}</div>
        )}
        {workspacePath && !rootState.loading && !rootState.error && flatItems.length === 0 && (
          <div className="px-2 py-2 text-[12px] text-[var(--overlay1)]">No files found.</div>
        )}
        {flatItems.map((item) => (
          <TreeRow
            key={item.entry.path}
            entry={item.entry}
            depth={item.depth}
            isSelected={item.entry.path === selectedPath}
            isActive={activeFilePath === item.entry.path}
            isExpanded={expanded.has(item.entry.path)}
            isRenameTarget={renameState?.path === item.entry.path}
            renameValue={renameState?.path === item.entry.path ? renameState.value : ""}
            isDropTarget={dropTargetPath === item.entry.path}
            draggingPath={draggingPath}
            decoration={fileDecorations?.get(item.entry.path)}
            rowRef={(element) => { rowRefs.current[item.entry.path] = element; }}
            onClick={handleRowClick}
            onContextMenu={handleRowContextMenu}
            onDragStart={handleRowDragStart}
            onDragEnd={handleRowDragEnd}
            onDragOver={handleRowDragOver}
            onDragLeave={handleRowDragLeave}
            onDrop={handleRowDrop}
            onChevronClick={handleChevronClick}
            onRenameChange={handleRenameChange}
            onRenameCommit={commitRename}
            onRenameCancel={handleRenameCancel}
          />
        ))}
      </div>

      {renderContextMenu()}
    </div>
  );
}

export default Explorer;
