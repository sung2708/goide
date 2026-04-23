import { render, screen, waitFor, act } from "@testing-library/react";
import { useEffect } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock IPC client functions
const ensureShellSessionMock = vi.fn();
const writeShellInputMock = vi.fn();
const resizeShellSessionMock = vi.fn();
const disposeShellSessionMock = vi.fn();

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    ensureShellSession: (...args: unknown[]) => ensureShellSessionMock(...args),
    writeShellInput: (...args: unknown[]) => writeShellInputMock(...args),
    resizeShellSession: (...args: unknown[]) => resizeShellSessionMock(...args),
    disposeShellSession: (...args: unknown[]) => disposeShellSessionMock(...args),
  };
});

// Track the onData callback registered by TerminalSurface
let capturedOnData: ((data: string) => void) | null = null;
let capturedOnResize: ((cols: number, rows: number) => void) | null = null;
let capturedOnMount: ((terminal: { write: (data: string) => void }) => void) | null = null;
const terminalWriteMock = vi.fn();
// Counts actual React mounts of TerminalSurface (useEffect fires on mount only).
let terminalSurfaceMountCount = 0;

vi.mock("./TerminalSurface", () => ({
  default: ({
    onData,
    onResize,
    onMount,
    readOnly,
  }: {
    onData?: (data: string) => void;
    onResize?: (cols: number, rows: number) => void;
    onMount?: (terminal: { write: (data: string) => void }) => void;
    readOnly?: boolean;
  }) => {
    capturedOnData = onData ?? null;
    capturedOnResize = onResize ?? null;
    capturedOnMount = onMount ?? null;
    // useEffect with empty deps fires only on actual mount, not re-renders.
    useEffect(() => {
      terminalSurfaceMountCount += 1;
    }, []);
    return (
      <div data-testid="terminal-surface" data-readonly={readOnly ? "true" : "false"}>
        <button
          type="button"
          data-testid="send-input-btn"
          onClick={() => capturedOnData?.("pwd\r")}
        >
          Send Input
        </button>
      </div>
    );
  },
}));

// Mock @tauri-apps/api/event listen — allow per-test control of multiple event types
let shellOutputListener:
  | ((event: { payload: { shellSessionId: string; data: string } }) => void)
  | null = null;
let shellExitListener:
  | ((event: { payload: { shellSessionId: string } }) => void)
  | null = null;

const listenMock = vi.fn(
  async (
    eventName: string,
    callback: (event: { payload: { shellSessionId: string; data?: string } }) => void
  ) => {
    if (eventName === "shell-output") {
      shellOutputListener = callback as (event: { payload: { shellSessionId: string; data: string } }) => void;
    } else if (eventName === "shell-exit") {
      shellExitListener = callback as (event: { payload: { shellSessionId: string } }) => void;
    }
    return () => {
      if (eventName === "shell-output") shellOutputListener = null;
      if (eventName === "shell-exit") shellExitListener = null;
    };
  }
);

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: Parameters<typeof listenMock>) => listenMock(...args),
}));

import ShellTerminalView from "./ShellTerminalView";

