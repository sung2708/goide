import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConcurrencyConfidence } from "../../lib/ipc/types";
import type { LensConstruct } from "../../features/concurrency/lensTypes";
import EditorShell from "./EditorShell";

const openMock = vi.fn();
const readWorkspaceFileMock = vi.fn();
const activateScopedDeepTraceMock = vi.fn();
const getRuntimeAvailabilityMock = vi.fn();
const getRuntimeSignalsMock = vi.fn();
let mockFileToOpen = "main.go";
let mockConstructs: LensConstruct[] = [
  {
    kind: "channel" as const,
    line: 1,
    column: 1,
    symbol: null as string | null,
    scopeKey: null as string | null,
    confidence: ConcurrencyConfidence.Predicted,
  },
];
let mockCounterpartMappings: Array<{
  sourceLine: number;
  counterpartLine: number;
  symbol: string;
  confidence: ConcurrencyConfidence;
}> = [];

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
    activateScopedDeepTrace: (...args: unknown[]) =>
      activateScopedDeepTraceMock(...args),
    getRuntimeAvailability: (...args: unknown[]) =>
      getRuntimeAvailabilityMock(...args),
    getRuntimeSignals: (...args: unknown[]) => getRuntimeSignalsMock(...args),
  };
});

vi.mock("../../features/concurrency/useLensSignals", () => ({
  useLensSignals: () => ({
    detectedConstructs: mockConstructs,
    counterpartMappings: mockCounterpartMappings,
    isAnalyzing: false,
    analysisError: null,
  }),
}));

vi.mock("../sidebar/SourceTree", () => ({
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
    onHoverLineChange,
    onSelectionLineChange,
    onModifierClickLine,
    jumpRequest,
    counterpartLine,
  }: {
    onHoverLineChange?: (line: number | null) => void;
    onSelectionLineChange?: (line: number | null) => void;
    onModifierClickLine?: (line: number) => boolean;
    jumpRequest?: { line: number; requestId: number } | null;
    counterpartLine?: number | null;
  }) => (
    <div
      data-testid="mock-code-editor"
      onMouseEnter={() => onHoverLineChange?.(1)}
      onMouseLeave={() => onHoverLineChange?.(null)}
    >
      <button type="button" onClick={() => onSelectionLineChange?.(1)}>
        Select Line 1
      </button>
      <button type="button" onClick={() => onModifierClickLine?.(1)}>
        Modifier Click Line 1
      </button>
      <output data-testid="jump-request-line">{jumpRequest?.line ?? "none"}</output>
      <output data-testid="counterpart-line">{counterpartLine ?? "none"}</output>
    </div>
  ),
}));

