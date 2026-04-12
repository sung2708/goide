import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";
import type { EditorDiagnostic } from "../../lib/ipc/types";

const openMock = vi.fn();
const readWorkspaceFileMock = vi.fn();
const writeWorkspaceFileMock = vi.fn();
const fetchWorkspaceDiagnosticsMock = vi.fn();
const getRuntimeAvailabilityMock = vi.fn();

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
  }: {
    diagnostics?: EditorDiagnostic[];
    onSave?: (content: string) => void;
  }) => (
    <div data-testid="mock-code-editor">
      <button type="button" onClick={() => onSave?.("package main\nfunc main() {}\n")}>
        Save File
      </button>
      <output data-testid="diagnostic-message">
        {diagnostics?.[0]?.message ?? "no diagnostics"}
      </output>
    </div>
  ),
}));

describe("EditorShell diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "available" },
    });
  });

  it("fetches diagnostics after successful save", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    writeWorkspaceFileMock.mockResolvedValue({ ok: true });
    fetchWorkspaceDiagnosticsMock.mockResolvedValue({
      ok: true,
      data: [
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
    });
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "available" },
    });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
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
      current: ((value: { ok: boolean; data: EditorDiagnostic[] }) => void) | null;
    } = { current: null };
    fetchWorkspaceDiagnosticsMock.mockImplementation(
      () =>
        new Promise<{ ok: boolean; data: EditorDiagnostic[] }>((resolve) => {
          diagnosticsResolver.current = resolve;
        })
    );

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(await screen.findByRole("button", { name: /save file/i }));

    await user.click(await screen.findByRole("button", { name: /open other/i }));

    diagnosticsResolver.current?.({
      ok: true,
      data: [
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
    });

    await waitFor(() => {
      expect(screen.getByTestId("diagnostic-message")).toHaveTextContent(
        "no diagnostics"
      );
    });
  });
});
