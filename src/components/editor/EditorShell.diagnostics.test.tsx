import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";
import type { DiagnosticsResponse, EditorDiagnostic } from "../../lib/ipc/types";

const openMock = vi.fn();
const readWorkspaceFileMock = vi.fn();
const writeWorkspaceFileMock = vi.fn();
const fetchWorkspaceDiagnosticsMock = vi.fn();
const getRuntimeAvailabilityMock = vi.fn();
const queryWorkspaceLanguageMock = vi.fn();
const formatWorkspaceDocumentMock = vi.fn();
const organizeWorkspaceImportsMock = vi.fn();
const previewWorkspaceRenameMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
    writeWorkspaceFile: (...args: unknown[]) => writeWorkspaceFileMock(...args),
    fetchWorkspaceDiagnostics: (...args: unknown[]) =>
      fetchWorkspaceDiagnosticsMock(...args),
    getRuntimeAvailability: (...args: unknown[]) =>
      getRuntimeAvailabilityMock(...args),
    queryWorkspaceLanguage: (...args: unknown[]) => queryWorkspaceLanguageMock(...args),
    formatWorkspaceDocument: (...args: unknown[]) => formatWorkspaceDocumentMock(...args),
    organizeWorkspaceImports: (...args: unknown[]) => organizeWorkspaceImportsMock(...args),
    previewWorkspaceRename: (...args: unknown[]) => previewWorkspaceRenameMock(...args),
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
            Open Main
          </button>
          <button type="button" onClick={() => onOpenFile("other.go")}>
            Open Other
          </button>
        </>
      ) : null}
    </div>
  ),
}));

vi.mock("./CodeEditor", () => ({
  default: ({
    diagnostics,
    onSave,
    onChange,
    onCursorOffsetChange,
    jumpRequest,
    value,
  }: {
    diagnostics?: EditorDiagnostic[];
    onSave?: (content: string) => void;
    onChange?: (content: string) => void;
    onCursorOffsetChange?: (offset: number) => void;
    jumpRequest?: { line: number; column?: number } | null;
    value: string;
  }) => (
    <div data-testid="mock-code-editor">
      <button onClick={() => onCursorOffsetChange?.(8)}>Place Cursor</button>
      <output data-testid="jump-position">{jumpRequest ? `${jumpRequest.line}:${jumpRequest.column}` : "none"}</output>
      <output data-testid="editor-value">{value}</output>
      <button type="button" onClick={() => onSave?.("package main\nfunc main() {}\n")}>
        Save File
      </button>
      <button type="button" onClick={() => onChange?.("package main\nfunc main() {\n") }>
        Type Invalid Content
      </button>
      <output data-testid="diagnostic-message">
        {diagnostics?.[0]?.message ?? "no diagnostics"}
      </output>
    </div>
  ),
}));

