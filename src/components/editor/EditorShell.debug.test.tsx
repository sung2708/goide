import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";
import { startDebugSession } from "../../lib/ipc/client";
import type { DebuggerState } from "../../lib/ipc/types";

const openMock = vi.fn();
const readWorkspaceFileMock = vi.fn();
const getRuntimeAvailabilityMock = vi.fn();
const getDebuggerStateMock = vi.fn();
const deactivateDeepTraceMock = vi.fn();
const debuggerToggleBreakpointMock = vi.fn();

let mockDebuggerState: DebuggerState = {
  sessionActive: false,
  paused: false,
  activeRelativePath: null,
  activeLine: null,
  activeColumn: null,
  breakpoints: [],
};

function setMockDebuggerState(overrides: Partial<DebuggerState>) {
  mockDebuggerState = {
    ...mockDebuggerState,
    ...overrides,
  };
}

function getDebuggerStateMockResult() {
  return mockDebuggerState;
}

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

// xterm cannot run in jsdom (no matchMedia / canvas). Mock so BottomPanel
// → LogsTerminalView → TerminalSurface does not throw.
vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
    loadAddon: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    cols: 120,
    rows: 40,
  })),
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn() })),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (
    _eventName: string,
    _callback: unknown
  ) => {
    return () => {};
  },
}));

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
    getRuntimeAvailability: (...args: unknown[]) =>
      getRuntimeAvailabilityMock(...args),
    getDebuggerState: (...args: unknown[]) => getDebuggerStateMock(...args),
    debuggerToggleBreakpoint: (...args: unknown[]) =>
      debuggerToggleBreakpointMock(...args),
    deactivateDeepTrace: (...args: unknown[]) => deactivateDeepTraceMock(...args),
    startDebugSession: vi.fn().mockResolvedValue({
      ok: true,
      data: { mode: "deep-trace", scopeKey: "runtime_session" },
    }),
    getWorkspaceGitSnapshot: vi.fn().mockResolvedValue({
      ok: true,
      data: { branch: "main", changedFiles: [], commits: [] },
    }),
    getWorkspaceBranches: vi.fn().mockResolvedValue({
      ok: false,
    }),
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
        <button type="button" onClick={() => onOpenFile("main.go")}>
          Open Mock File
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("./CodeEditor", () => ({
  default: ({
    onToggleBreakpoint,
  }: {
    onToggleBreakpoint?: (line: number) => void;
  }) => (
    <div data-testid="mock-code-editor">
      <button type="button" onClick={() => onToggleBreakpoint?.(12)}>
        Toggle Mock Breakpoint 12
      </button>
    </div>
  ),
}));

async function toggleMockBreakpointAtLine(line: number) {
  const button = await screen.findByRole("button", {
    name: new RegExp(`toggle mock breakpoint ${line}`, "i"),
  });
  await userEvent.click(button);
}

