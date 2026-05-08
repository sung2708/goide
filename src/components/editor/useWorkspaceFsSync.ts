import { listen } from "@tauri-apps/api/event";
import { useEffect, type MutableRefObject } from "react";
import { startWorkspaceFsWatch } from "../../lib/ipc/client";
import { normalizeWorkspaceRoot } from "./editorShellUtils";

type UseWorkspaceFsSyncParams = {
  workspacePath: string | null;
  workspacePathRef: MutableRefObject<string | null>;
  onWorkspaceChanged: () => void;
};

export function useWorkspaceFsSync({
  workspacePath,
  workspacePathRef,
  onWorkspaceChanged,
}: UseWorkspaceFsSyncParams): void {
  useEffect(() => {
    if (!workspacePath) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    const expectedWorkspaceRoot = normalizeWorkspaceRoot(workspacePath);

    const setupWorkspaceFsSync = async () => {
      try {
        await startWorkspaceFsWatch(workspacePath);
      } catch (_error) {
        // Best-effort watch bootstrap; fallback behavior is backend-owned.
      }

      try {
        const dispose = await listen<{ workspaceRoot: string }>(
          "workspace-fs-changed",
          (event) => {
            const activeWorkspaceRoot = workspacePathRef.current;
            if (!activeWorkspaceRoot) {
              return;
            }
            const payloadRoot = normalizeWorkspaceRoot(event.payload.workspaceRoot);
            if (payloadRoot !== expectedWorkspaceRoot) {
              return;
            }
            if (payloadRoot !== normalizeWorkspaceRoot(activeWorkspaceRoot)) {
              return;
            }
            onWorkspaceChanged();
          }
        );
        if (disposed) {
          dispose();
          return;
        }
        unlisten = dispose;
      } catch (_error) {
        // Event listener setup failed - Explorer remains refreshable manually.
      }
    };

    void setupWorkspaceFsSync();
    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [onWorkspaceChanged, workspacePath, workspacePathRef]);
}
