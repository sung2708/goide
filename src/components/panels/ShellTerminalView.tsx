import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Terminal } from "@xterm/xterm";
import {
  disposeShellSession,
  ensureShellSession,
  writeShellInput,
  resizeShellSession,
} from "../../lib/ipc/client";
import type { ShellOutputPayload } from "../../lib/ipc/types";
import TerminalSurface from "./TerminalSurface";
import type { TerminalFocusOwner } from "./TerminalSurface";

type ShellTerminalViewProps = {
  workspacePath: string | null;
  editorSessionKey: string | null;
  cwdRelativePath?: string | null;
};

/**
 * ShellTerminalView — interactive shell terminal wired to the frontend IPC layer.
 *
 * On mount (when workspacePath and editorSessionKey are available), calls
 * ensureShellSession to create or reuse a PTY session.  Listens to
 * `shell-output` events from the backend and writes matching payloads into
 * the xterm terminal surface.  Forwards user input via writeShellInput and
 * terminal resize events via resizeShellSession.
 *
 * NOTE: The Rust/Tauri backend for shell sessions is implemented in Task 4.
 * This component intentionally only wires the frontend against the IPC
 * contract; actual PTY execution happens server-side.
 *
 * SESSION LIFETIME — INTENTIONAL DESIGN:
 * This component does NOT dispose the shell session on simple tab/file
 * switches.  Shell session lifetime is tied to the workspace lifecycle, not
 * to whether a particular file or tab is currently visible.  BottomPanel
 * keeps ShellTerminalView always mounted (hidden when the Logs tab is active)
 * precisely so that the running PTY and its terminal scrollback survive
 * tab/panel visibility changes without reconnecting.
 *
 * Per-file sessions remain alive across file switches within the same
 * workspace so that shell restoration works when the user returns to a
 * previously opened file.  Backend disposal (disposeShellSession) is
 * triggered only when the workspace changes or is closed, at which point
 * all tracked sessions for the old workspace are disposed.
 */