describe("EditorShell debug controller", () => {
  const openWorkspaceAndShowExplorer = async (
    user: ReturnType<typeof userEvent.setup>
  ) => {
    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(screen.getByRole("button", { name: /explorer/i }));
  };

  const openWorkspaceOpenGoFileAndSwitchToDebugTab = async (
    user: ReturnType<typeof userEvent.setup>
  ) => {
    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    // The debug tab should now be visible since main.go is a .go file
    await user.click(await screen.findByRole("button", { name: /^debug$/i }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "unavailable" },
    });
    mockDebuggerState = {
      sessionActive: false,
      paused: false,
      activeRelativePath: null,
      activeLine: null,
      activeColumn: null,
      breakpoints: [],
    };
    getDebuggerStateMock.mockImplementation(async () => ({
      ok: true,
      data: mockDebuggerState,
    }));
    deactivateDeepTraceMock.mockResolvedValue({
      ok: true,
      data: null,
    });
    debuggerToggleBreakpointMock.mockImplementation(
      async ({ relativePath, line }: { relativePath: string; line: number }) => {
        const existing = mockDebuggerState.breakpoints.some(
          (breakpoint) =>
            breakpoint.relativePath === relativePath && breakpoint.line === line
        );
        const breakpoints = existing
          ? mockDebuggerState.breakpoints.filter(
              (breakpoint) =>
                breakpoint.relativePath !== relativePath || breakpoint.line !== line
            )
          : [...mockDebuggerState.breakpoints, { relativePath, line }];
        setMockDebuggerState({ breakpoints });
        return { ok: true, data: mockDebuggerState };
      }
    );
    vi.mocked(startDebugSession).mockResolvedValue({
      ok: true,
      data: { mode: "deep-trace", scopeKey: "runtime_session" },
    });
  });

  it("shows a dedicated debug failure modal when debug start fails", async () => {
    const user = userEvent.setup();
    vi.mocked(startDebugSession).mockResolvedValue({
      ok: false,
      error: {
        code: "debug_session_start_failed",
        message: "Delve is not installed or not on PATH.",
      },
    });

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    expect(await screen.findByRole("dialog", { name: /unable to start debug session/i })).toBeInTheDocument();
    expect(screen.getByText(/Delve is not installed/i)).toBeInTheDocument();
  });

  it("shows the failure modal when debug start throws", async () => {
    const user = userEvent.setup();
    vi.mocked(startDebugSession).mockRejectedValue(new Error("Transport unavailable"));

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    expect(
      await screen.findByRole("dialog", { name: /unable to start debug session/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/transport unavailable/i)).toBeInTheDocument();
  });

  it("sets debugUiState back to idle when the failure dialog is dismissed", async () => {
    const user = userEvent.setup();
    vi.mocked(startDebugSession).mockResolvedValue({
      ok: false,
      error: {
        code: "debug_session_start_failed",
        message: "Delve is not installed or not on PATH.",
      },
    });

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    const dialog = await screen.findByRole("dialog", { name: /unable to start debug session/i });
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(screen.queryByRole("dialog", { name: /unable to start debug session/i })).toBeNull();

    // The debug button should be re-enabled (not starting state)
    expect(screen.getByRole("button", { name: /debug active go file/i })).not.toBeDisabled();
  });

  it("does not show the failure dialog when debug start succeeds", async () => {
    const user = userEvent.setup();
    vi.mocked(startDebugSession).mockResolvedValue({
      ok: true,
      data: { mode: "deep-trace", scopeKey: "runtime_session" },
    });

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    expect(screen.queryByRole("dialog", { name: /unable to start debug session/i })).toBeNull();
  });

  it("preserves gutter breakpoints into the next debug session", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await toggleMockBreakpointAtLine(12);
    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    expect(startDebugSession).toHaveBeenCalled();
    expect(getDebuggerStateMockResult().breakpoints).toContainEqual({
      relativePath: "main.go",
      line: 12,
    });

    // While debug is active, toggling the same gutter breakpoint should remain synchronized.
    await toggleMockBreakpointAtLine(12);
    expect(getDebuggerStateMockResult().breakpoints).not.toContainEqual({
      relativePath: "main.go",
      line: 12,
    });
  });

  it("disables run and race actions while debug start is in progress", async () => {
    const user = userEvent.setup();
    let resolveStart: () => void = () => {};
    vi.mocked(startDebugSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStart = () =>
            resolve({ ok: true, data: { mode: "deep-trace", scopeKey: "runtime_session" } });
        })
    );

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^run active go file$/i })).toBeDisabled()
    );
    expect(screen.getByRole("button", { name: /run active go file with race detector/i })).toBeDisabled();

    resolveStart();
  });

  it("renders step controls when the debug session is paused", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    setMockDebuggerState({
      sessionActive: true,
      paused: true,
      activeRelativePath: "main.go",
      activeLine: 12,
      breakpoints: [],
    });

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(screen.getByRole("button", { name: /debug active go file/i }));
    // Navigate to the Debug sidebar tab to see session controls
    await user.click(await screen.findByRole("button", { name: /^debug$/i }));

    expect(await screen.findByRole("button", { name: /step over/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /step into/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /step out/i })).toBeInTheDocument();
  });

  it("keeps debug start disabled while stop is in progress", async () => {
    const user = userEvent.setup();
    let resolveStop: () => void = () => {};
    deactivateDeepTraceMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStop = () => resolve({ ok: true, data: null });
        })
    );
    // Keep session alive so stop controls stay visible
    setMockDebuggerState({ sessionActive: true, paused: false });

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(screen.getByRole("button", { name: /debug active go file/i }));
    // Navigate to the Debug sidebar tab to see session controls
    await user.click(await screen.findByRole("button", { name: /^debug$/i }));

    expect(vi.mocked(startDebugSession)).toHaveBeenCalledTimes(1);
    await screen.findByRole("button", { name: /stop debugging/i });
    fireEvent.keyDown(window, { key: "F5", shiftKey: true });
    await waitFor(() => expect(deactivateDeepTraceMock).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(window, { key: "F5" });
    expect(vi.mocked(startDebugSession)).toHaveBeenCalledTimes(1);

    resolveStop();
  });

  it("recovers from stop errors without remaining in stopping state", async () => {
    const user = userEvent.setup();
    deactivateDeepTraceMock.mockRejectedValueOnce(new Error("stop failed"));
    // Keep session alive so stop controls stay visible
    setMockDebuggerState({ sessionActive: true, paused: false });

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(screen.getByRole("button", { name: /debug active go file/i }));
    // Navigate to the Debug sidebar tab to see session controls
    await user.click(await screen.findByRole("button", { name: /^debug$/i }));

    await screen.findByRole("button", { name: /stop debugging/i });
    fireEvent.keyDown(window, { key: "F5", shiftKey: true });

    await waitFor(() => {
      expect(screen.queryByText(/^Stopping$/i)).toBeNull();
      expect(screen.getByRole("button", { name: /stop debugging/i })).toBeInTheDocument();
    });
  });

  it("stays in debug session when stop returns non-ok response", async () => {
    const user = userEvent.setup();
    deactivateDeepTraceMock.mockResolvedValueOnce({
      ok: false,
      error: { message: "failed to stop debug" },
    });
    // Keep session alive so stop controls stay visible
    setMockDebuggerState({ sessionActive: true, paused: false });

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(screen.getByRole("button", { name: /debug active go file/i }));
    // Navigate to the Debug sidebar tab to see session controls
    await user.click(await screen.findByRole("button", { name: /^debug$/i }));
    await screen.findByRole("button", { name: /stop debugging/i });

    fireEvent.keyDown(window, { key: "F5", shiftKey: true });
    await waitFor(() => expect(deactivateDeepTraceMock).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      expect(screen.queryByText(/^Stopping$/i)).toBeNull();
      expect(screen.getByRole("button", { name: /stop debugging/i })).toBeInTheDocument();
    });
  });

  // ---- New tests for Task 7: contextual debug sidebar tab ----

  it("does not show the Debug activity item when no workspace or file is open", async () => {
    render(<EditorShell />);
    expect(screen.queryByRole("button", { name: /^debug$/i })).toBeNull();
  });

  it("does not show the Debug activity item after opening a workspace but no file", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    // workspace open but no file selected
    expect(screen.queryByRole("button", { name: /^debug$/i })).toBeNull();
  });

  it("shows the Debug activity item after a .go file is opened", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    // main.go is a .go file → debug tab should appear
    expect(await screen.findByRole("button", { name: /^debug$/i })).toBeInTheDocument();
  });

  it("does not show debug controls in the sidebar when the Explorer tab is active", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    // Stay on explorer tab — debug sidebar section must not be visible
    await user.click(screen.getByRole("button", { name: /explorer/i }));
    expect(screen.queryByText(/runtime session/i)).toBeNull();
  });

  it("shows debug controls in the sidebar when the Debug tab is active", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    await openWorkspaceOpenGoFileAndSwitchToDebugTab(user);
    // The debug sidebar section must now be visible
    expect(screen.getByText(/runtime session/i)).toBeInTheDocument();
  });

  it("hides debug controls when switching from Debug tab back to Explorer", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    await openWorkspaceOpenGoFileAndSwitchToDebugTab(user);
    // Confirm debug panel is showing
    expect(screen.getByText(/runtime session/i)).toBeInTheDocument();
    // Switch back to Explorer
    await user.click(screen.getByRole("button", { name: /explorer/i }));
    expect(screen.queryByText(/runtime session/i)).toBeNull();
  });

  it("Start Debug Session button is present in the debug sidebar when no session is running", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);
    await openWorkspaceOpenGoFileAndSwitchToDebugTab(user);
    expect(screen.getByRole("button", { name: /start debug session/i })).toBeInTheDocument();
  });
});
