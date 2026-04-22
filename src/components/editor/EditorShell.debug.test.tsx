import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";
import { startDebugSession } from "../../lib/ipc/client";

const openMock = vi.fn();
const readWorkspaceFileMock = vi.fn();
const getRuntimeAvailabilityMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
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
    deactivateDeepTrace: vi.fn().mockResolvedValue({ ok: true }),
    getDebuggerState: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        sessionActive: false,
        paused: false,
        activeRelativePath: null,
        activeLine: null,
        activeColumn: null,
        breakpoints: [],
      },
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
  default: () => <div data-testid="mock-code-editor" />,
}));

/** Helper: open a workspace and a Go file so debug controls are reachable. */
async function setupWithGoFile() {
  const user = userEvent.setup();
  render(<EditorShell />);

  await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
  await user.click(await screen.findByRole("button", { name: /open mock file/i }));

  return user;
}

describe("EditorShell debug controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "available" },
    });
    vi.mocked(startDebugSession).mockResolvedValue({
      ok: true,
      data: { mode: "deep-trace", scopeKey: "runtime_session" },
    });
  });

  // -----------------------------------------------------------------------
  // Existing regression: stop returns to idle
  // -----------------------------------------------------------------------
  it("returns the debug UI state to idle after a successful stop", async () => {
    const user = await setupWithGoFile();

    await user.click(screen.getByRole("button", { name: /debug active go file/i }));
    expect(vi.mocked(startDebugSession)).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /stop debugging/i }));

    expect(screen.getByRole("button", { name: /debug active go file/i })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /stop debugging/i })).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Task 4: dedicated failure modal on start failure
  // -----------------------------------------------------------------------
  it("shows the dedicated debug failure modal when start fails", async () => {
    vi.mocked(startDebugSession).mockResolvedValue({
      ok: false,
      error: { code: "DLV_LAUNCH_FAILED", message: "dlv not found in PATH" },
    });

    const user = await setupWithGoFile();

    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    const dialog = await screen.findByRole("dialog", { name: /debug start failed/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("dlv not found in PATH");
  });

  it("does not show the failure modal on a successful debug start", async () => {
    // startDebugSession resolves with ok:true (default beforeEach mock)
    const user = await setupWithGoFile();

    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    // Give async resolution a tick
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /debug start failed/i })).toBeNull();
    });
  });

  it("dismissing the failure modal returns state to idle and hides the modal", async () => {
    vi.mocked(startDebugSession).mockResolvedValue({
      ok: false,
      error: { code: "BUILD_FAILED", message: "compilation error: undefined: Foo" },
    });

    const user = await setupWithGoFile();

    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    // Modal is visible
    await screen.findByRole("dialog", { name: /debug start failed/i });

    // Dismiss via the close button
    await user.click(screen.getByRole("button", { name: /dismiss debug failure/i }));

    // Modal gone
    expect(screen.queryByRole("dialog", { name: /debug start failed/i })).toBeNull();

    // Debug button restored (idle state)
    expect(screen.getByRole("button", { name: /debug active go file/i })).toBeEnabled();
  });

  it("dismissing via the Dismiss action button also clears the modal and returns to idle", async () => {
    vi.mocked(startDebugSession).mockResolvedValue({
      ok: false,
      error: { code: "TARGET_RESOLUTION_FAILED", message: "no runnable package at path" },
    });

    const user = await setupWithGoFile();

    await user.click(screen.getByRole("button", { name: /debug active go file/i }));
    await screen.findByRole("dialog", { name: /debug start failed/i });

    // The modal has a "Dismiss" button as well as the close icon
    await user.click(screen.getByRole("button", { name: /close debug failure dialog/i }));

    expect(screen.queryByRole("dialog", { name: /debug start failed/i })).toBeNull();
    expect(screen.getByRole("button", { name: /debug active go file/i })).toBeEnabled();
  });

  // -----------------------------------------------------------------------
  // Task 4: start is guarded while already `starting`
  // -----------------------------------------------------------------------
  it("does not call startDebugSession a second time while already starting", async () => {
    // Make startDebugSession hang so we stay in `starting` long enough to
    // attempt the second click.
    let resolveFirst!: (v: Awaited<ReturnType<typeof startDebugSession>>) => void;
    vi.mocked(startDebugSession).mockImplementationOnce(
      () =>
        new Promise<Awaited<ReturnType<typeof startDebugSession>>>((res) => {
          resolveFirst = res;
        })
    );

    const user = await setupWithGoFile();

    // First click — enters `starting`
    void user.click(screen.getByRole("button", { name: /debug active go file/i }));

    // Wait for the button to become disabled (starting state)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /debug active go file/i })).toBeDisabled();
    });

    // Second click on the now-disabled button — should be a no-op
    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    // Resolve the pending start so the component can settle
    resolveFirst({ ok: true, data: { mode: "deep-trace", scopeKey: null } });

    expect(vi.mocked(startDebugSession)).toHaveBeenCalledTimes(1);
  });
});
