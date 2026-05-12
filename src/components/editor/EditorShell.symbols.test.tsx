import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";

const openMock = vi.fn();
const readWorkspaceFileMock = vi.fn();
const getRuntimeAvailabilityMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
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
        <button type="button" onClick={() => onOpenFile("main.go")}>
          Open Main
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("./CodeEditor", () => ({
  default: ({
    onDocumentSymbolsChange,
    onCursorOffsetChange,
    jumpRequest,
  }: {
    onDocumentSymbolsChange?: (
      symbols: Array<{
        name: string;
        kind: string;
        line: number;
        from: number;
        to: number;
      }>
    ) => void;
    onCursorOffsetChange?: (offset: number | null) => void;
    jumpRequest?: { line: number; requestId: number } | null;
  }) => (
    <div data-testid="mock-code-editor">
      <button
        type="button"
        onClick={() =>
          onDocumentSymbolsChange?.([
            {
              name: "init",
              kind: "function",
              line: 1,
              from: 1,
              to: 12,
            },
            {
              name: "main",
              kind: "function",
              line: 2,
              from: 13,
              to: 26,
            },
            {
              name: "serve",
              kind: "function",
              line: 4,
              from: 40,
              to: 80,
            },
          ])
        }
      >
        Publish Symbols
      </button>
      <button type="button" onClick={() => onCursorOffsetChange?.(16)}>
        Move Cursor
      </button>
      <button type="button" onClick={() => onCursorOffsetChange?.(5)}>
        Move Cursor To Init
      </button>
      <button type="button" onClick={() => onCursorOffsetChange?.(60)}>
        Move Cursor To Serve
      </button>
      <output data-testid="jump-request-line">{jumpRequest?.line ?? "none"}</output>
    </div>
  ),
}));

describe("EditorShell document symbols", () => {
  const openWorkspaceAndShowExplorer = async (
    user: ReturnType<typeof userEvent.setup>
  ) => {
    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(screen.getByRole("button", { name: /explorer/i }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({
      ok: true,
      data: "package main\nfunc init() {}\n\nfunc main() {}\n\nfunc serve() {}\n",
    });
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "available" },
    });
  });

  it("renders document outline symbols and jumps when selected", async () => {
    const user = userEvent.setup();

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(await screen.findByRole("button", { name: /publish symbols/i }));

    expect(await screen.findByRole("heading", { name: /document outline/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /line 2 function main/i }));

    await waitFor(() =>
      expect(screen.getByTestId("jump-request-line")).toHaveTextContent("2")
    );
  });

  it("highlights the deepest active symbol for the current cursor offset", async () => {
    const user = userEvent.setup();

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(await screen.findByRole("button", { name: /publish symbols/i }));
    await user.click(screen.getByRole("button", { name: /^move cursor$/i }));

    expect(
      await screen.findByRole("button", { name: /line 2 function main/i })
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("editor-scope-breadcrumb")).toHaveTextContent(/scope/i);
    expect(screen.getByTestId("editor-scope-breadcrumb")).toHaveTextContent(/function/i);
    expect(screen.getByTestId("editor-scope-breadcrumb")).toHaveTextContent(/main/i);
    expect(screen.getByTestId("editor-scope-breadcrumb")).toHaveTextContent(/l2/i);
  });

  it("jumps to the active symbol when the breadcrumb is clicked", async () => {
    const user = userEvent.setup();

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(await screen.findByRole("button", { name: /publish symbols/i }));
    await user.click(screen.getByRole("button", { name: /^move cursor$/i }));
    await user.click(screen.getByRole("button", { name: /functionmainl2/i }));

    await waitFor(() =>
      expect(screen.getByTestId("jump-request-line")).toHaveTextContent("2")
    );
  });

  it("shows the active symbol in the status bar and jumps when clicked", async () => {
    const user = userEvent.setup();

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(await screen.findByRole("button", { name: /publish symbols/i }));
    await user.click(screen.getByRole("button", { name: /^move cursor$/i }));

    const indicator = screen.getByRole("button", { name: /jump to active symbol/i });
    expect(indicator).toHaveTextContent(/function/i);
    expect(indicator).toHaveTextContent(/main/i);
    expect(indicator).toHaveTextContent(/l2/i);

    await user.click(indicator);

    await waitFor(() =>
      expect(screen.getByTestId("jump-request-line")).toHaveTextContent("2")
    );
  });

  it("navigates to the next and previous document symbols with F8", async () => {
    const user = userEvent.setup();

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(await screen.findByRole("button", { name: /publish symbols/i }));
    await user.click(screen.getByRole("button", { name: /^move cursor$/i }));

    fireEvent.keyDown(window, { key: "F8" });
    await waitFor(() =>
      expect(screen.getByTestId("jump-request-line")).toHaveTextContent("4")
    );

    await user.click(screen.getByRole("button", { name: /move cursor to serve/i }));

    fireEvent.keyDown(window, { key: "F8", shiftKey: true });
    await waitFor(() =>
      expect(screen.getByTestId("jump-request-line")).toHaveTextContent("2")
    );
  });

  it("wraps document symbol navigation at the ends", async () => {
    const user = userEvent.setup();

    render(<EditorShell />);

    await openWorkspaceAndShowExplorer(user);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(await screen.findByRole("button", { name: /publish symbols/i }));
    await user.click(screen.getByRole("button", { name: /^move cursor$/i }));

    fireEvent.keyDown(window, { key: "F8" });
    await waitFor(() =>
      expect(screen.getByTestId("jump-request-line")).toHaveTextContent("4")
    );

    await user.click(screen.getByRole("button", { name: /move cursor to serve/i }));

    fireEvent.keyDown(window, { key: "F8" });
    await waitFor(() =>
      expect(screen.getByTestId("jump-request-line")).toHaveTextContent("1")
    );

    await user.click(screen.getByRole("button", { name: /^move cursor$/i }));

    fireEvent.keyDown(window, { key: "F8", shiftKey: true });
    await waitFor(() =>
      expect(screen.getByTestId("jump-request-line")).toHaveTextContent("1")
    );

    await user.click(screen.getByRole("button", { name: /move cursor to init/i }));

    fireEvent.keyDown(window, { key: "F8", shiftKey: true });
    await waitFor(() =>
      expect(screen.getByTestId("jump-request-line")).toHaveTextContent("4")
    );
  });
});