describe("ShellTerminalView", () => {
  beforeEach(() => {
    capturedOnData = null;
    capturedOnResize = null;
    capturedOnMount = null;
    shellOutputListener = null;
    shellExitListener = null;
    terminalSurfaceMountCount = 0;
    ensureShellSessionMock.mockResolvedValue({
      ok: true,
      data: { shellSessionId: "session-abc", reused: false },
    });
    writeShellInputMock.mockResolvedValue({ ok: true });
    resizeShellSessionMock.mockResolvedValue({ ok: true });
    disposeShellSessionMock.mockResolvedValue({ ok: true });
    terminalWriteMock.mockClear();
  });

  it("shows empty state when no workspacePath or editorSessionKey", () => {
    render(
      <ShellTerminalView
        workspacePath={null}
        editorSessionKey={null}
      />
    );

    expect(
      screen.getByText(/open a file to start a shell session/i)
    ).toBeInTheDocument();
    expect(ensureShellSessionMock).not.toHaveBeenCalled();
  });

  it("calls ensureShellSession with workspaceRoot, editorSessionKey, and cwdRelativePath on mount", async () => {
    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalledWith({
        workspaceRoot: "/home/user/project",
        editorSessionKey: "editor:main.go",
        cwdRelativePath: ".",
      });
    });
  });

  it("calls ensureShellSession without cwdRelativePath when not provided", async () => {
    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalledWith({
        workspaceRoot: "/home/user/project",
        editorSessionKey: "editor:main.go",
        cwdRelativePath: undefined,
      });
    });
  });

  it("renders TerminalSurface in non-read-only mode after session is established", async () => {
    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="src"
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      const surface = screen.queryByTestId("terminal-surface");
      expect(surface).toBeInTheDocument();
    });

    expect(screen.getByTestId("terminal-surface")).toHaveAttribute(
      "data-readonly",
      "false"
    );
  });

  it("forwards onData input to writeShellInput after shell session is created", async () => {
    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalled();
    });

    // Simulate terminal input via the mock button
    const sendBtn = screen.getByTestId("send-input-btn");
    sendBtn.click();

    await waitFor(() => {
      expect(writeShellInputMock).toHaveBeenCalledWith({
        shellSessionId: "session-abc",
        data: "pwd\r",
      });
    });
  });

  it("listens to shell-output events and writes matching payloads into the terminal", async () => {
    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalled();
    });

    // Simulate mount providing the terminal
    capturedOnMount?.({ write: terminalWriteMock });

    // Simulate shell output arriving for matching session
    await waitFor(() => expect(listenMock).toHaveBeenCalledWith("shell-output", expect.any(Function)));

    shellOutputListener?.({ payload: { shellSessionId: "session-abc", data: "hello\r\n" } });

    await waitFor(() => {
      expect(terminalWriteMock).toHaveBeenCalledWith("hello\r\n");
    });
  });

  it("ignores shell-output events for a different sessionId", async () => {
    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalled();
    });

    capturedOnMount?.({ write: terminalWriteMock });

    await waitFor(() => expect(listenMock).toHaveBeenCalledWith("shell-output", expect.any(Function)));

    shellOutputListener?.({ payload: { shellSessionId: "different-session", data: "ignored\r\n" } });

    expect(terminalWriteMock).not.toHaveBeenCalled();
  });

  it("calls resizeShellSession when terminal is resized", async () => {
    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalled();
    });

    capturedOnResize?.(80, 24);

    await waitFor(() => {
      expect(resizeShellSessionMock).toHaveBeenCalledWith({
        shellSessionId: "session-abc",
        cols: 80,
        rows: 24,
      });
    });
  });

  // ---- shell create failure / error state ----

  it("shows error state and retry button when ensureShellSession returns !ok", async () => {
    ensureShellSessionMock.mockResolvedValue({
      ok: false,
      error: { code: "shell_session_failed", message: "PTY spawn failed" },
    });

    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/PTY spawn failed/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry shell session/i })).toBeInTheDocument();
    expect(screen.queryByTestId("terminal-surface")).not.toBeInTheDocument();
  });

  it("shows generic error when ensureShellSession returns !ok with no message", async () => {
    ensureShellSessionMock.mockResolvedValue({
      ok: false,
    });

    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to start shell session/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry shell session/i })).toBeInTheDocument();
  });

  it("retries ensureShellSession when retry button is clicked after failure", async () => {
    const user = userEvent.setup();
    ensureShellSessionMock
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "shell_session_failed", message: "PTY spawn failed" },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { shellSessionId: "session-retry", reused: false },
      });

    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry shell session/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /retry shell session/i }));

    await waitFor(() => {
      expect(screen.getByTestId("terminal-surface")).toBeInTheDocument();
    });

    expect(ensureShellSessionMock).toHaveBeenCalledTimes(2);
  });

  // ---- shell-exit event (PTY died unexpectedly) ----

  it("shows disconnected error state when shell-exit event fires for active session", async () => {
    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalled();
    });

    // Wait for the shell-exit listener to be registered
    await waitFor(() =>
      expect(listenMock).toHaveBeenCalledWith("shell-exit", expect.any(Function))
    );

    // The terminal should be visible initially
    expect(screen.getByTestId("terminal-surface")).toBeInTheDocument();

    // Simulate a shell-exit event for the active session
    act(() => {
      shellExitListener?.({ payload: { shellSessionId: "session-abc" } });
    });

    await waitFor(() => {
      expect(screen.getByText(/shell session ended unexpectedly/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry shell session/i })).toBeInTheDocument();
    expect(screen.queryByTestId("terminal-surface")).not.toBeInTheDocument();
  });

  it("ignores shell-exit events for a different session", async () => {
    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalled();
    });

    await waitFor(() =>
      expect(listenMock).toHaveBeenCalledWith("shell-exit", expect.any(Function))
    );

    act(() => {
      shellExitListener?.({ payload: { shellSessionId: "some-other-session" } });
    });

    // Terminal surface should still be visible
    expect(screen.getByTestId("terminal-surface")).toBeInTheDocument();
    expect(screen.queryByText(/shell session ended/i)).not.toBeInTheDocument();
  });

  it("can retry after shell-exit and creates a new session", async () => {
    const user = userEvent.setup();
    ensureShellSessionMock
      .mockResolvedValueOnce({
        ok: true,
        data: { shellSessionId: "session-abc", reused: false },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { shellSessionId: "session-new", reused: false },
      });

    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() =>
      expect(listenMock).toHaveBeenCalledWith("shell-exit", expect.any(Function))
    );

    // Trigger natural exit
    act(() => {
      shellExitListener?.({ payload: { shellSessionId: "session-abc" } });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry shell session/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /retry shell session/i }));

    await waitFor(() => {
      expect(screen.getByTestId("terminal-surface")).toBeInTheDocument();
    });

    expect(ensureShellSessionMock).toHaveBeenCalledTimes(2);
    expect(ensureShellSessionMock).toHaveBeenLastCalledWith({
      workspaceRoot: "/home/user/project",
      editorSessionKey: "editor:main.go",
      cwdRelativePath: ".",
    });
  });

  // ---- workspace-level disposal ----

  it("disposes all tracked sessions when workspacePath changes", async () => {
    const { rerender } = render(
      <ShellTerminalView
        workspacePath="/home/user/project-a"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceRoot: "/home/user/project-a" })
      );
    });

    // Switch workspace
    ensureShellSessionMock.mockResolvedValue({
      ok: true,
      data: { shellSessionId: "session-b", reused: false },
    });

    rerender(
      <ShellTerminalView
        workspacePath="/home/user/project-b"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      // The old session should have been disposed
      expect(disposeShellSessionMock).toHaveBeenCalledWith({
        shellSessionId: "session-abc",
      });
    });
  });

  it("does NOT dispose sessions when only editorSessionKey changes (file switch within workspace)", async () => {
    const { rerender } = render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ editorSessionKey: "editor:main.go" })
      );
    });

    // Switch to a different file (same workspace)
    ensureShellSessionMock.mockResolvedValue({
      ok: true,
      data: { shellSessionId: "session-other", reused: false },
    });

    rerender(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:other.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ editorSessionKey: "editor:other.go" })
      );
    });

    // disposeShellSession must NOT have been called — sessions stay alive
    expect(disposeShellSessionMock).not.toHaveBeenCalled();
  });

  // ---- BLOCKER FIX — B: renderer reset on session switch ----

  /**
   * When the active editorSessionKey changes (user switched to a different
   * file), the TerminalSurface must be reset so stale output from the previous
   * session is not visible.
   *
   * Implementation: ShellTerminalView bumps an internal `surfaceKey` whenever
   * editorSessionKey changes, which changes the React `key` on TerminalSurface
   * and forces a full remount with a clean xterm instance.
   *
   * Observable in tests: `terminalSurfaceMountCount` increments a second time
   * after the session key switch (the useEffect in the mock fires on the new
   * mount), and ensureShellSession is called for the new session key.
   */
  it("resets the terminal renderer when editorSessionKey changes to a new session", async () => {
    ensureShellSessionMock
      .mockResolvedValueOnce({
        ok: true,
        data: { shellSessionId: "session-main", reused: false },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { shellSessionId: "session-other", reused: false },
      });

    const { rerender } = render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    // Wait for first session to establish and terminal to mount
    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ editorSessionKey: "editor:main.go" })
      );
    });

    // Record mount count after the initial session is established.
    // (Under React StrictMode the count may be >1 due to double-invocation.)
    const mountCountAfterFirstSession = terminalSurfaceMountCount;
    expect(mountCountAfterFirstSession).toBeGreaterThanOrEqual(1);

    // Verify we're showing the terminal surface
    expect(screen.getByTestId("terminal-surface")).toBeInTheDocument();

    // Now switch to a different file / session key
    rerender(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:other.go"
        cwdRelativePath="."
      />
    );

    // The new session should be established
    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ editorSessionKey: "editor:other.go" })
      );
    });

    // After the session key change, TerminalSurface is remounted (surfaceKey
    // incremented → React key changed → clean xterm instance).
    // The mount count must be strictly greater than the initial count.
    await waitFor(() => {
      expect(terminalSurfaceMountCount).toBeGreaterThan(mountCountAfterFirstSession);
    });

    // Terminal surface is still rendered for the new session
    expect(screen.getByTestId("terminal-surface")).toBeInTheDocument();

    // Simulate output arriving for the new session — only the active session's
    // terminal receives it.
    await waitFor(() => expect(listenMock).toHaveBeenCalledWith("shell-output", expect.any(Function)));
    const newSessionWriteMock = vi.fn();
    capturedOnMount?.({ write: newSessionWriteMock });

    shellOutputListener?.({ payload: { shellSessionId: "session-other", data: "new-session-output\r\n" } });

    await waitFor(() => {
      expect(newSessionWriteMock).toHaveBeenCalledWith("new-session-output\r\n");
    });
  });

  it("does NOT reset the terminal renderer when editorSessionKey stays the same", async () => {
    const { rerender } = render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ editorSessionKey: "editor:main.go" })
      );
    });

    // Wait for initial effects to settle and record the mount count.
    await waitFor(() => {
      expect(terminalSurfaceMountCount).toBeGreaterThanOrEqual(1);
    });
    const mountCountAfterInit = terminalSurfaceMountCount;

    // Rerender with the same session key (e.g. only cwdRelativePath changed)
    rerender(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="src"
      />
    );

    // Small tick to let effects run
    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalledTimes(2);
    });

    // Mount count must NOT have changed — surfaceKey did not increment so
    // TerminalSurface was not remounted, only re-rendered.
    expect(terminalSurfaceMountCount).toBe(mountCountAfterInit);
  });

  // ---- BLOCKER FIX — Scrollback replay on session attach ----

  /**
   * When ensureShellSession returns replay text (reused session with buffered
   * output), the terminal surface must receive that text via terminal.write()
   * as soon as it mounts.  This ensures the user sees prior visible terminal
   * contents when switching back to a file they had open before.
   */
  it("writes replay text into the terminal when ensureShellSession returns a reused session with replay", async () => {
    ensureShellSessionMock.mockResolvedValue({
      ok: true,
      data: { shellSessionId: "session-abc", reused: true, replay: "$ ls\r\nmain.go\r\n" },
    });

    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalled();
    });

    // Simulate the terminal surface mounting and providing a write handle.
    capturedOnMount?.({ write: terminalWriteMock });

    await waitFor(() => {
      expect(terminalWriteMock).toHaveBeenCalledWith("$ ls\r\nmain.go\r\n");
    });
  });

  it("does NOT write replay into the terminal when replay is empty (new session)", async () => {
    ensureShellSessionMock.mockResolvedValue({
      ok: true,
      data: { shellSessionId: "session-abc", reused: false, replay: "" },
    });

    render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalled();
    });

    capturedOnMount?.({ write: terminalWriteMock });

    // Small settle — no write should occur
    await new Promise((r) => setTimeout(r, 20));
    expect(terminalWriteMock).not.toHaveBeenCalled();
  });

  /**
   * Full session-switch restoration scenario:
   *   1. Mount with main.go -> session-main (fresh, no replay)
   *   2. Switch to other.go -> session-other (fresh, no replay)
   *   3. Switch back to main.go -> session-main (reused, with replay text)
   *
   * On step 3 the component must write the replay into the new fresh surface.
   */
  it("restores visible terminal contents when switching back to a previously active session", async () => {
    // Step 1: main.go — fresh session
    ensureShellSessionMock.mockResolvedValueOnce({
      ok: true,
      data: { shellSessionId: "session-main", reused: false, replay: "" },
    });

    const { rerender } = render(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ editorSessionKey: "editor:main.go" })
      );
    });

    // Mount the first terminal surface (no replay).
    const firstMountWrite = vi.fn();
    capturedOnMount?.({ write: firstMountWrite });
    expect(firstMountWrite).not.toHaveBeenCalled();

    // Step 2: switch to other.go — fresh session
    ensureShellSessionMock.mockResolvedValueOnce({
      ok: true,
      data: { shellSessionId: "session-other", reused: false, replay: "" },
    });

    rerender(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:other.go"
        cwdRelativePath="."
      />
    );

    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ editorSessionKey: "editor:other.go" })
      );
    });

    // Mount the second terminal surface (other.go, no replay).
    const secondMountWrite = vi.fn();
    capturedOnMount?.({ write: secondMountWrite });
    expect(secondMountWrite).not.toHaveBeenCalled();

    // Step 3: switch back to main.go — reused session WITH replay
    ensureShellSessionMock.mockResolvedValueOnce({
      ok: true,
      data: {
        shellSessionId: "session-main",
        reused: true,
        replay: "$ go build\r\nBuild succeeded\r\n",
      },
    });

    rerender(
      <ShellTerminalView
        workspacePath="/home/user/project"
        editorSessionKey="editor:main.go"
        cwdRelativePath="."
      />
    );

    // Wait for the third ensureShellSession call to fully resolve.
    // We do this by waiting until the mock has been called 3 times AND then
    // flushing remaining microtasks so pendingReplayRef.current is populated.
    await waitFor(() => {
      expect(ensureShellSessionMock).toHaveBeenCalledTimes(3);
    });

    // The terminal surface remounts (surfaceKey incremented on session key
    // change). Simulate the new mount delivering the write handle.
    // We call this inside waitFor so it retries until pendingReplayRef is set
    // (i.e. until the async startSession for step 3 has resolved).
    const restoredMountWrite = vi.fn();
    await waitFor(() => {
      // Repeatedly deliver the mount callback until replay is written.
      // capturedOnMount points to handleMount from the current component render.
      capturedOnMount?.({ write: restoredMountWrite });
      expect(restoredMountWrite).toHaveBeenCalledWith(
        "$ go build\r\nBuild succeeded\r\n"
      );
    });

    // The previous surfaces must not have received any replay.
    expect(firstMountWrite).not.toHaveBeenCalled();
    expect(secondMountWrite).not.toHaveBeenCalled();
  });
});
