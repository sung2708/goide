import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type WorkspaceSplitSizes = {
  left: number;
  terminalBottom: number;
};

type StoredWorkspaceLayout = {
  splitSizes?: Partial<WorkspaceSplitSizes>;
};

export const DEFAULT_WORKSPACE_LAYOUT = {
  splitSizes: {
    left: 240,
    terminalBottom: 260,
  },
};

function defaultWorkspaceLayout() {
  return {
    splitSizes: { ...DEFAULT_WORKSPACE_LAYOUT.splitSizes },
  };
}

function storageKeyForWorkspace(workspacePath: string | null): string {
  return workspacePath ? `layout:${workspacePath}` : "layout:default";
}

function readStoredLayout(storageKey: string): {
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
      splitSizes: {
        left:
          typeof parsed.splitSizes?.left === "number"
            ? parsed.splitSizes.left
            : DEFAULT_WORKSPACE_LAYOUT.splitSizes.left,
        terminalBottom:
          typeof parsed.splitSizes?.terminalBottom === "number"
            ? parsed.splitSizes.terminalBottom
            : DEFAULT_WORKSPACE_LAYOUT.splitSizes.terminalBottom,
      },
    };
  } catch {
    return defaultWorkspaceLayout();
  }
}

function persistLayout(storageKey: string, splitSizes: WorkspaceSplitSizes) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify({ splitSizes }));
}

export function useWorkspaceLayout(workspacePath: string | null) {
  const storageKey = useMemo(() => storageKeyForWorkspace(workspacePath), [workspacePath]);
  const [splitSizes, setSplitSizesState] = useState<WorkspaceSplitSizes>(() => {
    return readStoredLayout(storageKey).splitSizes;
  });
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = readStoredLayout(storageKey);
    setSplitSizesState(stored.splitSizes);
  }, [storageKey]);

  useEffect(() => {
    if (persistTimerRef.current !== null) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      persistLayout(storageKey, splitSizes);
      persistTimerRef.current = null;
    }, 180);
    return () => {
      if (persistTimerRef.current !== null) {
        clearTimeout(persistTimerRef.current);
      }
      persistLayout(storageKey, splitSizes);
    };
  }, [splitSizes, storageKey]);

  const setSplitSizes = useCallback(
    (nextSplitSizes: WorkspaceSplitSizes) => {
      setSplitSizesState(nextSplitSizes);
    },
    []
  );

  const setTerminalSize = useCallback(
    (nextSize: number) => {
      setSplitSizesState((currentSizes) => ({ ...currentSizes, terminalBottom: nextSize }));
    },
    []
  );

  const resetLayout = useCallback(() => {
    const defaults = defaultWorkspaceLayout();
    setSplitSizesState(defaults.splitSizes);
    persistLayout(storageKey, defaults.splitSizes);
  }, [storageKey]);

  return {
    splitSizes,
    setSplitSizes,
    terminalSize: splitSizes.terminalBottom,
    setTerminalSize,
    resetLayout,
  };
}