describe("EditorShell diagnostics", () => {
  const openWorkspaceAndShowExplorer = async (
    user: ReturnType<typeof userEvent.setup>
  ) => {
    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(screen.getByRole("button", { name: /explorer/i }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "available" },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows located Problems and removes obsolete results immediately on edits", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({ ok: true, data: {
      toolingAvailability: "available",
      diagnostics: [{ severity: "error", message: "undefined: missing", source: "gopls", code: "UndeclaredName", range: { startLine: 1, startColumn: 2, endLine: 1, endColumn: 3 } }],
    } });
    render(<EditorShell />);
    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await waitFor(() => expect(screen.getByTestId("diagnostic-message")).toHaveTextContent("undefined: missing"));
    fireEvent.keyDown(window, { key: "m", ctrlKey: true, shiftKey: true });
    const panel = await screen.findByRole("region", { name: "Problems" });
    expect(within(panel).getByText(/main.go:1:2/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /type invalid content/i }));
    expect(within(panel).queryByText("undefined: missing")).toBeNull();
    expect(within(panel).getByText(/No problems in the current known results/)).toBeInTheDocument();
  });

  it("routes F12 through the language command and opens the returned file at its column", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\nconst Greeting = 1\n" });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({ ok: true, data: { toolingAvailability: "available", diagnostics: [] } });
    queryWorkspaceLanguageMock.mockResolvedValue({ ok: true, data: { text: null, outsideWorkspace: 0, locations: [{ path: "helper.go", line: 2, column: 7, endLine: 2, endColumn: 15 }] } });
    render(<EditorShell />);
    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(screen.getByRole("button", { name: "Place Cursor" }));
    fireEvent.keyDown(window, { key: "F12" });
    const dialog = await screen.findByRole("dialog", { name: "Go to Definition" });
    expect(queryWorkspaceLanguageMock).toHaveBeenCalledWith(expect.objectContaining({ relativePath: "main.go", kind: "definition", line: 1, column: 9 }));
    await user.click(within(dialog).getByRole("button", { name: "helper.go:2:7" }));
    await waitFor(() => expect(screen.getByTestId("jump-position")).toHaveTextContent("2:7"));
    expect(readWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "helper.go");
    expect(screen.getByRole("tab", { name: /helper.go/ })).toHaveAttribute("aria-selected", "true");
  });

  it("reviews Format Document before editing and saves the applied result against its old disk baseline", async () => {
    const user = userEvent.setup();
    const before = "package main\nfunc main( ){}\n", after = "package main\n\nfunc main() {}\n";
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: before });
    writeWorkspaceFileMock.mockResolvedValue({ ok: true });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({ ok: true, data: { toolingAvailability: "available", diagnostics: [] } });
    formatWorkspaceDocumentMock.mockResolvedValue({ ok: true, data: { files: [{ path: "main.go", before, after, readOnly: false }] } });
    render(<EditorShell />);
    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    fireEvent.keyDown(window, { key: "f", shiftKey: true, altKey: true });
    const review = await screen.findByRole("dialog", { name: "Review Format Document" });
    expect(screen.getByTestId("editor-value").textContent).toBe(before);
    expect(writeWorkspaceFileMock).not.toHaveBeenCalled();
    await user.click(within(review).getByRole("button", { name: "Apply to Editor" }));
    expect(screen.getByTestId("editor-value").textContent).toBe(after);
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(writeWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "main.go", after, before));
  });

  it("runs Organize Imports from the palette and keeps Cancel separate from Apply", async () => {
    const user = userEvent.setup();
    const before = "package main\nfunc main() { fmt.Println(1) }\n", after = "package main\nimport \"fmt\"\nfunc main() { fmt.Println(1) }\n";
    openMock.mockResolvedValue("C:/workspace"); readWorkspaceFileMock.mockResolvedValue({ ok: true, data: before });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({ ok: true, data: { toolingAvailability: "available", diagnostics: [] } });
    organizeWorkspaceImportsMock.mockResolvedValue({ ok: true, data: { files: [{ path: "main.go", before, after, readOnly: false }] } });
    render(<EditorShell />); await openWorkspaceAndShowExplorer(user); await user.click(await screen.findByRole("button", { name: /open main/i }));
    const invoke = async () => {
      fireEvent.keyDown(window, { key: "p", ctrlKey: true, shiftKey: true });
      const input = await screen.findByRole("textbox", { name: "Search commands" });
      fireEvent.change(input, { target: { value: "Organize Imports" } }); fireEvent.keyDown(input, { key: "Enter" });
      return screen.findByRole("dialog", { name: "Review Organize Imports" });
    };
    const first = await invoke(); await user.click(within(first).getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("editor-value").textContent).toBe(before);
    const second = await invoke(); await user.click(within(second).getByRole("button", { name: "Apply to Editor" }));
    expect(screen.getByTestId("editor-value").textContent).toBe(after);
    expect(organizeWorkspaceImportsMock).toHaveBeenCalledWith(expect.objectContaining({ relativePath: "main.go" }));
  });

  it("reviews F2 rename across open and closed files then saves each original baseline", async () => {
    const user = userEvent.setup();
    const before = "var Greeting = 1\n", after = "var Renamed = 1\n";
    const helperBefore = "var Use = Greeting\n", helperAfter = "var Use = Renamed\n";
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: before });
    writeWorkspaceFileMock.mockResolvedValue({ ok: true });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({ ok: true, data: { toolingAvailability: "available", diagnostics: [] } });
    previewWorkspaceRenameMock.mockResolvedValue({ ok: true, data: { rename: { oldName: "Greeting", newName: "Renamed" }, files: [
      { path: "main.go", before, after, readOnly: false },
      { path: "helper.go", before: helperBefore, after: helperAfter, readOnly: false },
    ] } });
    render(<EditorShell />); await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(screen.getByRole("button", { name: "Place Cursor" }));
    fireEvent.keyDown(window, { key: "F2" });
    const review = await screen.findByRole("dialog", { name: "Review Rename Symbol" });
    await user.type(within(review).getByRole("textbox", { name: "New symbol name" }), "Renamed");
    await user.click(within(review).getByRole("button", { name: "Preview Rename" }));
    await within(review).findByText("Greeting → Renamed · 2 files");
    expect(previewWorkspaceRenameMock).toHaveBeenCalledWith(expect.objectContaining({ newName: "Renamed", query: expect.objectContaining({ relativePath: "main.go", line: 1, column: 9 }) }));
    expect(screen.getByTestId("editor-value").textContent).toBe(before);
    expect(writeWorkspaceFileMock).not.toHaveBeenCalled();
    await user.click(within(review).getByRole("button", { name: "Apply to Editor" }));
    expect(screen.getByRole("tab", { name: /helper.go/ })).toBeInTheDocument();
    expect(screen.getByTestId("editor-value").textContent).toBe(after);
    fireEvent.keyDown(window, { key: "s", ctrlKey: true, altKey: true });
    await waitFor(() => expect(writeWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "helper.go", helperAfter, helperBefore));
    expect(writeWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "main.go", after, before);
  });

  it("fetches diagnostics after successful save", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    writeWorkspaceFileMock.mockResolvedValue({ ok: true });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({
      ok: true,
      data: {
        diagnostics: [
          {
            severity: "error",
            message: "expected expression",
            source: "gopls",
            code: "parse",
            range: {
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 2,
            },
          },
        ],
        toolingAvailability: "available",
      },
    });
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "available" },
    });

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(await screen.findByRole("button", { name: /save file/i }));

    await waitFor(() =>
      expect(fetchWorkspaceDiagnosticsMock).toHaveBeenCalledWith(
        "C:/workspace",
        "main.go"
      )
    );
    expect(screen.getByTestId("diagnostic-message")).toHaveTextContent(
      "expected expression"
    );
  });

  it("fetches diagnostics when a Go file is opened", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({
      ok: true,
      data: {
        diagnostics: [
          {
            severity: "warning",
            message: "unused variable",
            source: "gopls",
            code: "unused",
            range: {
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 2,
            },
          },
        ],
        toolingAvailability: "available",
      },
    });

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));

    await waitFor(() =>
      expect(fetchWorkspaceDiagnosticsMock).toHaveBeenCalledWith(
        "C:/workspace",
        "main.go"
      )
    );
    expect(screen.getByTestId("diagnostic-message")).toHaveTextContent(
      "unused variable"
    );
  });

  it("ignores stale diagnostics completion after switching files", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    writeWorkspaceFileMock.mockResolvedValue({ ok: true });
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "available" },
    });

    const diagnosticsResolver: {
      current:
        | ((value: { ok: boolean; data: DiagnosticsResponse }) => void)
        | null;
    } = { current: null };
    fetchWorkspaceDiagnosticsMock
      .mockResolvedValueOnce({
        ok: true,
        data: { diagnostics: [], toolingAvailability: "available" },
      })
      .mockImplementationOnce(
        () =>
          new Promise<{ ok: boolean; data: DiagnosticsResponse }>((resolve) => {
            diagnosticsResolver.current = resolve;
          })
      )
      .mockResolvedValue({
        ok: true,
        data: { diagnostics: [], toolingAvailability: "available" },
      });

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(await screen.findByRole("button", { name: /save file/i }));

    await user.click(await screen.findByRole("button", { name: /open other/i }));

    diagnosticsResolver.current?.({
      ok: true,
      data: {
        diagnostics: [
          {
            severity: "error",
            message: "stale diagnostic",
            source: "gopls",
            code: "parse",
            range: {
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 2,
            },
          },
        ],
        toolingAvailability: "available",
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("diagnostic-message")).toHaveTextContent(
        "no diagnostics"
      );
    });
  });

  it("shows low-noise diagnostics setup hint when gopls is unavailable", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({
      ok: true,
      data: { diagnostics: [], toolingAvailability: "unavailable" },
    });

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));

    await waitFor(() =>
      expect(fetchWorkspaceDiagnosticsMock).toHaveBeenCalledWith(
        "C:/workspace",
        "main.go"
      )
    );

    expect(screen.getByText("Diag Setup")).toBeInTheDocument();
    expect(
      screen.getByTitle(/gopls is unavailable\. install gopls/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId("diagnostic-message")).toHaveTextContent(
      "no diagnostics"
    );
  });

  it("keeps diagnostics indicator neutral when diagnostics request fails", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({
      ok: false,
      error: { code: "diagnostics_failed", message: "gopls failed" },
    });

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));

    await waitFor(() =>
      expect(fetchWorkspaceDiagnosticsMock).toHaveBeenCalledWith(
        "C:/workspace",
        "main.go"
      )
    );

    expect(screen.getByText("Diag --")).toBeInTheDocument();
    expect(
      screen.getByTitle(/diagnostics have not been checked/i)
    ).toBeInTheDocument();
  });

  it("autosaves after 2.5 seconds of typing inactivity", async () => {
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    writeWorkspaceFileMock.mockResolvedValue({ ok: true });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({
      ok: true,
      data: { diagnostics: [], toolingAvailability: "available" },
    });

    render(<EditorShell />);

    fireEvent.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /explorer/i }));
    fireEvent.click(await screen.findByRole("button", { name: /open main/i }));
    const typeInvalidButton = await screen.findByRole("button", { name: /type invalid content/i });

    vi.useFakeTimers();
    fireEvent.click(typeInvalidButton);

    expect(writeWorkspaceFileMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeWorkspaceFileMock).toHaveBeenCalledWith(
      "C:/workspace",
      "main.go",
      "package main\nfunc main() {\n",
      "package main\n"
    );
  }, 15000);

  it("rechecks diagnostics after autosave until errors clear", async () => {
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    fetchWorkspaceDiagnosticsMock
      .mockResolvedValueOnce({
        ok: true,
        data: { diagnostics: [], toolingAvailability: "available" },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          diagnostics: [
            {
              severity: "error",
              message: "expected expression",
              source: "gopls",
              code: "parse",
              range: {
                startLine: 1,
                startColumn: 1,
                endLine: 1,
                endColumn: 2,
              },
            },
          ],
          toolingAvailability: "available",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { diagnostics: [], toolingAvailability: "available" },
      });

    render(<EditorShell />);

    fireEvent.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /explorer/i }));
    fireEvent.click(await screen.findByRole("button", { name: /open main/i }));
    const typeInvalidButton = await screen.findByRole("button", { name: /type invalid content/i });

    vi.useFakeTimers();
    fireEvent.click(typeInvalidButton);

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchWorkspaceDiagnosticsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(1200);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchWorkspaceDiagnosticsMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("diagnostic-message")).toHaveTextContent("no diagnostics");
  }, 15000);
});
