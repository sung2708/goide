import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConcurrencyConfidence } from "../../lib/ipc/types";
import type { LensConstruct } from "../../features/concurrency/lensTypes";
import EditorShell from "./EditorShell";

const openMock = vi.fn();
const readWorkspaceFileMock = vi.fn();
const getRuntimeAvailabilityMock = vi.fn();
const runWorkspaceFileWithRaceMock = vi.fn();
const runWorkspaceFileMock = vi.fn();
let mockFileToOpen = "main.go";
let mockConstructs: LensConstruct[] = [
  {
    kind: "channel",
    line: 1,
    column: 1,
    symbol: "jobs",
    scopeKey: null,
    confidence: ConcurrencyConfidence.Predicted,
  },
];
let runOutputListener:
  | ((event: { payload: { runId: string; line: string; stream: "stdout" | "stderr" | "exit"; exitCode?: number } }) => void)
  | null = null;

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (
    eventName: string,
    callback: (event: {
      payload: { runId: string; line: string; stream: "stdout" | "stderr" | "exit"; exitCode?: number };
    }) => void
  ) => {
    if (eventName === "run-output") {
      runOutputListener = callback;
    }
    return () => {
      runOutputListener = null;
    };
  },
}));

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
    getRuntimeAvailability: (...args: unknown[]) =>
      getRuntimeAvailabilityMock(...args),
    runWorkspaceFileWithRace: (...args: unknown[]) =>
      runWorkspaceFileWithRaceMock(...args),
    runWorkspaceFile: (...args: unknown[]) => runWorkspaceFileMock(...args),
    activateScopedDeepTrace: vi.fn().mockResolvedValue({
      ok: true,
      data: { mode: "deep-trace", scopeKey: "scope-a" },
    }),
    startDebugSession: vi.fn().mockResolvedValue({
      ok: true,
      data: { mode: "deep-trace", scopeKey: "runtime_session" },
    }),
    getRuntimeSignals: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  };
});