describe("EditorShell inline actions", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockFileToOpen = "main.go";
    activateScopedDeepTraceMock.mockResolvedValue({
      ok: true,
      data: { mode: "deep-trace", scopeKey: "default-scope" },
    });
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "available" },
    });
    getRuntimeSignalsMock.mockResolvedValue({
      ok: true,
      data: [],
    });
  });

  it("shows quick actions on hover and hides them immediately on hover out", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: null,
        scopeKey: null,
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    const user = userEvent.setup();
    mockFileToOpen = "main.go";
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    const editor = await screen.findByTestId("mock-code-editor");
    expect(screen.queryByTestId("inline-actions")).toBeNull();

    fireEvent.mouseEnter(editor);
    expect(screen.getByTestId("inline-actions")).toBeInTheDocument();

    fireEvent.mouseLeave(editor);
    await waitFor(() => {
      expect(screen.queryByTestId("inline-actions")).toBeNull();
    });
  });

  it("shows quick actions on selection without hover", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: null,
        scopeKey: null,
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    const user = userEvent.setup();
    mockFileToOpen = "main.go";
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    expect(screen.getByTestId("inline-actions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /jump/i })).toBeDisabled();
  });

  it("enables Jump when counterpart mappings contain the active line", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: "jobs",
        scopeKey: "S1",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [
      {
        sourceLine: 1,
        counterpartLine: 2,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    const user = userEvent.setup();
    mockFileToOpen = "main.go";
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    expect(screen.getByRole("button", { name: /jump/i })).toBeEnabled();
  });

  it("executes Jump action to counterpart line when mapping exists", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: "jobs",
        scopeKey: "S1",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [
      {
        sourceLine: 1,
        counterpartLine: 2,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    const user = userEvent.setup();
    mockFileToOpen = "main.go";
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    await user.click(screen.getByRole("button", { name: /jump/i }));

    expect(screen.getByTestId("jump-request-line")).toHaveTextContent("2");
  });

  it("executes counterpart jump via modifier-click and keeps plain click as non-jump selection", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: "jobs",
        scopeKey: "S1",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [
      {
        sourceLine: 1,
        counterpartLine: 2,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    const user = userEvent.setup();
    mockFileToOpen = "main.go";
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    expect(screen.getByTestId("jump-request-line")).toHaveTextContent("none");

    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    expect(screen.getByTestId("jump-request-line")).toHaveTextContent("none");

    await user.click(await screen.findByRole("button", { name: /modifier click line 1/i }));
    expect(screen.getByTestId("jump-request-line")).toHaveTextContent("2");
  });

  it("jumps to selected line when a summary panel item is clicked", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: "jobs",
        scopeKey: "S1",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    const user = userEvent.setup();
    mockFileToOpen = "main.go";
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(screen.getByRole("button", { name: /summary/i }));

    await user.click(
      await screen.findByRole("button", {
        name: /line 1.*channel op.*predicted.*jobs/i,
      })
    );

    expect(screen.getByTestId("jump-request-line")).toHaveTextContent("1");
  });

  it("keeps Jump disabled when active hint is not the mapped channel construct", async () => {
    mockConstructs = [
      {
        kind: "wait-group",
        line: 1,
        column: 1,
        symbol: null,
        scopeKey: "S1",
        confidence: ConcurrencyConfidence.Predicted,
      },
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: "jobs",
        scopeKey: "S1",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [
      {
        sourceLine: 1,
        counterpartLine: 2,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    const user = userEvent.setup();
    mockFileToOpen = "main.go";
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    expect(screen.getByRole("button", { name: /jump/i })).toBeDisabled();
  });

  it("does not jump on modifier-click when active hint is not a channel", async () => {
    mockConstructs = [
      {
        kind: "wait-group",
        line: 1,
        column: 1,
        symbol: null,
        scopeKey: "S1",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [
      {
        sourceLine: 1,
        counterpartLine: 2,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    const user = userEvent.setup();
    mockFileToOpen = "main.go";
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    await user.click(await screen.findByRole("button", { name: /modifier click line 1/i }));
    expect(screen.getByTestId("jump-request-line")).toHaveTextContent("none");
  });

  it("activates scoped Deep Trace and switches mode on success", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 4,
        symbol: "jobs",
        scopeKey: "flow-A",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    mockFileToOpen = "main.go";
    activateScopedDeepTraceMock.mockResolvedValue({
      ok: true,
      data: { mode: "deep-trace", scopeKey: "flow-A" },
    });
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    await user.click(await screen.findByRole("button", { name: /deep trace/i }));

    await waitFor(() => {
      expect(activateScopedDeepTraceMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Mode: Deep Trace/i)).toBeInTheDocument();
    });

    expect(activateScopedDeepTraceMock).toHaveBeenCalledWith({
      workspaceRoot: "C:/workspace",
      relativePath: "main.go",
      line: 1,
      column: 4,
      constructKind: "channel",
      symbol: "jobs",
      counterpartRelativePath: null,
      counterpartLine: null,
      counterpartColumn: 4,
      counterpartConfidence: null,
    });
  });

  it("keeps quick insight mode when Deep Trace activation fails", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: null,
        scopeKey: null,
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    mockFileToOpen = "main.go";
    activateScopedDeepTraceMock.mockResolvedValue({
      ok: false,
      error: { code: "deep_trace_failed", message: "runtime unavailable" },
    });
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    await user.click(await screen.findByRole("button", { name: /deep trace/i }));

    await waitFor(() => {
      expect(activateScopedDeepTraceMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/Mode: Quick Insight/i)).toBeInTheDocument();
  });

  it("does not activate Deep Trace when runtime is unavailable", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: null,
        scopeKey: null,
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    mockFileToOpen = "README.md";
    activateScopedDeepTraceMock.mockResolvedValue({
      ok: true,
      data: { mode: "deep-trace", scopeKey: null },
    });
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "# notes\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    const deepTraceButton = await screen.findByRole("button", { name: /deep trace/i });
    expect(deepTraceButton).toBeDisabled();
    await user.click(deepTraceButton);
    expect(activateScopedDeepTraceMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Mode: Quick Insight/i)).toBeInTheDocument();
  });

  it("does not fetch runtime signals while mode stays quick insight", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: null,
        scopeKey: null,
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    await waitFor(() => {
      expect(screen.getByText(/Mode: Quick Insight/i)).toBeInTheDocument();
    });
    expect(getRuntimeSignalsMock).not.toHaveBeenCalled();
  });

  it("renders confirmed blocked signal when deep trace runtime evidence is present", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 4,
        symbol: "jobs",
        scopeKey: "flow-A",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    getRuntimeSignalsMock.mockResolvedValue({
      ok: true,
      data: [
        {
          threadId: 1,
          status: "chan receive",
          waitReason: "chan receive",
          confidence: ConcurrencyConfidence.Confirmed,
          scopeKey: "default-scope",
          relativePath: "main.go",
          line: 1,
          column: 4,
        },
      ],
    });
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    await user.click(await screen.findByRole("button", { name: /deep trace/i }));

    await waitFor(() => {
      expect(getRuntimeSignalsMock).toHaveBeenCalled();
      expect(screen.getByText(/Mode: Deep Trace/i)).toBeInTheDocument();
      expect(screen.getByTestId("trace-bubble-blocked-indicator")).toBeInTheDocument();
      expect(screen.getByText("Confirmed")).toBeInTheDocument();
    });
  });

  it("prefers runtime counterpart mapping over static mapping in deep trace mode", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 4,
        symbol: "jobs",
        scopeKey: "flow-A",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [
      {
        sourceLine: 1,
        counterpartLine: 2,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    getRuntimeSignalsMock.mockResolvedValue({
      ok: true,
      data: [
        {
          threadId: 8,
          status: "chan receive",
          waitReason: "chan receive",
          confidence: ConcurrencyConfidence.Confirmed,
          scopeKey: "default-scope",
          relativePath: "main.go",
          line: 1,
          column: 4,
          counterpartRelativePath: "main.go",
          counterpartLine: 5,
          counterpartColumn: 2,
          counterpartConfidence: ConcurrencyConfidence.Likely,
        },
      ],
    });
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({
      ok: true,
      data: "package main\nline2\nline3\nline4\nline5\n",
    });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    expect(screen.getByTestId("counterpart-line")).toHaveTextContent("2");

    await user.click(await screen.findByRole("button", { name: /deep trace/i }));
    await waitFor(() => {
      expect(screen.getByTestId("counterpart-line")).toHaveTextContent("5");
      expect(screen.getByText("Likely")).toBeInTheDocument();
      expect(screen.getByText("Confirmed")).toBeInTheDocument();
    });
  });

  it("falls back to static counterpart mapping when runtime correlation is unavailable", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 4,
        symbol: "jobs",
        scopeKey: "flow-A",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [
      {
        sourceLine: 1,
        counterpartLine: 2,
        symbol: "jobs",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    getRuntimeSignalsMock.mockResolvedValue({
      ok: true,
      data: [
        {
          threadId: 1,
          status: "chan receive",
          waitReason: "chan receive",
          confidence: ConcurrencyConfidence.Confirmed,
          scopeKey: "default-scope",
          relativePath: "main.go",
          line: 1,
          column: 4,
        },
      ],
    });
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({
      ok: true,
      data: "package main\nline2\n",
    });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    expect(screen.getByTestId("counterpart-line")).toHaveTextContent("2");

    await user.click(await screen.findByRole("button", { name: /deep trace/i }));
    await waitFor(() => {
      expect(screen.getByTestId("counterpart-line")).toHaveTextContent("2");
    });
  });

  it("clears blocked signal when runtime evidence disappears", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 4,
        symbol: "jobs",
        scopeKey: "flow-A",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    getRuntimeSignalsMock
      .mockResolvedValueOnce({
        ok: true,
        data: [
          {
            threadId: 1,
            status: "chan receive",
            waitReason: "chan receive",
            confidence: ConcurrencyConfidence.Confirmed,
            scopeKey: "default-scope",
            relativePath: "main.go",
            line: 1,
            column: 4,
          },
        ],
      })
      .mockResolvedValue({
        ok: true,
        data: [],
      });
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    await user.click(await screen.findByRole("button", { name: /deep trace/i }));

    await waitFor(() => {
      expect(screen.getByTestId("trace-bubble-blocked-indicator")).toBeInTheDocument();
    });

    await user.click(await screen.findByRole("button", { name: /deep trace/i }));

    await waitFor(() => {
      expect(
        screen.queryByTestId("trace-bubble-blocked-indicator")
      ).not.toBeInTheDocument();
    });
  });

  it("renders a single blocked indicator when multiple matching runtime signals exist", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 4,
        symbol: "jobs",
        scopeKey: "flow-A",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    getRuntimeSignalsMock.mockResolvedValue({
      ok: true,
      data: [
        {
          threadId: 1,
          status: "chan receive",
          waitReason: "chan receive",
          confidence: ConcurrencyConfidence.Confirmed,
          scopeKey: "default-scope",
          relativePath: "main.go",
          line: 1,
          column: 4,
        },
        {
          threadId: 2,
          status: "chan send",
          waitReason: "chan send",
          confidence: ConcurrencyConfidence.Confirmed,
          scopeKey: "default-scope",
          relativePath: "main.go",
          line: 1,
          column: 4,
        },
      ],
    });
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    await user.click(await screen.findByRole("button", { name: /deep trace/i }));

    await waitFor(() => {
      expect(getRuntimeSignalsMock).toHaveBeenCalled();
      expect(screen.getByText(/Mode: Deep Trace/i)).toBeInTheDocument();
    });
    expect(screen.getByTestId("trace-bubble-blocked-indicator")).toBeInTheDocument();
  });

  it("does not render blocked confirmed signal when runtime signal location differs", async () => {
    mockConstructs = [
      {
        kind: "mutex",
        line: 1,
        column: 2,
        symbol: "mu",
        scopeKey: "flow-B",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    getRuntimeSignalsMock.mockResolvedValue({
      ok: true,
      data: [
        {
          threadId: 3,
          status: "chan receive",
          waitReason: "chan receive",
          confidence: ConcurrencyConfidence.Confirmed,
          scopeKey: "default-scope",
          relativePath: "main.go",
          line: 2,
          column: 2,
        },
      ],
    });
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    await user.click(await screen.findByRole("button", { name: /deep trace/i }));

    await waitFor(() => {
      expect(getRuntimeSignalsMock).toHaveBeenCalled();
      expect(screen.getByText(/Mode: Deep Trace/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("trace-bubble-blocked-indicator")
    ).not.toBeInTheDocument();
  });

  it("renders blocked signal when scope key drifts but location still matches", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 4,
        symbol: "jobs",
        scopeKey: "flow-A",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    getRuntimeSignalsMock.mockResolvedValue({
      ok: true,
      data: [
        {
          threadId: 4,
          status: "chan receive",
          waitReason: "chan receive",
          confidence: ConcurrencyConfidence.Confirmed,
          scopeKey: "drifted-scope-key",
          relativePath: "main.go",
          line: 1,
          column: 4,
        },
      ],
    });
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    await user.click(await screen.findByRole("button", { name: /deep trace/i }));

    await waitFor(() => {
      expect(screen.getByTestId("trace-bubble-blocked-indicator")).toBeInTheDocument();
    });
  });

  it("matches runtime signal path despite slash-format differences", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 4,
        symbol: "jobs",
        scopeKey: "flow-A",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    getRuntimeSignalsMock.mockResolvedValue({
      ok: true,
      data: [
        {
          threadId: 5,
          status: "chan receive",
          waitReason: "chan receive",
          confidence: ConcurrencyConfidence.Confirmed,
          scopeKey: "default-scope",
          relativePath: "dir\\main.go",
          line: 1,
          column: 4,
        },
      ],
    });
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    mockFileToOpen = "dir/main.go";
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    await user.click(await screen.findByRole("button", { name: /deep trace/i }));

    await waitFor(() => {
      expect(screen.getByTestId("trace-bubble-blocked-indicator")).toBeInTheDocument();
    });
  });

  it("recovers from timed-out runtime polling and continues polling", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 4,
        symbol: "jobs",
        scopeKey: "flow-A",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    let callCount = 0;
    getRuntimeSignalsMock.mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise(() => undefined);
      }
      return Promise.resolve({ ok: true, data: [] });
    });
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    await user.click(await screen.findByRole("button", { name: /deep trace/i }));

    await waitFor(
      () => {
        expect(getRuntimeSignalsMock).toHaveBeenCalledTimes(2);
      },
      { timeout: 2500 }
    );
  });

  it("ignores stale runtime responses after switching active file", async () => {
    mockConstructs = [
      {
        kind: "channel",
        line: 1,
        column: 4,
        symbol: "jobs",
        scopeKey: "flow-A",
        confidence: ConcurrencyConfidence.Predicted,
      },
    ];
    mockCounterpartMappings = [];
    getRuntimeSignalsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                data: [
                  {
                    threadId: 1,
                    status: "chan receive",
                    waitReason: "chan receive",
                    confidence: ConcurrencyConfidence.Confirmed,
                    scopeKey: "default-scope",
                    relativePath: "main.go",
                    line: 1,
                    column: 4,
                  },
                ],
              }),
            200
          );
        })
    );
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));
    await user.click(await screen.findByRole("button", { name: /deep trace/i }));

    mockFileToOpen = "other.go";
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));

    await waitFor(
      () => {
        expect(screen.getByText(/Mode: Quick Insight/i)).toBeInTheDocument();
      },
      { timeout: 1500 }
    );
    expect(
      screen.queryByTestId("trace-bubble-blocked-indicator")
    ).not.toBeInTheDocument();
  });
});
