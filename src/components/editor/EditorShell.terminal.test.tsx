/**
 * EditorShell terminal wiring tests.
 *
 * Focuses on the contract between EditorShell and BottomPanel when a file is
 * opened and Run is clicked: the logs tab should be activated and the bottom
 * panel should receive the correct shellSessionKey (editor:<relativePath>).
 */

import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";

// ---- IPC mocks ----

const openMock = vi.fn();
const readWorkspaceFileMock = vi.fn();
const getRuntimeAvailabilityMock = vi.fn();
const runWorkspaceFileMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

const stopCurrentRunMock = vi.fn();

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
    getRuntimeAvailability: (...args: unknown[]) =>
      getRuntimeAvailabilityMock(...args),
    runWorkspaceFile: (...args: unknown[]) => runWorkspaceFileMock(...args),
    stopCurrentRun: (...args: unknown[]) => stopCurrentRunMock(...args),
    ensureShellSession: vi.fn().mockResolvedValue({
      ok: true,
      data: { shellSessionId: "session-x", reused: false },
    }),
    writeShellInput: vi.fn().mockResolvedValue({ ok: true }),
    resizeShellSession: vi.fn().mockResolvedValue({ ok: true }),
    disposeShellSession: vi.fn().mockResolvedValue({ ok: true }),
  };
});

vi.mock("../../features/concurrency/useLensSignals", () => ({
  useLensSignals: () => ({
    detectedConstructs: [],
    counterpartMappings: [],
    isAnalyzing: false,
    analysisError: null,
  }),
}));

vi.mock("../sidebar/Explorer", () => ({
  default: ({
    workspacePath,
    onOpenFile,
  }: {
    workspacePath: string | null;
    onOpenFile: (relativePath: string) => void;
  }) => (
    <div>
      {workspacePath ? (
        <>
          <button type="button" onClick={() => onOpenFile("main.go")}>
            Open Mock File
          </button>
          <button type="button" onClick={() => onOpenFile("other.go")}>
            Open Other File
          </button>
        </>
      ) : null}
    </div>
  ),
}));

vi.mock("./CodeEditor", () => ({
  default: () => <div data-testid="mock-code-editor" />,
}));

// Capture BottomPanel props so we can assert on them
let capturedBottomPanelProps: Record<string, unknown> | null = null;

// Track how many times the BottomPanel mock has been *mounted* (React key
// changes or conditional rendering would cause a new mount).
// Uses useEffect so only actual React mounts (not re-renders) are counted.
let bottomPanelMountCount = 0;

vi.mock("../panels/BottomPanel", () => ({
  default: (props: Record<string, unknown>) => {
    capturedBottomPanelProps = props;
    // useEffect with empty deps fires only on mount, not on re-renders.
    useEffect(() => {
      bottomPanelMountCount += 1;
    }, []);
    const activeTab = props.activeTab as string;
    const shellSessionKey = props.shellSessionKey as string | null;
    const isRunning = props.isRunning as boolean;
    const onActiveTabChange = props.onActiveTabChange as (tab: string) => void;
    const onStop = props.onStop as (() => void) | undefined;
    const onClose = props.onClose as (() => void) | undefined;
    const onDockModeChange = props.onDockModeChange as
      | ((mode: "bottom" | "right") => void)
      | undefined;
    return (
      <div data-testid="bottom-panel">
        <span data-testid="active-tab">{activeTab}</span>
        <span data-testid="shell-session-key">{shellSessionKey ?? "none"}</span>
        <span data-testid="is-running">{isRunning ? "running" : "idle"}</span>
        <button type="button" onClick={() => onActiveTabChange("shell")} aria-label="Switch to shell tab">
          Shell Tab
        </button>
        <button type="button" onClick={() => onStop?.()} aria-label="Stop run">
          Stop
        </button>
        <button type="button" onClick={() => onClose?.()} aria-label="Close bottom panel">
          Close
        </button>
        <button
          type="button"
          onClick={() => onDockModeChange?.("right")}
          aria-label="Dock right"
        >
          Dock Right
        </button>
      </div>
    );
  },
}));

vi.mock("../layout/ResizableSplit", () => ({
  default: (props: Record<string, unknown>) => {
    const onResize = props.onResize as (size: number) => void;
    return (
      <div
        data-testid="resizable-split"
        data-orientation={props.orientation as string}
        data-size={String(props.size)}
        data-default-size={String(props.defaultSize)}
        data-min-size={String(props.minSize)}
        data-max-size={String(props.maxSize)}
        data-class-name={(props.className as string | undefined) ?? ""}
      >
        <div data-testid="split-primary">{props.primary as ReactNode}</div>
        <button type="button" onClick={() => onResize(456)} aria-label="Resize terminal">
          Resize
        </button>
        <div data-testid="split-secondary">{props.secondary as ReactNode}</div>
      </div>
    );
  },
}));