vi.mock("../../features/concurrency/useLensSignals", () => ({
  useLensSignals: () => ({
    detectedConstructs: mockConstructs,
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
        <button type="button" onClick={() => onOpenFile(mockFileToOpen)}>
          Open Mock File
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("./CodeEditor", () => ({
  default: ({
    onSelectionLineChange,
  }: {
    onSelectionLineChange?: (line: number | null) => void;
  }) => (
    <div data-testid="mock-code-editor">
      <button type="button" onClick={() => onSelectionLineChange?.(1)}>
        Select Line 1
      </button>
    </div>
  ),
}));

describe("EditorShell race run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runOutputListener = null;
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "available" },
    });
    runWorkspaceFileWithRaceMock.mockResolvedValue({ ok: true });
    runWorkspaceFileMock.mockResolvedValue({ ok: true });
    mockFileToOpen = "main.go";
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: "jobs",
        scopeKey: null,
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
  });

  it("runs go with race mode from command palette and surfaces confirmed race signal", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    await user.click(screen.getByRole("button", { name: /show command palette/i }));
    await user.click(
      (await screen.findAllByRole("button", { name: /run active go file with race detector/i }))[1]
    );

    await waitFor(() => {
      expect(runWorkspaceFileWithRaceMock).toHaveBeenCalledTimes(1);
    });

    const runId = runWorkspaceFileWithRaceMock.mock.calls[0]?.[2] as string;
    expect(typeof runId).toBe("string");
    expect(runId.length).toBeGreaterThan(0);
    expect(runWorkspaceFileWithRaceMock).toHaveBeenCalledWith(
      "C:/workspace",
      "main.go",
      runId
    );
    expect(runOutputListener).not.toBeNull();

    runOutputListener?.({
      payload: {
        runId,
        line: "WARNING: DATA RACE",
        stream: "stderr",
      },
    });
    runOutputListener?.({
      payload: {
        runId,
        line: "C:/workspace/main.go:1 +0x123",
        stream: "stderr",
      },
    });
    runOutputListener?.({
      payload: {
        runId,
        line: "Process exited with code 66.",
        stream: "exit",
        exitCode: 66,
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Race Detector")).toBeInTheDocument();
      expect(screen.getAllByText("Race CLI").length).toBeGreaterThan(0);
    });
  }, 15000);

  it("surfaces confirmed race signal on selected line without a predicted hint", async () => {
    const user = userEvent.setup();
    mockConstructs = [];
    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    await user.click(screen.getByRole("button", { name: /show command palette/i }));
    await user.click(
      (await screen.findAllByRole("button", { name: /run active go file with race detector/i }))[1]
    );

    await waitFor(() => {
      expect(runWorkspaceFileWithRaceMock).toHaveBeenCalledTimes(1);
    });
    const runId = runWorkspaceFileWithRaceMock.mock.calls[0]?.[2] as string;

    runOutputListener?.({
      payload: { runId, line: "WARNING: DATA RACE", stream: "stderr" },
    });
    runOutputListener?.({
      payload: { runId, line: "main.go:1 +0x123", stream: "stderr" },
    });
    runOutputListener?.({
      payload: {
        runId,
        line: "Process exited with code 66.",
        stream: "exit",
        exitCode: 66,
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Race Detector")).toBeInTheDocument();
      expect(screen.getAllByText("Race CLI").length).toBeGreaterThan(0);
    });
  });

  it("clears prior race-confirmed signal when a standard run starts", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    await user.click(screen.getByRole("button", { name: /show command palette/i }));
    await user.click(
      (await screen.findAllByRole("button", { name: /run active go file with race detector/i }))[1]
    );

    await waitFor(() => {
      expect(runWorkspaceFileWithRaceMock).toHaveBeenCalledTimes(1);
    });
    const raceRunId = runWorkspaceFileWithRaceMock.mock.calls[0]?.[2] as string;

    runOutputListener?.({
      payload: { runId: raceRunId, line: "WARNING: DATA RACE", stream: "stderr" },
    });
    runOutputListener?.({
      payload: { runId: raceRunId, line: "main.go:1 +0x123", stream: "stderr" },
    });
    runOutputListener?.({
      payload: {
        runId: raceRunId,
        line: "Process exited with code 66.",
        stream: "exit",
        exitCode: 66,
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Race Detector")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^run active go file$/i }));
    await waitFor(() => {
      expect(runWorkspaceFileMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByText("Race Detector")).toBeNull();
  });

  it("attributes race findings to the original run target file even after active file switch", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    await user.click(screen.getByRole("button", { name: /show command palette/i }));
    await user.click(
      (await screen.findAllByRole("button", { name: /run active go file with race detector/i }))[1]
    );
    await waitFor(() => {
      expect(runWorkspaceFileWithRaceMock).toHaveBeenCalledTimes(1);
    });
    const raceRunId = runWorkspaceFileWithRaceMock.mock.calls[0]?.[2] as string;

    mockFileToOpen = "other.go";
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    runOutputListener?.({
      payload: { runId: raceRunId, line: "WARNING: DATA RACE", stream: "stderr" },
    });
    runOutputListener?.({
      payload: {
        runId: raceRunId,
        line: "C:/workspace/main.go:1 +0x123",
        stream: "stderr",
      },
    });
    runOutputListener?.({
      payload: {
        runId: raceRunId,
        line: "Process exited with code 66.",
        stream: "exit",
        exitCode: 66,
      },
    });

    expect(screen.queryByText("Race Detector")).toBeNull();

    mockFileToOpen = "main.go";
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    await waitFor(() => {
      expect(screen.getByText("Race Detector")).toBeInTheDocument();
      expect(screen.getAllByText("Race CLI").length).toBeGreaterThan(0);
    });
  });

  it("parses race stack file paths containing spaces", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    await user.click(screen.getByRole("button", { name: /show command palette/i }));
    await user.click(
      (await screen.findAllByRole("button", { name: /run active go file with race detector/i }))[1]
    );
    await waitFor(() => {
      expect(runWorkspaceFileWithRaceMock).toHaveBeenCalledTimes(1);
    });
    const raceRunId = runWorkspaceFileWithRaceMock.mock.calls[0]?.[2] as string;

    runOutputListener?.({
      payload: { runId: raceRunId, line: "WARNING: DATA RACE", stream: "stderr" },
    });
    runOutputListener?.({
      payload: {
        runId: raceRunId,
        line: "C:/workspace with spaces/main.go:1 +0x123",
        stream: "stderr",
      },
    });
    runOutputListener?.({
      payload: {
        runId: raceRunId,
        line: "Process exited with code 66.",
        stream: "exit",
        exitCode: 66,
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Race Detector")).toBeInTheDocument();
      expect(screen.getAllByText("Race CLI").length).toBeGreaterThan(0);
    });
  });

  it("clears captured race findings when switching workspace", async () => {
    const user = userEvent.setup();
    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    await user.click(screen.getByRole("button", { name: /show command palette/i }));
    await user.click(
      (await screen.findAllByRole("button", { name: /run active go file with race detector/i }))[1]
    );
    await waitFor(() => {
      expect(runWorkspaceFileWithRaceMock).toHaveBeenCalledTimes(1);
    });
    const raceRunId = runWorkspaceFileWithRaceMock.mock.calls[0]?.[2] as string;

    runOutputListener?.({
      payload: { runId: raceRunId, line: "WARNING: DATA RACE", stream: "stderr" },
    });
    runOutputListener?.({
      payload: {
        runId: raceRunId,
        line: "C:/workspace/main.go:1 +0x123",
        stream: "stderr",
      },
    });
    runOutputListener?.({
      payload: {
        runId: raceRunId,
        line: "Process exited with code 66.",
        stream: "exit",
        exitCode: 66,
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Race Detector")).toBeInTheDocument();
    });

    openMock.mockResolvedValueOnce("C:/workspace-2");
    await user.click(screen.getByRole("button", { name: /open workspace folder/i }));
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    expect(screen.queryByText("Race Detector")).toBeNull();
  });

  it("does not render header Run Race button for non-go active files", async () => {
    const user = userEvent.setup();
    mockFileToOpen = "README.md";
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: "jobs",
        scopeKey: null,
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "# readme\n" });
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "unavailable" },
    });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    expect(
      screen.queryAllByRole("button", { name: /run active go file with race detector/i })
    ).toHaveLength(0);
  });
});
