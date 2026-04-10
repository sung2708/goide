import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConcurrencyConfidence } from "../../lib/ipc/types";
import EditorShell from "./EditorShell";

const openMock = vi.fn();
const readWorkspaceFileMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
  };
});

vi.mock("../../features/concurrency/useLensSignals", () => ({
  useLensSignals: () => ({
    detectedConstructs: [
      {
        kind: "channel",
        line: 1,
        column: 1,
        symbol: null,
        confidence: ConcurrencyConfidence.Predicted,
      },
    ],
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
        <button type="button" onClick={() => onOpenFile("main.go")}>
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
  }: {
    onHoverLineChange?: (line: number | null) => void;
    onSelectionLineChange?: (line: number | null) => void;
  }) => (
    <div
      data-testid="mock-code-editor"
      onMouseEnter={() => onHoverLineChange?.(1)}
      onMouseLeave={() => onHoverLineChange?.(null)}
    >
      <button type="button" onClick={() => onSelectionLineChange?.(1)}>
        Select Line 1
      </button>
    </div>
  ),
}));

describe("EditorShell inline actions", () => {
  it("shows quick actions on hover and hides them immediately on hover out", async () => {
    const user = userEvent.setup();
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
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open mock file/i }));
    await user.click(await screen.findByRole("button", { name: /select line 1/i }));

    expect(screen.getByTestId("inline-actions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /jump/i })).toBeDisabled();
  });
});
