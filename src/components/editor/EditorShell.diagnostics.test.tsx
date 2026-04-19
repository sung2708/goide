import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";
import type { DiagnosticsResponse, EditorDiagnostic } from "../../lib/ipc/types";

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

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
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

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
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

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
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

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
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
});
