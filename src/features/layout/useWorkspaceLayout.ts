import { useCallback, useEffect, useMemo, useState } from "react";

export type DockMode = "bottom" | "right";

export type WorkspaceSplitSizes = {
  left: number;
  terminal: number;
};

type StoredWorkspaceLayout = {
  dockMode?: DockMode;
  splitSizes?: Partial<WorkspaceSplitSizes>;
};

export const DEFAULT_WORKSPACE_LAYOUT = {
  dockMode: "bottom" as DockMode,
  splitSizes: {
    left: 240,
    terminal: 320,
  },
};

function defaultWorkspaceLayout() {
  return {
    dockMode: DEFAULT_WORKSPACE_LAYOUT.dockMode,
    splitSizes: { ...DEFAULT_WORKSPACE_LAYOUT.splitSizes },
  };
}

function storageKeyForWorkspace(workspacePath: string | null): string {
  return workspacePath ? `layout:${workspacePath}` : "layout:default";
}

function isDockMode(value: unknown): value is DockMode {
  return value === "bottom" || value === "right";
}

function readStoredLayout(storageKey: string): {
  dockMode: DockMode;
  splitSizes: WorkspaceSplitSizes;
} {
  if (typeof window === "undefined") {
    return defaultWorkspaceLayout();
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return defaultWorkspaceLayout();
  }

  try {
    const parsed = JSON.parse(raw) as StoredWorkspaceLayout;
    return {
      dockMode: isDockMode(parsed.dockMode)
        ? parsed.dockMode
        : DEFAULT_WORKSPACE_LAYOUT.dockMode,
      splitSizes: {
        left:
          typeof parsed.splitSizes?.left === "number"
            ? parsed.splitSizes.left
            : DEFAULT_WORKSPACE_LAYOUT.splitSizes.left,
        terminal:
          typeof parsed.splitSizes?.terminal === "number"
            ? parsed.splitSizes.terminal
            : DEFAULT_WORKSPACE_LAYOUT.splitSizes.terminal,
      },
    };
  } catch {
    return defaultWorkspaceLayout();
  }
}

function persistLayout(
  storageKey: string,
  dockMode: DockMode,
  splitSizes: WorkspaceSplitSizes
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify({ dockMode, splitSizes }));
}

export function useWorkspaceLayout(workspacePath: string | null) {
  const storageKey = useMemo(() => storageKeyForWorkspace(workspacePath), [workspacePath]);
  const [dockMode, setDockModeState] = useState<DockMode>(() => {
    return readStoredLayout(storageKey).dockMode;
  });
  const [splitSizes, setSplitSizesState] = useState<WorkspaceSplitSizes>(() => {
    return readStoredLayout(storageKey).splitSizes;
  });

  useEffect(() => {
    const stored = readStoredLayout(storageKey);
    setDockModeState(stored.dockMode);
    setSplitSizesState(stored.splitSizes);
  }, [storageKey]);

  const setDockMode = useCallback(
    (nextDockMode: DockMode) => {
      setDockModeState(nextDockMode);
      setSplitSizesState((currentSizes) => {
        persistLayout(storageKey, nextDockMode, currentSizes);
        return currentSizes;
      });
    },
    [storageKey]
  );

  const setSplitSizes = useCallback(
    (nextSplitSizes: WorkspaceSplitSizes) => {
      setSplitSizesState(nextSplitSizes);
      setDockModeState((currentDockMode) => {
        persistLayout(storageKey, currentDockMode, nextSplitSizes);
        return currentDockMode;
      });
    },
    [storageKey]
  );

  const resetLayout = useCallback(() => {
    const defaults = defaultWorkspaceLayout();
    setDockModeState(defaults.dockMode);
    setSplitSizesState(defaults.splitSizes);
    persistLayout(storageKey, defaults.dockMode, defaults.splitSizes);
  }, [storageKey]);

  return {
    dockMode,
    setDockMode,
    splitSizes,
    setSplitSizes,
    resetLayout,
  };
}
