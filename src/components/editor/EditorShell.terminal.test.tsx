/**
 * EditorShell terminal wiring tests.
 *
 * Focuses on the contract between EditorShell and BottomPanel when a file is
 * opened and Run is clicked: the logs tab should be activated and the bottom
 * panel should receive the correct surfaceKey (editor:<relativePath>).
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";

// ---- IPC mocks ----

const openMock = vi.fn();
const readWorkspaceFileMock = vi.fn();
const getRuntimeAvailabilityMock = vi.fn();
const runWorkspaceFileMock = vi.fn();
const startWorkspaceFsWatchMock = vi.fn();
const listenMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => listenMock(...args),
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
    startWorkspaceFsWatch: (...args: unknown[]) =>
      startWorkspaceFsWatchMock(...args),
    ensureShellSession: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        shellSessionId: "session-x",
        reused: false,
        shellHealth: "launch",
        selectedShell: null,
        replay: "",
      },
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
    explorerRevision,
  }: {
    workspacePath: string | null;
    onOpenFile: (relativePath: string) => void;
    explorerRevision?: number;
  }) => (
    <div>
      <span data-testid="explorer-revision">{explorerRevision ?? 0}</span>
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
    const surfaceKey = props.surfaceKey as string | null;
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
        <span data-testid="shell-session-key">{surfaceKey ?? "none"}</span>
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
        <button
          type="button"
          onClick={() => onDockModeChange?.("bottom")}
          aria-label="Dock bottom"
        >
          Dock Bottom
        </button>
      </div>
    );
  },
}));

vi.mock("../layout/ResizableSplit", () => ({
  default: (props: Record<string, unknown>) => {
    const onResize = props.onResize as (size: number) => void;
    const isSidebarSplit = props.defaultSize === 240;
    return (
      <div
        data-testid={isSidebarSplit ? "sidebar-resizable-split" : "resizable-split"}
        data-orientation={props.orientation as string}
        data-size={String(props.size)}
        data-default-size={String(props.defaultSize)}
        data-min-size={String(props.minSize)}
        data-max-size={String(props.maxSize)}
        data-class-name={(props.className as string | undefined) ?? ""}
      >
        <div data-testid="split-primary">{props.primary as ReactNode}</div>
        <button
          type="button"
          onClick={() => onResize(456)}
          aria-label={isSidebarSplit ? "Resize sidebar" : "Resize terminal"}
        >
          Resize
        </button>
        <div data-testid="split-secondary">{props.secondary as ReactNode}</div>
      </div>
    );
  },
}));

describe("EditorShell terminal wiring", () => {
  const openWorkspaceAndShowExplorer = async (
    user: ReturnType<typeof userEvent.setup>
  ) => {
    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(screen.getByRole("button", { name: /explorer/i }));
  };

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
    startWorkspaceFsWatchMock.mockResolvedValue({
      ok: true,
      data: { workspaceRoot: "C:/workspace", mode: "watch" },
    });
    listenMock.mockResolvedValue(() => {});
  });

  it("opens workspace, opens file, clicks run, and BottomPanel receives the workspace-shell surfaceKey", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    // Open workspace
    await openWorkspaceAndShowExplorer(user);

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

    // surfaceKey is the stable workspace-owned key, not file-derived
    expect(screen.getByTestId("shell-session-key")).toHaveTextContent(
      "workspace-shell"
    );
  });

  it("uses the stable workspace-shell surfaceKey when a workspace and file are open", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    await waitFor(() => {
      expect(capturedBottomPanelProps).not.toBeNull();
    });

    expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");
  });

  it("passes workspacePath to BottomPanel", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    await waitFor(() => {
      expect(capturedBottomPanelProps).not.toBeNull();
    });

    expect(capturedBottomPanelProps?.workspacePath).toBe("C:/workspace");
  });

  /**
   * WORKSPACE-SHELL STABILITY:
   * surfaceKey is now the workspace-owned `workspace-shell` key.
   * Switching between files must not change the key at all — the same PTY
   * session remains active regardless of which file is open.
   */
  it("surfaceKey stays workspace-shell regardless of file switches", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    // Open workspace
    await openWorkspaceAndShowExplorer(user);

    // Open main.go
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    // Trigger the bottom panel so we can observe the session key
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);
    await waitFor(() => {
      expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();
    });
    expect(screen.getByTestId("shell-session-key")).toHaveTextContent("workspace-shell");
    const firstKey = capturedBottomPanelProps?.surfaceKey;

    // Switch to other.go — key must remain workspace-shell
    await user.click(screen.getByRole("button", { name: /open other file/i }));
    await waitFor(() => {
      expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");
    });

    // Switch back to main.go — key still workspace-shell (same as it always was)
    await user.click(screen.getByRole("button", { name: /open mock file/i }));
    await waitFor(() => {
      expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");
    });

    // Key is identical throughout all file switches
    expect(capturedBottomPanelProps?.surfaceKey).toBe(firstKey);
    expect(screen.getByTestId("shell-session-key")).toHaveTextContent("workspace-shell");
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
   *   - surfaceKey on the panel props is preserved unchanged.
   *   - activeTab on the panel props is preserved unchanged.
   */
  it("hide/show of the bottom panel keeps BottomPanel mounted and preserves shell tab state", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    // Open workspace and file
    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    // Open the panel via run (sets logs tab + opens panel)
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    await waitFor(() => {
      expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();
    });

    const mountCountAfterOpen = bottomPanelMountCount;
    expect(mountCountAfterOpen).toBeGreaterThanOrEqual(1);

    // Capture state before closing
    const sessionKeyBeforeClose = capturedBottomPanelProps?.surfaceKey;
    expect(sessionKeyBeforeClose).toBe("workspace-shell");

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

    // surfaceKey and activeTab must still be the same (no prop reset)
    expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");
    expect(capturedBottomPanelProps?.activeTab).toBe("shell");

    // Re-open the panel via the status bar TERMINAL toggle button.
    // This does NOT change bottomPanelTab, so activeTab remains "shell".
    await user.click(screen.getByRole("button", { name: /show terminal panel/i }));

    await waitFor(() => {
      // The panel should be visible again (the hidden wrapper is removed)
      expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");
    });

    // Still no extra mount — same React component instance throughout.
    expect(bottomPanelMountCount).toBe(mountCountAfterOpen);
    // Shell session key must be the workspace-owned stable key.
    expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");
    // Active tab is still shell (we didn't click Run again, just toggled panel visibility)
    expect(capturedBottomPanelProps?.activeTab).toBe("shell");
  });

  it("preserves shell state (surfaceKey) after stopping a run and switching to the shell tab", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    // Open workspace and file
    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    // Start a run so the bottom panel opens on logs tab
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    await waitFor(() => {
      expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();
      expect(screen.getByTestId("active-tab")).toHaveTextContent("logs");
    });

    // surfaceKey is the stable workspace-owned key
    expect(screen.getByTestId("shell-session-key")).toHaveTextContent("workspace-shell");

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

    // After switching to shell tab, surfaceKey must still be workspace-shell
    await waitFor(() => {
      expect(screen.getByTestId("active-tab")).toHaveTextContent("shell");
    });

    expect(screen.getByTestId("shell-session-key")).toHaveTextContent("workspace-shell");
    expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");
  });

  it("renders bottom-docked terminal through a vertical splitter with the default terminal size", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    const split = await screen.findByTestId("resizable-split");
    expect(split).toHaveAttribute("data-orientation", "vertical");
    // default terminalBottom size is 320
    expect(split).toHaveAttribute("data-size", "320");
    expect(split).toHaveAttribute("data-default-size", "320");
    expect(split).toHaveAttribute("data-class-name", expect.stringContaining("flex-col-reverse"));
    expect(capturedBottomPanelProps?.dockMode).toBe("bottom");
    expect(capturedBottomPanelProps?.onDockModeChange).toEqual(expect.any(Function));
  });

  it("switches to right dock, uses horizontal splitter, and restores persisted terminal size", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    await user.click(screen.getByRole("button", { name: /dock right/i }));
    await waitFor(() => {
      expect(screen.getByTestId("resizable-split")).toHaveAttribute(
        "data-orientation",
        "horizontal"
      );
    });
    // After switching to right, terminalSize should be the right default (480)
    expect(screen.getByTestId("resizable-split")).toHaveAttribute("data-size", "480");
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
    await openWorkspaceAndShowExplorer(user);
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

  /**
   * TASK 3 — dock-specific terminal sizes:
   * Switching dock modes must preserve separate saved sizes, and the editor
   * workbench (`data-testid="editor-workbench"`) must remain mounted
   * (not remount) throughout the entire dock mode switch cycle.
   */
  it("editor workbench stays mounted while switching dock modes and sizes are dock-specific", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);

    await waitFor(() => {
      expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();
    });

    // Editor workbench must be present in bottom dock mode
    const workbench = screen.getByTestId("editor-workbench");
    expect(workbench).toBeInTheDocument();

    // Resize in bottom mode
    await user.click(screen.getByRole("button", { name: /resize terminal/i }));
    await waitFor(() => {
      expect(screen.getByTestId("resizable-split")).toHaveAttribute("data-size", "456");
    });
    const bottomSize = "456";

    // Switch to right dock
    await user.click(screen.getByRole("button", { name: /dock right/i }));
    await waitFor(() => {
      expect(screen.getByTestId("resizable-split")).toHaveAttribute(
        "data-orientation",
        "horizontal"
      );
    });

    // Editor workbench must still be the SAME element (not remounted)
    expect(screen.getByTestId("editor-workbench")).toBe(workbench);

    // Right dock should show its own default size (480), NOT the bottom size (456)
    expect(screen.getByTestId("resizable-split")).not.toHaveAttribute("data-size", bottomSize);
    expect(screen.getByTestId("resizable-split")).toHaveAttribute("data-size", "480");

    // Switch back to bottom dock and ensure the previous bottom-dock size is restored
    await user.click(screen.getByRole("button", { name: /dock bottom/i }));
    await waitFor(() => {
      expect(screen.getByTestId("resizable-split")).toHaveAttribute(
        "data-orientation",
        "vertical"
      );
    });
    expect(screen.getByTestId("editor-workbench")).toBe(workbench);
    expect(screen.getByTestId("resizable-split")).toHaveAttribute("data-size", bottomSize);
  });

  /**
   * TASK 2 — workspace-owned shell key:
   * When a workspace is open, EditorShell must use a stable key
   * (`workspace-shell`) rather than `editor:<activeFilePath>`.
   * Switching files within the same workspace must NOT change the surfaceKey.
   */
  it("uses workspace-shell surfaceKey regardless of which file is open", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);

    // Open first file
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    // Trigger run so the bottom panel renders
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);
    await waitFor(() => {
      expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();
    });

    // surfaceKey must be the workspace-owned stable key, not file-derived
    expect(screen.getByTestId("shell-session-key")).toHaveTextContent("workspace-shell");
    expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");

    // Switch to another file
    await user.click(screen.getByRole("button", { name: /open other file/i }));

    // surfaceKey must remain workspace-shell after file switch
    await waitFor(() => {
      expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");
    });
    expect(screen.getByTestId("shell-session-key")).toHaveTextContent("workspace-shell");

    // Switch back to original file — still workspace-shell
    await user.click(screen.getByRole("button", { name: /open mock file/i }));
    await waitFor(() => {
      expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");
    });
  });

  /**
   * TASK 2 — no remount on file switch:
   * BottomPanel (and therefore ShellTerminalView) must not remount when the
   * user switches between files within the same workspace.  The shell surface
   * is workspace-owned, so it must be stable across file changes.
   */
  it("does not remount BottomPanel when switching files and surfaceKey stays workspace-shell", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);

    // Open first file and trigger bottom panel
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click((await screen.findAllByRole("button", { name: /run active go file/i }))[0]);
    await waitFor(() => {
      expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();
    });

    const mountCountAfterFirstFile = bottomPanelMountCount;
    expect(mountCountAfterFirstFile).toBeGreaterThanOrEqual(1);
    expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");

    // Switch to another file
    await user.click(screen.getByRole("button", { name: /open other file/i }));
    await waitFor(() => {
      // activeFilePath should have changed (editor title updates)
      expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");
    });

    // BottomPanel must NOT have remounted — same component instance throughout
    expect(bottomPanelMountCount).toBe(mountCountAfterFirstFile);

    // Switch back
    await user.click(screen.getByRole("button", { name: /open mock file/i }));
    await waitFor(() => {
      expect(capturedBottomPanelProps?.surfaceKey).toBe("workspace-shell");
    });

    // Still no extra mount
    expect(bottomPanelMountCount).toBe(mountCountAfterFirstFile);
  });

  it("starts workspace fs sync and refreshes explorer only for active workspace changes", async () => {
    const user = userEvent.setup();
    let fsChangeHandler:
      | ((event: { payload: { workspaceRoot: string } }) => void)
      | null = null;
    listenMock.mockImplementation(async (eventName, handler) => {
      if (eventName === "workspace-fs-changed") {
        fsChangeHandler = handler as typeof fsChangeHandler;
      }
      return () => {};
    });

    render(<EditorShell />);

    await user.click(screen.getByRole("button", { name: /explorer/i }));
    expect(screen.getByTestId("explorer-revision")).toHaveTextContent("0");
    await openWorkspaceAndShowExplorer(user);

    await waitFor(() => {
      expect(startWorkspaceFsWatchMock).toHaveBeenCalledWith("C:/workspace");
      expect(listenMock).toHaveBeenCalledWith(
        "workspace-fs-changed",
        expect.any(Function)
      );
    });

    await act(async () => {
      fsChangeHandler?.({ payload: { workspaceRoot: "C:/other" } });
    });
    expect(screen.getByTestId("explorer-revision")).toHaveTextContent("0");

    await act(async () => {
      fsChangeHandler?.({ payload: { workspaceRoot: "C:/workspace" } });
    });

    await waitFor(() => {
      expect(screen.getByTestId("explorer-revision")).toHaveTextContent("1");
    });
  });
});
