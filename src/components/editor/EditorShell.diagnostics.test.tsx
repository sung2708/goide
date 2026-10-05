import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settingsStore, SETTINGS_STORAGE_KEY, THEME_STORAGE_KEY } from "../../features/settings/SettingsStore";
import EditorShell from "./EditorShell";
import type { DiagnosticsResponse, EditorDiagnostic } from "../../lib/ipc/types";

const openMock = vi.fn();
const readWorkspaceFileMock = vi.fn();
const writeWorkspaceFileMock = vi.fn();
const fetchWorkspaceDiagnosticsMock = vi.fn();
const getRuntimeAvailabilityMock = vi.fn();
const queryWorkspaceLanguageMock = vi.fn();
const queryWorkspaceSignatureMock = vi.fn();
const formatWorkspaceDocumentMock = vi.fn();
const organizeWorkspaceImportsMock = vi.fn();
const previewWorkspaceRenameMock = vi.fn();
const listWorkspaceCodeActionsMock = vi.fn();
const previewWorkspaceCodeActionMock = vi.fn();
const getWorkspaceFileStateMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    listWorkspaceEntries: async () => ({ ok: true, data: [] }),
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
    writeWorkspaceFile: (...args: unknown[]) => writeWorkspaceFileMock(...args),
    fetchWorkspaceDiagnostics: (...args: unknown[]) =>
      fetchWorkspaceDiagnosticsMock(...args),
    getRuntimeAvailability: (...args: unknown[]) =>
      getRuntimeAvailabilityMock(...args),
    queryWorkspaceLanguage: (...args: unknown[]) => queryWorkspaceLanguageMock(...args),
    queryWorkspaceSignature: (...args: unknown[]) => queryWorkspaceSignatureMock(...args),
    formatWorkspaceDocument: (...args: unknown[]) => formatWorkspaceDocumentMock(...args),
    organizeWorkspaceImports: (...args: unknown[]) => organizeWorkspaceImportsMock(...args),
    previewWorkspaceRename: (...args: unknown[]) => previewWorkspaceRenameMock(...args),
    listWorkspaceCodeActions: (...args: unknown[]) => listWorkspaceCodeActionsMock(...args),
    previewWorkspaceCodeAction: (...args: unknown[]) => previewWorkspaceCodeActionMock(...args),
    getWorkspaceFileState: (...args: unknown[]) => getWorkspaceFileStateMock(...args),
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
    onRequestHover,
    onRequestSignature,
    signatureRequestTrigger,
    jumpRequest,
    value,
  }: {
    diagnostics?: EditorDiagnostic[];
    onSave?: (content: string) => void;
    onChange?: (content: string) => void;
    onCursorOffsetChange?: (offset: number) => void;
    onRequestHover?: (request: { offset: number; content: string; signal: AbortSignal }) => Promise<unknown>;
    onRequestSignature?: (request: { offset: number; content: string; signal: AbortSignal }) => Promise<unknown>;
    signatureRequestTrigger?: number;
    jumpRequest?: { line: number; column?: number } | null;
    value: string;
  }) => (
    <div data-testid="mock-code-editor">
      <button onClick={() => onCursorOffsetChange?.(8)}>Place Cursor</button>
      <button onClick={() => void onRequestHover?.({ offset: 8, content: value, signal: new AbortController().signal })}>Hover Symbol</button>
      <button onClick={() => void onRequestSignature?.({ offset: 8, content: value, signal: new AbortController().signal })}>Request Signature</button>
      <output data-testid="signature-trigger">{signatureRequestTrigger ?? 0}</output>
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
    localStorage.removeItem(SETTINGS_STORAGE_KEY); localStorage.removeItem(THEME_STORAGE_KEY); settingsStore.refresh();
    vi.clearAllMocks();
    vi.useRealTimers();
    getWorkspaceFileStateMock.mockResolvedValue({ ok: false, error: { code: "fs_state_unavailable" } });
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "available" },
    });
  });

  afterEach(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY); localStorage.removeItem(THEME_STORAGE_KEY); settingsStore.refresh();
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
    const panel = await screen.findByRole("region", { name: "Problems" }, { timeout: 10000 });
    expect(within(panel).getByText(/main.go:1:2/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /type invalid content/i }));
    expect(within(panel).queryByText("undefined: missing")).toBeNull();
    expect(within(panel).getByText(/No problems in the current known results/)).toBeInTheDocument();
  }, 20000);

  it("routes Ctrl+G line:column through the shared picker into the active editor", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n// 😀abc\nfunc main() {}\n" });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({ ok: true, data: { toolingAvailability: "available", diagnostics: [] } });
    render(<EditorShell />); await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    fireEvent.keyDown(window, { key: "g", ctrlKey: true });
    const input = await screen.findByRole("combobox", { name: "Line and column" });
    fireEvent.change(input, { target: { value: "2:4" } }); fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("jump-position")).toHaveTextContent("2:4"));
    expect(screen.queryByRole("dialog", { name: "Go to Line" })).toBeNull();
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
    await user.click(await within(dialog).findByRole("button", { name: "helper.go:2:7" }));
    await waitFor(() => expect(screen.getByTestId("jump-position")).toHaveTextContent("2:7"));
    expect(readWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "helper.go");
    expect(screen.getByRole("tab", { name: /helper.go/ })).toHaveAttribute("aria-selected", "true");
  });

  it("queries editor hover directly without opening a modal or modifying the document", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({ ok: true, data: { toolingAvailability: "available", diagnostics: [] } });
    queryWorkspaceLanguageMock.mockResolvedValue({ ok: true, data: { text: "package main", locations: [], outsideWorkspace: 0 } });
    render(<EditorShell />);
    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(screen.getByRole("button", { name: "Hover Symbol" }));
    expect(queryWorkspaceLanguageMock).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String), kind: "hover", relativePath: "main.go", line: 1, column: 9 }));
    expect(screen.queryByRole("dialog", { name: "Symbol Information" })).toBeNull();
    expect(writeWorkspaceFileMock).not.toHaveBeenCalled();
  });

  it("routes Signature Help through the command registry and typed native callback", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({ ok: true, data: { toolingAvailability: "available", diagnostics: [] } });
    queryWorkspaceSignatureMock.mockResolvedValue({ ok: true, data: null });
    render(<EditorShell />);
    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(screen.getByRole("button", { name: "Place Cursor" }));
    fireEvent.keyDown(window, { key: " ", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(screen.getByTestId("signature-trigger")).toHaveTextContent("1"));
    await user.click(screen.getByRole("button", { name: "Request Signature" }));
    expect(queryWorkspaceSignatureMock).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String), workspaceRoot: "C:/workspace", relativePath: "main.go", line: 1, column: 9 }));
  });

  it("routes Quick Fix through its shortcut and reviews actual edits before saving", async () => {
    const user = userEvent.setup(); const before = "package main\n", after = "package main\n// fixed\n";
    const action = { title: "Actual server fix", kind: "quickfix", preferred: true, disabledReason: null };
    const diagnostic = { message: "actual diagnostic", severity: "warning", source: "gopls", range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } };
    openMock.mockResolvedValue("C:/workspace"); readWorkspaceFileMock.mockResolvedValue({ ok: true, data: before }); writeWorkspaceFileMock.mockResolvedValue({ ok: true });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({ ok: true, data: { toolingAvailability: "available", diagnostics: [diagnostic] } });
    listWorkspaceCodeActionsMock.mockResolvedValue({ ok: true, data: [action] });
    previewWorkspaceCodeActionMock.mockResolvedValue({ ok: true, data: { files: [{ path: "main.go", before, after, readOnly: false }] } });
    render(<EditorShell />); await openWorkspaceAndShowExplorer(user); await user.click(await screen.findByRole("button", { name: /open main/i }));
    await waitFor(() => expect(screen.getByTestId("diagnostic-message")).toHaveTextContent("actual diagnostic"));
    await user.click(screen.getByRole("button", { name: "Place Cursor" })); fireEvent.keyDown(window, { key: ".", ctrlKey: true });
    const review = await screen.findByRole("dialog", { name: "Quick Fix / Code Actions" });
    await user.click(await within(review).findByRole("button", { name: "Actual server fix (preferred)" }));
    await waitFor(() => expect(within(review).getByText("Review: Actual server fix")).toBeInTheDocument());
    expect(listWorkspaceCodeActionsMock).toHaveBeenCalledWith(expect.objectContaining({ diagnostics: [diagnostic], query: expect.objectContaining({ relativePath: "main.go", requestId: expect.any(String) }) }));
    expect(screen.getByTestId("editor-value").textContent).toBe(before); expect(writeWorkspaceFileMock).not.toHaveBeenCalled();
    await waitFor(() => expect(within(review).getByRole("button", { name: "Apply to Editor" })).toBeEnabled()); await user.click(within(review).getByRole("button", { name: "Apply to Editor" }));
    expect(screen.getByTestId("editor-value").textContent).toBe(after); fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(writeWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "main.go", after, before));
  });
  it("opens typed Settings with Mod+, and formats a save against the original baseline", async () => {
    const user = userEvent.setup(); const before = "package main\nfunc main( ){}\n", after = "package main\n\nfunc main() {}\n";
    openMock.mockResolvedValue("C:/workspace"); readWorkspaceFileMock.mockResolvedValue({ ok: true, data: before }); writeWorkspaceFileMock.mockResolvedValue({ ok: true });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({ ok: true, data: { toolingAvailability: "available", diagnostics: [] } });
    formatWorkspaceDocumentMock.mockResolvedValue({ ok: true, data: { files: [{ path: "main.go", before, after, readOnly: false }] } });
    render(<EditorShell />); await openWorkspaceAndShowExplorer(user); await user.click(await screen.findByRole("button", { name: /open main/i }));
    fireEvent.keyDown(window, { key: ",", ctrlKey: true }); const preferences = await screen.findByRole("dialog", { name: "Settings" });
    await user.click(within(preferences).getByRole("switch", { name: "Format on Save" }));
    await user.click(within(preferences).getByRole("button", { name: "Close" })); fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(writeWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "main.go", after, before));
    expect(formatWorkspaceDocumentMock).toHaveBeenCalledOnce(); expect(screen.getByTestId("editor-value").textContent).toBe(after);
  });
  it("respects Auto Save off and saves focus changes only when the chosen mode requests it", async () => {
    const user = userEvent.setup(); openMock.mockResolvedValue("C:/workspace"); readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" }); writeWorkspaceFileMock.mockResolvedValue({ ok: true });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({ ok: true, data: { toolingAvailability: "available", diagnostics: [] } });
    render(<EditorShell />); await openWorkspaceAndShowExplorer(user); await user.click(await screen.findByRole("button", { name: /open main/i }));
    act(() => settingsStore.update("files.autoSave", "off")); await user.click(screen.getByRole("button", { name: /type invalid content/i }));
    vi.useFakeTimers(); await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(writeWorkspaceFileMock).not.toHaveBeenCalled();
    act(() => settingsStore.update("files.autoSave", "onFocusChange")); fireEvent(window, new Event("blur"));
    await act(async () => { await Promise.resolve(); }); expect(writeWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "main.go", "package main\nfunc main() {\n", "package main\n");
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
      const input = await screen.findByRole("combobox", { name: "Search commands" });
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

  it("offers review for a dirty inactive tab changed externally and keeps its edits", async () => {
    settingsStore.update("files.autoSave", "off");
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({ ok: true, data: { toolingAvailability: "available", diagnostics: [] } });
    render(<EditorShell />); await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(screen.getByRole("button", { name: /type invalid content/i }));
    await user.click(screen.getByRole("button", { name: /open other/i }));
    getWorkspaceFileStateMock.mockImplementation((_root: string, path: string) => Promise.resolve({ ok: true, data: { exists: true, content: path === "main.go" ? "package changed\n" : "package main\n" } }));
    act(() => window.dispatchEvent(new Event("focus")));
    const status = await screen.findByRole("status", { name: "External changes in open tabs" });
    await user.click(within(status).getByRole("button", { name: "Review main.go" }));
    expect(screen.getByTestId("editor-value").textContent).toBe("package main\nfunc main() {\n");
    expect(screen.getByRole("tab", { name: /main.go/ })).toHaveAttribute("aria-selected", "true");
    expect(writeWorkspaceFileMock).not.toHaveBeenCalled();
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
        "main.go",
        expect.objectContaining({ requestId: expect.any(String), buffers: expect.arrayContaining([expect.objectContaining({ path: "main.go", content: expect.any(String) })]) })
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
        "main.go",
        expect.objectContaining({ requestId: expect.any(String), buffers: expect.arrayContaining([expect.objectContaining({ path: "main.go", content: expect.any(String) })]) })
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
        "main.go",
        expect.objectContaining({ requestId: expect.any(String), buffers: expect.arrayContaining([expect.objectContaining({ path: "main.go", content: expect.any(String) })]) })
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
        "main.go",
        expect.objectContaining({ requestId: expect.any(String), buffers: expect.arrayContaining([expect.objectContaining({ path: "main.go", content: expect.any(String) })]) })
      )
    );

    expect(screen.getByText("Diag --")).toBeInTheDocument();
    expect(
      screen.getByTitle(/diagnostics have not been checked/i)
    ).toBeInTheDocument();
  });

  it("autosaves after the configured default delay of typing inactivity", async () => {
    settingsStore.update("go.formatOnSave", true);
    settingsStore.update("go.organizeImportsOnSave", true);
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
      vi.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(writeWorkspaceFileMock).toHaveBeenCalledWith(
      "C:/workspace",
      "main.go",
      "package main\nfunc main() {\n",
      "package main\n"
    );
    expect(formatWorkspaceDocumentMock).not.toHaveBeenCalled();
    expect(organizeWorkspaceImportsMock).not.toHaveBeenCalled();
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
      vi.advanceTimersByTime(180);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchWorkspaceDiagnosticsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(320);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchWorkspaceDiagnosticsMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("diagnostic-message")).toHaveTextContent("no diagnostics");
    await act(async () => { vi.advanceTimersByTime(1200); });
    expect(fetchWorkspaceDiagnosticsMock).toHaveBeenCalledTimes(3);
  }, 15000);
});
