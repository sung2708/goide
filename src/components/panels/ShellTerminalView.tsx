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
import { createLatencyMetrics } from "../../features/perf/latencyMetrics";
import { useShellTerminalOutput } from "../../features/terminal/useShellTerminalOutput";
import { ShellWorkspaceOwnership } from "../../features/terminal/ShellWorkspaceOwnership";
import TerminalSurface from "./TerminalSurface";
import type { TerminalFocusOwner } from "./TerminalSurface";

type ShellTerminalViewProps = {
  workspacePath: string | null;
  surfaceKey: string | null;
  cwdRelativePath?: string | null;
  fitRequestKey?: number;
};

/**
 * ShellTerminalView — interactive shell terminal wired to the frontend IPC layer.
 *
 * On mount (when workspacePath and surfaceKey are available), calls
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
  surfaceKey,
  cwdRelativePath,
  fitRequestKey,
}: ShellTerminalViewProps) {
  const [shellSessionId, setShellSessionId] = useState<string | null>(null);
  const [shellError, setShellError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isWorkspaceSwitching, setIsWorkspaceSwitching] = useState(false);
  const [workspaceCleanupError, setWorkspaceCleanupError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const currentRootRef = useRef(workspacePath); currentRootRef.current = workspacePath;
  const ownershipRef = useRef<ShellWorkspaceOwnership | null>(null);
  if (!ownershipRef.current) ownershipRef.current = new ShellWorkspaceOwnership(async id => {
    const response = await disposeShellSession({ shellSessionId: id });
    if (!response.ok) throw new Error(response.error?.message ?? "Terminal cleanup has not completed.");
  });
  const ownership = ownershipRef.current;
  /**
   * surfaceVersion increments each time the active session identity changes so
   * that TerminalSurface is forced to remount with a clean xterm instance.
   * This prevents stale output from a previous session being visible after
   * switching files (i.e. switching surfaceKey).
   */
  const [surfaceVersion, setSurfaceVersion] = useState(0);

  const { terminalRef, pendingOutputBufferRef, scheduleTerminalFlush, enqueueTerminalWrite, clearPendingTerminalWrites } = useShellTerminalOutput();
  const shellSessionIdRef = useRef<string | null>(null);
  /**
   * Tracks the current cwdRelativePath without making it a session lifecycle
   * dep.  The cwd is only meaningful as an initial hint on the first
   * ensureShellSession call for a given surfaceKey.  Changing it after the
   * session is established should not reset the running shell.
   */
  const cwdRelativePathRef = useRef(cwdRelativePath);
  cwdRelativePathRef.current = cwdRelativePath;
  /**
   * Tracks the surface key for which the current xterm surface was
   * initialized. When it changes we bump surfaceVersion to reset the renderer.
   */
  const renderedSessionKeyRef = useRef<string | null>(null);
  /**
   * Holds replay text returned by `ensureShellSession` for a reused session.
   * Written into the xterm surface as soon as the terminal mounts via
   * `handleMount`.  Reset to empty string after the replay is delivered.
   */
  const pendingReplayRef = useRef<string>("");
  const focusOwnerRef = useRef<TerminalFocusOwner>("editor");
  const pendingInputTokensRef = useRef<string[]>([]);
  const inputTokenCounterRef = useRef(0);
  const latencyMetricsRef = useRef(createLatencyMetrics());

  // Keep ref in sync so event listener closures always see current value
  shellSessionIdRef.current = shellSessionId;

  const resetLatencyTracking = useCallback(() => {
    pendingInputTokensRef.current = [];
    inputTokenCounterRef.current = 0;
    latencyMetricsRef.current.reset();
  }, []);

  /**
   * Tracks all shell session IDs created under the current workspacePath.
   * Used to dispose all known sessions when the workspace changes or closes.
   *
   * Map key: surfaceKey, value: shellSessionId.
   * Sessions are NOT removed on file/key switches — only on workspace change.
   */
  const sessionMapRef = useRef<Map<string, string>>(new Map());
  const pendingCleanupRef = useRef(new Set<string>());
  const cleanupSurface = useCallback(async (key: string) => {
    const id = sessionMapRef.current.get(key);
    if (!id || !pendingCleanupRef.current.has(id)) return;
    const response = await disposeShellSession({ shellSessionId: id });
    if (!response.ok) throw new Error(response.error?.message ?? "Terminal cleanup has not completed.");
    ownership.forget(id);
    pendingCleanupRef.current.delete(id);
    if (sessionMapRef.current.get(key) === id) sessionMapRef.current.delete(key);
  }, []);

  /**
   * Tracks the workspace path for which sessions in sessionMapRef were created.
   * When workspacePath changes, we dispose all sessions from the old workspace.
   */
  const activeWorkspaceRef = useRef<string | null>(null);
  const workspaceSwitchTokenRef = useRef(0);
  const workspaceCleanupCountRef = useRef(0);

  // ---- Workspace-level disposal ----
  const cleanupWorkspace = useCallback(async () => {
    const switchToken = workspaceSwitchTokenRef.current;
    workspaceCleanupCountRef.current++;
    setIsWorkspaceSwitching(true); setWorkspaceCleanupError(null);
    try {
      await ownership.cleanupOutside(() => currentRootRef.current);
      const currentIds = new Set(sessionMapRef.current.values());
      for (const id of pendingCleanupRef.current) if (!currentIds.has(id)) pendingCleanupRef.current.delete(id);
    }
    catch (error) {
      if (mountedRef.current && switchToken === workspaceSwitchTokenRef.current) setWorkspaceCleanupError(error instanceof Error ? error.message : String(error));
    } finally {
      workspaceCleanupCountRef.current--;
      if (mountedRef.current && switchToken === workspaceSwitchTokenRef.current) setIsWorkspaceSwitching(false);
    }
  }, [ownership]);
  useEffect(() => {
    const previous = activeWorkspaceRef.current;
    activeWorkspaceRef.current = workspacePath;
    if (previous !== workspacePath) {
      workspaceSwitchTokenRef.current++;
      setShellSessionId(null); setShellError(null); pendingReplayRef.current = "";
      clearPendingTerminalWrites(); resetLatencyTracking(); terminalRef.current = null;
      setSurfaceVersion(value => value + 1);
      sessionMapRef.current = new Map();
      if (ownership.hasOutside(workspacePath) || workspaceCleanupCountRef.current > 0) void cleanupWorkspace();
    }
  }, [workspacePath, clearPendingTerminalWrites, resetLatencyTracking, ownership, cleanupWorkspace]);
  useEffect(() => {
    mountedRef.current = true; currentRootRef.current = workspacePath;
    return () => {
      mountedRef.current = false; currentRootRef.current = null; workspaceSwitchTokenRef.current++;
      void ownership.cleanupOutside(() => currentRootRef.current).catch(error => console.error("Terminal cleanup on unmount failed; native ownership is retained:", error));
    };
    // Workspace changes are handled above; this cleanup belongs to actual unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownership]);

  // ---- Session lifecycle ----

  useEffect(() => {
    if (!workspacePath || !surfaceKey || isWorkspaceSwitching || ownership.hasOutside(workspacePath)) {
      setShellSessionId(null);
      setShellError(null);
      return;
    }

    // When the session identity changes, reset the xterm renderer so no
    // stale output from the previous session remains visible.
    if (renderedSessionKeyRef.current !== surfaceKey) {
      renderedSessionKeyRef.current = surfaceKey;
      // Clear any stale pending replay and the terminal ref from the previous
      // session before bumping the surface key. This ensures:
      //   - No old replay bleeds into the new surface.
      //   - startSession's replay logic sees terminalRef.current === null and
      //     correctly stashes replay in pendingReplayRef for handleMount to pick
      //     up once the fresh TerminalSurface mounts.
      pendingReplayRef.current = "";
      clearPendingTerminalWrites();
      resetLatencyTracking();
      terminalRef.current = null;
      setSurfaceVersion((k) => k + 1);
    }

    let cancelled = false;

    const startSession = async () => {
      setShellError(null);
      const switchToken = workspaceSwitchTokenRef.current;
      const sessionMap = sessionMapRef.current;
      try {
        await cleanupSurface(surfaceKey);
        if (cancelled || switchToken !== workspaceSwitchTokenRef.current) return;
        const response = await ownership.track(workspacePath, () => ensureShellSession({
          workspaceRoot: workspacePath,
          surfaceKey,
          cwdRelativePath: cwdRelativePathRef.current ?? undefined,
        }), result => {
          const id = result.ok ? result.data?.shellSessionId : undefined;
          if (id) sessionMap.set(surfaceKey, id);
          return id;
        });

        if (cancelled || switchToken !== workspaceSwitchTokenRef.current) {
          return;
        }

        if (response.ok && response.data) {
          const newSessionId = response.data.shellSessionId;
          const replay = response.data.replay ?? "";
          setShellSessionId(newSessionId);
          // Record this session in the workspace-scoped map.
          sessionMapRef.current.set(surfaceKey, newSessionId);

          // Replay scrollback into the terminal surface.
          // Two cases:
          //   1. The terminal is already mounted (same session key reuse, rare
          //      but possible if surfaceVersion did not increment): write immediately.
          //   2. The terminal is not yet mounted (surfaceKey just incremented,
          //      causing a fresh TerminalSurface mount that fires handleMount
          //      shortly after): stash replay so handleMount can deliver it.
          if (replay) {
            if (terminalRef.current) {
              enqueueTerminalWrite(replay);
            } else {
              pendingReplayRef.current = replay;
            }
          }
        } else {
          setShellError(response.error?.message ?? "Failed to start shell session.");
        }
      } catch (error) {
        if (!cancelled && switchToken === workspaceSwitchTokenRef.current) setShellError(error instanceof Error ? error.message : String(error));
      }
    };

    void startSession();

    return () => {
      cancelled = true;
    };
  // cwdRelativePath is intentionally excluded from deps: it is only used as
  // an initial hint when creating a new session and must not cause session
  // re-initialization when it changes (e.g. on file switches with a stable
  // workspace-owned surfaceKey).  The ref keeps it readable inside the effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspacePath, surfaceKey, isWorkspaceSwitching, clearPendingTerminalWrites, resetLatencyTracking, cleanupSurface, ownership]);

  // ---- Listen for shell-exit events (backend signals PTY death) ----

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isUnmounted = false;

    const setupExitListener = async () => {
      const dispose = await listen<{ shellSessionId: string; shellHealth?: "launch" | "degraded" | "exit" }>("shell-exit", (event) => {
        const id = event.payload.shellSessionId;
        const isActive = id === shellSessionIdRef.current;
        const isTracked = [...sessionMapRef.current.values()].includes(id);
        if (!isActive && !isTracked) return;
        if (event.payload.shellHealth === "degraded") {
          pendingCleanupRef.current.add(id);
          if (isActive) {
            setShellSessionId(null);
            setShellError("Terminal cleanup is pending or failed. Retry cleanup before reconnecting.");
          }
          return;
        }
        ownership.forget(id); pendingCleanupRef.current.delete(id);
        for (const [key, session] of sessionMapRef.current) if (session === id) sessionMapRef.current.delete(key);
        if (isActive) {
          setShellSessionId(null); setShellError("Shell session ended unexpectedly.");
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
        if (event.payload.data.length > 0) {
          const token = pendingInputTokensRef.current.shift();
          if (token) {
            latencyMetricsRef.current.markEcho(token);
          }
        }
        enqueueTerminalWrite(event.payload.data);
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
      clearPendingTerminalWrites();
      resetLatencyTracking();
    };
  }, [enqueueTerminalWrite, clearPendingTerminalWrites, resetLatencyTracking]);

  // ---- Retry handler ----

  const handleRetry = useCallback(async () => {
    if (!workspacePath || !surfaceKey || isRetrying || isWorkspaceSwitching || ownership.hasOutside(workspacePath)) {
      return;
    }
    setIsRetrying(true);
    setShellError(null);
    resetLatencyTracking();
    const switchToken = workspaceSwitchTokenRef.current;
    try {
      await cleanupSurface(surfaceKey);
      if (switchToken !== workspaceSwitchTokenRef.current) return;
      const response = await ownership.track(workspacePath, () => ensureShellSession({
        workspaceRoot: workspacePath,
        surfaceKey,
        cwdRelativePath: cwdRelativePathRef.current ?? undefined,
      }), result => result.ok ? result.data?.shellSessionId : undefined);
      if (switchToken !== workspaceSwitchTokenRef.current) return;
      if (response.ok && response.data) {
        const newSessionId = response.data.shellSessionId;
        setShellSessionId(newSessionId);
        sessionMapRef.current.set(surfaceKey, newSessionId);
      } else {
        setShellError(response.error?.message ?? "Failed to start shell session.");
      }
    } catch (err) {
      if (switchToken === workspaceSwitchTokenRef.current) setShellError(err instanceof Error ? err.message : "Failed to start shell session.");
    } finally {
      setIsRetrying(false);
    }
  }, [workspacePath, surfaceKey, isRetrying, isWorkspaceSwitching, resetLatencyTracking, cleanupSurface, ownership]);

  // ---- Terminal callbacks ----

  const handleMount = useCallback((terminal: Terminal) => {
    terminalRef.current = terminal;
    // Deliver any replay that arrived from ensureShellSession before the
    // terminal surface was mounted (the common case for session switches).
    const replay = pendingReplayRef.current;
    if (replay) {
      pendingReplayRef.current = "";
      enqueueTerminalWrite(replay);
    }
    if (pendingOutputBufferRef.current.length > 0) {
      scheduleTerminalFlush();
    }
  }, [enqueueTerminalWrite, scheduleTerminalFlush]);

  const handleData = useCallback(
    (data: string) => {
      const activeShellSessionId = shellSessionIdRef.current;
      if (!activeShellSessionId || focusOwnerRef.current !== "terminal") {
        return;
      }
      const token = `input-${inputTokenCounterRef.current}`;
      inputTokenCounterRef.current += 1;
      pendingInputTokensRef.current.push(token);
      latencyMetricsRef.current.markKeyDown(token);
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

  if (workspaceCleanupError) {
    return <div className="flex h-full flex-col items-center justify-center gap-3 p-4"><p role="alert">{workspaceCleanupError}</p><button disabled={isWorkspaceSwitching} onClick={() => void cleanupWorkspace()}>Retry terminal cleanup</button></div>;
  }
  if (!workspacePath || !surfaceKey) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] italic text-[var(--overlay0)]">
        Open a workspace to start a shell session.
      </div>
    );
  }

  if (isWorkspaceSwitching) {
    return (
      <div className="flex h-full items-center justify-center text-[12px] italic text-[var(--overlay1)]">
        Switching workspace shell...
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

  // `key={surfaceVersion}` forces TerminalSurface to remount with a clean xterm
  // instance whenever the session identity changes.  This ensures stale output
  // from a previous session is never visible after switching files.
  return (
    <TerminalSurface
      key={surfaceVersion}
      readOnly={false}
      onMount={handleMount}
      onData={handleData}
      onResize={handleResize}
      onFocusOwnerChange={handleFocusOwnerChange}
      fitRequestKey={fitRequestKey}
      className="h-full"
    />
  );
}

export default ShellTerminalView;