describe("EditorShell terminal wiring", () => {
  beforeEach(() => {
    capturedBottomPanelProps = null;
    bottomPanelMountCount = 0;
    localStorage.clear();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "available" },
    });
    runWorkspaceFileMock.mockResolvedValue({ ok: true });
    stopCurrentRunMock.mockResolvedValue({ ok: true });
  });

  it("opens workspace, opens file, clicks run, and BottomPanel receives shellSessionKey logs:editor:main.go", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    // Open workspace
    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);

    // Open file
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    // Click Run (aria-label is "Run active Go file"; may appear multiple times in DOM)
    await waitFor(() => {
      expect(screen.queryAllByRole("button", { name: /run active go file/i }).length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole("button", { name: /run active go file/i })[0]);

    // Bottom panel should open with logs tab active
    await waitFor(() => {
      expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();
    });

    expect(screen.getByTestId("active-tab")).toHaveTextContent("logs");

    // shellSessionKey should be editor:main.go
    expect(screen.getByTestId("shell-session-key")).toHaveTextContent(
      "editor:main.go"
    );
  });

  it("derives editorSessionKey as editor:<activeFilePath>", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    await waitFor(() => {
      expect(capturedBottomPanelProps).not.toBeNull();
    });

    expect(capturedBottomPanelProps?.shellSessionKey).toBe("editor:main.go");
  });

  it("passes workspacePath to BottomPanel", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    await waitFor(() => {
      expect(capturedBottomPanelProps).not.toBeNull();
    });

    expect(capturedBottomPanelProps?.workspacePath).toBe("C:/workspace");
  });

  /**
   * SESSION IDENTITY RESTORATION:
   * editorSessionKey is derived from activeFilePath (`editor:<path>`).
   * Switching away to another file changes the key (different PTY session).
   * Switching back to the original file restores the original key, which
   * the backend maps back to the same PTY session (shell restoration).
   * This test verifies the deterministic file-based session identity contract.
   */
  it("restores the original editorSessionKey when switching back to a previously opened file", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    // Open workspace
    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);

    // Open main.go -> editorSessionKey becomes editor:main.go
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    // Trigger the bottom panel so we can see the session key
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);
    await waitFor(() => {
      expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();
    });
    expect(screen.getByTestId("shell-session-key")).toHaveTextContent("editor:main.go");
    const firstKey = capturedBottomPanelProps?.shellSessionKey;

    // Switch to other.go -> editorSessionKey becomes editor:other.go
    await user.click(screen.getByRole("button", { name: /open other file/i }));
    await waitFor(() => {
      expect(capturedBottomPanelProps?.shellSessionKey).toBe("editor:other.go");
    });

    // Switch back to main.go -> editorSessionKey returns to editor:main.go
    await user.click(screen.getByRole("button", { name: /open mock file/i }));
    await waitFor(() => {
      expect(capturedBottomPanelProps?.shellSessionKey).toBe("editor:main.go");
    });

    // The restored key is identical to the first key (deterministic identity)
    expect(capturedBottomPanelProps?.shellSessionKey).toBe(firstKey);
    expect(screen.getByTestId("shell-session-key")).toHaveTextContent("editor:main.go");
  });

  /**
   * BLOCKER FIX — A: BottomPanel must NOT remount on hide/show.
   *
   * Previously EditorShell conditionally rendered BottomPanel with
   * `{isBottomPanelOpen && <BottomPanel .../>}`, which destroyed and
   * recreated the component (and ShellTerminalView's xterm instance) each
   * time the panel was toggled.
   *
   * After the fix, BottomPanel is always mounted and visibility is toggled
   * via `hidden` CSS, so:
   *   - bottomPanelMountCount stays at 1 across hide/show cycles.
   *   - shellSessionKey on the panel props is preserved unchanged.
   *   - activeTab on the panel props is preserved unchanged.
   */
  it("hide/show of the bottom panel keeps BottomPanel mounted and preserves shell tab state", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    // Open workspace and file
    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    // Open the panel via run (sets logs tab + opens panel)
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    await waitFor(() => {
      expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();
    });

    const mountCountAfterOpen = bottomPanelMountCount;
    expect(mountCountAfterOpen).toBeGreaterThanOrEqual(1);

    // Capture state before closing
    const sessionKeyBeforeClose = capturedBottomPanelProps?.shellSessionKey;
    expect(sessionKeyBeforeClose).toBe("editor:main.go");

    // Switch to shell tab so we can verify it is preserved after reopen
    await user.click(screen.getByRole("button", { name: /switch to shell tab/i }));
    await waitFor(() => {
      expect(capturedBottomPanelProps?.activeTab).toBe("shell");
    });

    // Close the panel (simulates status bar toggle or the Close button inside)
    await user.click(screen.getByRole("button", { name: /close bottom panel/i }));

    // After hiding, BottomPanel is still in the DOM (just hidden) so mount
    // count must NOT have increased further.
    expect(bottomPanelMountCount).toBe(mountCountAfterOpen);

    // shellSessionKey and activeTab must still be the same (no prop reset)
    expect(capturedBottomPanelProps?.shellSessionKey).toBe("editor:main.go");
    expect(capturedBottomPanelProps?.activeTab).toBe("shell");

    // Re-open the panel via the status bar TERMINAL toggle button.
    // This does NOT change bottomPanelTab, so activeTab remains "shell".
    await user.click(screen.getByRole("button", { name: /show terminal panel/i }));

    await waitFor(() => {
      // The panel should be visible again (the hidden wrapper is removed)
      expect(capturedBottomPanelProps?.shellSessionKey).toBe("editor:main.go");
    });

    // Still no extra mount — same React component instance throughout.
    expect(bottomPanelMountCount).toBe(mountCountAfterOpen);
    // Shell session key must still be the file-derived key.
    expect(capturedBottomPanelProps?.shellSessionKey).toBe("editor:main.go");
    // Active tab is still shell (we didn't click Run again, just toggled panel visibility)
    expect(capturedBottomPanelProps?.activeTab).toBe("shell");
  });

  it("preserves shell state (shellSessionKey) after stopping a run and switching to the shell tab", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    // Open workspace and file
    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    // Start a run so the bottom panel opens on logs tab
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    await waitFor(() => {
      expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();
      expect(screen.getByTestId("active-tab")).toHaveTextContent("logs");
    });

    // shellSessionKey is derived from activeFilePath and must be correct
    expect(screen.getByTestId("shell-session-key")).toHaveTextContent("editor:main.go");

    // isRunning should reflect the run state
    expect(screen.getByTestId("is-running")).toHaveTextContent("running");

    // Trigger stop via the mock BottomPanel's stop button (calls onStop prop)
    await user.click(screen.getByRole("button", { name: /stop run/i }));

    // stopCurrentRun IPC should have been called
    expect(stopCurrentRunMock).toHaveBeenCalledTimes(1);

    // After stopping, isRunning should be idle (runStatus transitions to "done")
    await waitFor(() => {
      expect(screen.getByTestId("is-running")).toHaveTextContent("idle");
    });

    // Switch to shell tab via the mock button
    await user.click(screen.getByRole("button", { name: /switch to shell tab/i }));

    // After switching to shell tab, shellSessionKey must still be editor:main.go
    await waitFor(() => {
      expect(screen.getByTestId("active-tab")).toHaveTextContent("shell");
    });

    expect(screen.getByTestId("shell-session-key")).toHaveTextContent("editor:main.go");
    expect(capturedBottomPanelProps?.shellSessionKey).toBe("editor:main.go");
  });

  it("renders bottom-docked terminal through a vertical splitter with the default terminal size", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    const split = await screen.findByTestId("resizable-split");
    expect(split).toHaveAttribute("data-orientation", "vertical");
    expect(split).toHaveAttribute("data-size", "320");
    expect(split).toHaveAttribute("data-default-size", "320");
    expect(split).toHaveAttribute("data-class-name", expect.stringContaining("flex-col-reverse"));
    expect(capturedBottomPanelProps?.dockMode).toBe("bottom");
    expect(capturedBottomPanelProps?.onDockModeChange).toEqual(expect.any(Function));
  });

  it("switches to right dock, uses horizontal splitter, and restores persisted terminal size", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    await user.click(screen.getByRole("button", { name: /dock right/i }));
    await waitFor(() => {
      expect(screen.getByTestId("resizable-split")).toHaveAttribute(
        "data-orientation",
        "horizontal"
      );
    });
    expect(screen.getByTestId("resizable-split")).toHaveAttribute("data-size", "320");
    expect(screen.getByTestId("resizable-split")).toHaveAttribute(
      "data-class-name",
      expect.stringContaining("flex-row-reverse")
    );
    expect(capturedBottomPanelProps?.dockMode).toBe("right");

    await user.click(screen.getByRole("button", { name: /resize terminal/i }));
    await waitFor(() => {
      expect(screen.getByTestId("resizable-split")).toHaveAttribute("data-size", "456");
    });

    unmount();
    capturedBottomPanelProps = null;

    render(<EditorShell />);
    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    await waitFor(() => {
      expect(screen.getByTestId("resizable-split")).toHaveAttribute(
        "data-orientation",
        "horizontal"
      );
    });
    expect(screen.getByTestId("resizable-split")).toHaveAttribute("data-size", "456");
    expect((capturedBottomPanelProps as { dockMode?: unknown } | null)?.dockMode).toBe("right");
  });
});
