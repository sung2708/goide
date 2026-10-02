import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, type MutableRefObject } from "react";
import { startWorkspaceFsWatch, stopWorkspaceFsWatch } from "../../lib/ipc/client";
import { normalizeWorkspaceRoot } from "./editorShellUtils";

type UseWorkspaceFsSyncParams = {
  workspacePath: string | null;
  workspacePathRef: MutableRefObject<string | null>;
  onWorkspaceChanged: () => void;
  onSyncError: (message: string | null) => void;
};

export function useWorkspaceFsSync({
  workspacePath,
  workspacePathRef,
  onWorkspaceChanged,
  onSyncError,
}: UseWorkspaceFsSyncParams): void {
  const lifecycle = useRef<Promise<void>>(Promise.resolve());
  const callbacks = useRef({ onWorkspaceChanged, onSyncError });
  useEffect(() => {
    callbacks.current = { onWorkspaceChanged, onSyncError };
  }, [onWorkspaceChanged, onSyncError]);

  useEffect(() => {
    if (!workspacePath) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    let watchId: string | null = null;
    const requestedWorkspaceRoot = normalizeWorkspaceRoot(workspacePath);
    let expectedWorkspaceRoot = requestedWorkspaceRoot;

    const stopWatch = async () => {
      if (!watchId) return;
      const id = watchId;
      watchId = null;
      const response = await stopWorkspaceFsWatch(id);
      if (!response.ok) {
        throw new Error(response.error?.message ?? "Unable to stop filesystem sync.");
      }
    };

    const enqueue = (operation: () => Promise<void>) => {
      lifecycle.current = lifecycle.current.then(operation).catch((error: unknown) => {
        callbacks.current.onSyncError(`Filesystem sync for ${workspacePath} failed: ${error instanceof Error ? error.message : String(error)} Use Explorer refresh.`);
      });
    };

    const setupWorkspaceFsSync = async () => {
      if (disposed) return;
      try {
        const dispose = await listen<{ workspaceRoot: string }>(
          "workspace-fs-changed",
          (event) => {
            if (disposed) return;
            const activeWorkspaceRoot = workspacePathRef.current;
            if (!activeWorkspaceRoot) {
              return;
            }
            const payloadRoot = normalizeWorkspaceRoot(event.payload.workspaceRoot);
            if (payloadRoot !== expectedWorkspaceRoot) {
              return;
            }
            if (requestedWorkspaceRoot !== normalizeWorkspaceRoot(activeWorkspaceRoot)) {
              return;
            }
            callbacks.current.onWorkspaceChanged();
          }
        );
        if (disposed) {
          dispose();
          return;
        }
        unlisten = dispose;
        const response = await startWorkspaceFsWatch(workspacePath);
        if (!response.ok || !response.data?.watchId) {
          throw new Error(response.error?.message ?? "Unable to start filesystem sync.");
        }
        watchId = response.data.watchId;
        expectedWorkspaceRoot = normalizeWorkspaceRoot(response.data.workspaceRoot);
        if (disposed) {
          unlisten?.();
          unlisten = null;
          await stopWatch();
          return;
        }
        callbacks.current.onSyncError(null);
      } catch (error) {
        unlisten?.();
        unlisten = null;
        throw error;
      }
    };

    enqueue(setupWorkspaceFsSync);
    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      enqueue(stopWatch);
    };
  }, [workspacePath, workspacePathRef]);
}
