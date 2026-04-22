import { render, screen } from "@testing-library/react";
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

describe("EditorShell debug controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "unavailable" },
    });
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

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    expect(await screen.findByRole("dialog", { name: /unable to start debug session/i })).toBeInTheDocument();
    expect(screen.getByText(/Delve is not installed/i)).toBeInTheDocument();
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

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    const dialog = await screen.findByRole("dialog", { name: /unable to start debug session/i });
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /dismiss/i }));

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

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(screen.getByRole("button", { name: /debug active go file/i }));

    expect(screen.queryByRole("dialog", { name: /unable to start debug session/i })).toBeNull();
  });
});
