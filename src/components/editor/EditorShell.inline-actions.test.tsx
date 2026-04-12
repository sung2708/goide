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
  }: {
    onHoverLineChange?: (line: number | null) => void;
    onSelectionLineChange?: (line: number | null) => void;
    onModifierClickLine?: (line: number) => boolean;
    jumpRequest?: { line: number; requestId: number } | null;
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
    </div>
  ),
}));

describe("EditorShell inline actions", () => {
  beforeEach(() => {
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
});
