import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";
import type { CompletionItem } from "../../lib/ipc/types";

const openMock = vi.fn();
const readWorkspaceFileMock = vi.fn();
const fetchWorkspaceCompletionsMock = vi.fn();
const getRuntimeAvailabilityMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
    fetchWorkspaceCompletions: (...args: unknown[]) =>
      fetchWorkspaceCompletionsMock(...args),
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
    onRequestCompletions,
  }: {
    onRequestCompletions?: (request: {
      line: number;
      column: number;
      explicit: boolean;
      triggerCharacter?: string | null;
      fileContent?: string | null;
    }) => Promise<CompletionItem[]>;
  }) => {
    const [label, setLabel] = useState("none");

    return (
      <div data-testid="mock-code-editor">
        <button
          type="button"
          onClick={async () => {
            const items = (await onRequestCompletions?.({
              line: 1,
              column: 1,
              explicit: true,
              triggerCharacter: null,
            })) ?? [];
            setLabel(items[0]?.label ?? "none");
          }}
        >
          Request Completions
        </button>
        <output data-testid="completion-label">{label}</output>
      </div>
    );
  },
}));

describe("EditorShell completions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRuntimeAvailabilityMock.mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "available" },
    });
  });

  it("fetches completions with active workspace and file scope", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    fetchWorkspaceCompletionsMock.mockResolvedValue({
      ok: true,
      data: [
        {
          label: "Println",
          detail: "func(a ...any)",
          kind: "func",
          insertText: "Println",
          range: null,
        },
      ],
    });

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(await screen.findByRole("button", { name: /request completions/i }));

    await waitFor(() =>
      expect(fetchWorkspaceCompletionsMock).toHaveBeenCalledWith({
        workspaceRoot: "C:/workspace",
        relativePath: "main.go",
        line: 1,
        column: 1,
        triggerCharacter: null,
        fileContent: "package main\n",
      })
    );
    expect(screen.getByTestId("completion-label")).toHaveTextContent("Println");
  });

  it("ignores stale completion response after switching files", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    const completionResolver: {
      current: ((value: { ok: boolean; data: CompletionItem[] }) => void) | null;
    } = { current: null };
    fetchWorkspaceCompletionsMock.mockImplementation(
      () =>
        new Promise<{ ok: boolean; data: CompletionItem[] }>((resolve) => {
          completionResolver.current = resolve;
        })
    );

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(await screen.findByRole("button", { name: /request completions/i }));
    await user.click(await screen.findByRole("button", { name: /open other/i }));

    completionResolver.current?.({
      ok: true,
      data: [
        {
          label: "stale-item",
          detail: "func()",
          kind: "func",
          insertText: "stale-item",
          range: null,
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId("completion-label")).toHaveTextContent("none");
    });
  });

  it("ignores stale completion response after switching workspaces", async () => {
    const user = userEvent.setup();
    openMock
      .mockResolvedValueOnce("C:/workspace-a")
      .mockResolvedValueOnce("C:/workspace-b");
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });

    const completionResolver: {
      current: ((value: { ok: boolean; data: CompletionItem[] }) => void) | null;
    } = { current: null };
    fetchWorkspaceCompletionsMock.mockImplementation(
      () =>
        new Promise<{ ok: boolean; data: CompletionItem[] }>((resolve) => {
          completionResolver.current = resolve;
        })
    );

    render(<EditorShell />);

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await user.click(await screen.findByRole("button", { name: /open main/i }));
    await user.click(await screen.findByRole("button", { name: /request completions/i }));

    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);

    completionResolver.current?.({
      ok: true,
      data: [
        {
          label: "stale-from-old-workspace",
          detail: "func()",
          kind: "func",
          insertText: "stale-from-old-workspace",
          range: null,
        },
      ],
    });

    await user.click(await screen.findByRole("button", { name: /open main/i }));

    await waitFor(() => {
      expect(screen.getByTestId("completion-label")).toHaveTextContent("none");
    });
  });
});