function ShellTerminalView({
  workspacePath,
  editorSessionKey,
  cwdRelativePath,
}: ShellTerminalViewProps) {
  const [shellSessionId, setShellSessionId] = useState<string | null>(null);
  const [shellError, setShellError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  /**
   * surfaceKey increments each time the active session identity changes so
   * that TerminalSurface is forced to remount with a clean xterm instance.
   * This prevents stale output from a previous session being visible after
   * switching files (i.e. switching editorSessionKey).
   */
  const [surfaceKey, setSurfaceKey] = useState(0);

  const terminalRef = useRef<Terminal | null>(null);
  const shellSessionIdRef = useRef<string | null>(null);
  /**
   * Tracks the editorSessionKey for which the current xterm surface was
   * initialized. When it changes we bump surfaceKey to reset the renderer.
   */
  const renderedSessionKeyRef = useRef<string | null>(null);
  /**
   * Holds replay text returned by `ensureShellSession` for a reused session.
   * Written into the xterm surface as soon as the terminal mounts via
   * `handleMount`.  Reset to empty string after the replay is delivered.
   */
  const pendingReplayRef = useRef<string>("");
  const focusOwnerRef = useRef<TerminalFocusOwner>("editor");

  // Keep ref in sync so event listener closures always see current value
  shellSessionIdRef.current = shellSessionId;

  /**
   * Tracks all shell session IDs created under the current workspacePath.
   * Used to dispose all known sessions when the workspace changes or closes.
   *
   * Map key: editorSessionKey, value: shellSessionId.
   * Sessions are NOT removed on file/key switches — only on workspace change.
   */
  const sessionMapRef = useRef<Map<string, string>>(new Map());

  /**
   * Tracks the workspace path for which sessions in sessionMapRef were created.
   * When workspacePath changes, we dispose all sessions from the old workspace.
   */
  const activeWorkspaceRef = useRef<string | null>(null);

  // ---- Workspace-level disposal ----

  useEffect(() => {
    const prevWorkspace = activeWorkspaceRef.current;
    const prevMap = sessionMapRef.current;

    if (prevWorkspace !== null && prevWorkspace !== workspacePath) {
      // Workspace changed: dispose all sessions from the old workspace.
      // Do this fire-and-forget; don't block the new session setup.
      for (const [, sessionId] of prevMap) {
        void disposeShellSession({ shellSessionId: sessionId });
      }
      // Reset the session map for the new workspace.
      sessionMapRef.current = new Map();
    }

    activeWorkspaceRef.current = workspacePath;
  }, [workspacePath]);

  // ---- Session lifecycle ----

  useEffect(() => {
    if (!workspacePath || !editorSessionKey) {
      setShellSessionId(null);
      setShellError(null);
      return;
    }

    // When the session identity changes, reset the xterm renderer so no
    // stale output from the previous session remains visible.
    if (renderedSessionKeyRef.current !== editorSessionKey) {
      renderedSessionKeyRef.current = editorSessionKey;
      // Clear any stale pending replay and the terminal ref from the previous
      // session before bumping the surface key.  This ensures:
      //   - No old replay bleeds into the new surface.
      //   - startSession's replay logic sees terminalRef.current === null and
      //     correctly stashes replay in pendingReplayRef for handleMount to pick
      //     up once the fresh TerminalSurface mounts.
      pendingReplayRef.current = "";
      terminalRef.current = null;
      setSurfaceKey((k) => k + 1);
    }

    let cancelled = false;

    const startSession = async () => {
      setShellError(null);
      const response = await ensureShellSession({
        workspaceRoot: workspacePath,
        editorSessionKey,
        cwdRelativePath: cwdRelativePath ?? undefined,
      });

      if (cancelled) {
        return;
      }

      if (response.ok && response.data) {
        const newSessionId = response.data.shellSessionId;
        const replay = response.data.replay ?? "";
        setShellSessionId(newSessionId);
        // Record this session in the workspace-scoped map.
        sessionMapRef.current.set(editorSessionKey, newSessionId);

        // Replay scrollback into the terminal surface.
        // Two cases:
        //   1. The terminal is already mounted (same session key reuse, rare
        //      but possible if surfaceKey did not increment): write immediately.
        //   2. The terminal is not yet mounted (surfaceKey just incremented,
        //      causing a fresh TerminalSurface mount that fires handleMount
        //      shortly after): stash replay so handleMount can deliver it.
        if (replay) {
          const terminal = terminalRef.current;
          if (terminal) {
            terminal.write(replay);
          } else {
            pendingReplayRef.current = replay;
          }
        }
      } else {
        setShellError(response.error?.message ?? "Failed to start shell session.");
      }
    };

    void startSession();

    return () => {
      cancelled = true;
    };
  }, [workspacePath, editorSessionKey, cwdRelativePath]);

  // ---- Listen for shell-exit events (backend signals PTY death) ----

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isUnmounted = false;

    const setupExitListener = async () => {
      const dispose = await listen<{ shellSessionId: string }>("shell-exit", (event) => {
        if (event.payload.shellSessionId !== shellSessionIdRef.current) {
          return;
        }
        // The backend already removed this session from its store on exit.
        // Reflect the disconnect in the frontend so the user can retry.
        setShellSessionId(null);
        setShellError("Shell session ended unexpectedly.");
        // Clean up our tracking map so retry creates a fresh session.
        for (const [key, sid] of sessionMapRef.current) {
          if (sid === event.payload.shellSessionId) {
            sessionMapRef.current.delete(key);
            break;
          }
        }
      });

      if (isUnmounted) {
        dispose();
        return;
      }
      unlisten = dispose;
    };

    void setupExitListener();

    return () => {
      isUnmounted = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // ---- Listen for shell output ----

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isUnmounted = false;

    const setupListener = async () => {
      const dispose = await listen<ShellOutputPayload>("shell-output", (event) => {
        if (event.payload.shellSessionId !== shellSessionIdRef.current) {
          return;
        }
        const terminal = terminalRef.current;
        if (terminal) {
          terminal.write(event.payload.data);
        }
      });

      if (isUnmounted) {
        dispose();
        return;
      }
      unlisten = dispose;
    };

    void setupListener();

    return () => {
      isUnmounted = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // ---- Retry handler ----

  const handleRetry = useCallback(async () => {
    if (!workspacePath || !editorSessionKey || isRetrying) {
      return;
    }
    setIsRetrying(true);
    setShellError(null);
    try {
      const response = await ensureShellSession({
        workspaceRoot: workspacePath,
        editorSessionKey,
        cwdRelativePath: cwdRelativePath ?? undefined,
      });
      if (response.ok && response.data) {
        const newSessionId = response.data.shellSessionId;
        setShellSessionId(newSessionId);
        sessionMapRef.current.set(editorSessionKey, newSessionId);
      } else {
        setShellError(response.error?.message ?? "Failed to start shell session.");
      }
    } catch (err) {
      setShellError(err instanceof Error ? err.message : "Failed to start shell session.");
    } finally {
      setIsRetrying(false);
    }
  }, [workspacePath, editorSessionKey, cwdRelativePath, isRetrying]);

  // ---- Terminal callbacks ----

  const handleMount = useCallback((terminal: Terminal) => {
    terminalRef.current = terminal;
    // Deliver any replay that arrived from ensureShellSession before the
    // terminal surface was mounted (the common case for session switches).
    const replay = pendingReplayRef.current;
    if (replay) {
      pendingReplayRef.current = "";
      terminal.write(replay);
    }
  }, []);

  const handleData = useCallback(
    (data: string) => {
      const activeShellSessionId = shellSessionIdRef.current;
      if (!activeShellSessionId || focusOwnerRef.current !== "terminal") {
        return;
      }
      void writeShellInput({ shellSessionId: activeShellSessionId, data });
    },
    []
  );

  const handleFocusOwnerChange = useCallback((owner: TerminalFocusOwner) => {
    focusOwnerRef.current = owner;
  }, []);

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      const activeShellSessionId = shellSessionIdRef.current;
      if (!activeShellSessionId) {
        return;
      }
      void resizeShellSession({ shellSessionId: activeShellSessionId, cols, rows });
    },
    []
  );

  // ---- Empty state ----

  if (!workspacePath || !editorSessionKey) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] italic text-[var(--overlay0)]">
        Open a file to start a shell session.
      </div>
    );
  }

  // ---- Disconnected / error state ----

  if (shellError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <p className="text-[12px] text-[var(--red)] text-center">{shellError}</p>
        <button
          type="button"
          aria-label="Retry shell session"
          disabled={isRetrying}
          onClick={() => void handleRetry()}
          className="rounded border border-[rgba(231,130,132,0.4)] px-3 py-1.5 text-[11px] font-semibold text-[var(--red)] hover:bg-[rgba(231,130,132,0.1)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRetrying ? "Reconnecting..." : "Retry"}
        </button>
      </div>
    );
  }

  // ---- Active terminal ----

  // `key={surfaceKey}` forces TerminalSurface to remount with a clean xterm
  // instance whenever the session identity changes.  This ensures stale output
  // from a previous session is never visible after switching files.
  return (
    <TerminalSurface
      key={surfaceKey}
      readOnly={false}
      onMount={handleMount}
      onData={handleData}
      onResize={handleResize}
      onFocusOwnerChange={handleFocusOwnerChange}
      className="h-full"
    />
  );
}

export default ShellTerminalView;
