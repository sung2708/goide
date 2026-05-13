import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";

const openMock = vi.fn();
const listWorkspaceEntriesMock = vi.fn();
const readWorkspaceFileMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    listWorkspaceEntries: (...args: unknown[]) => listWorkspaceEntriesMock(...args),
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
  };
});

// xterm cannot run in jsdom (no matchMedia / canvas). Mock at the module level
// so that LogsTerminalView (rendered inside BottomPanel) doesn't crash.
vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
    loadAddon: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    cols: 120,
    rows: 40,
  })),
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn() })),
}));

describe("EditorShell panels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openMock.mockResolvedValue(null);
    listWorkspaceEntriesMock.mockResolvedValue({ ok: true, data: [] });
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
  });

  it("shows explorer panel by default and hides summary/runtime/git by default", () => {
    render(<EditorShell />);

    expect(screen.getByRole("button", { name: /explorer/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByPlaceholderText(/^search$/i)).toBeNull();
    expect(screen.queryByTestId("summary-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /source control/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: /concurrency signals/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("keeps only the terminal panel toggle available in the shell chrome", async () => {
    const user = userEvent.setup();

    render(<EditorShell />);

    expect(screen.queryByRole("button", { name: /summary/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /command palette/i })).toBeNull();
    expect(screen.queryByTestId("summary-panel")).toBeNull();

    // BottomPanel is lazy-loaded on first use to reduce initial request fan-out.
    // After the first open it stays mounted and hidden via the wrapper's
    // `hidden` attribute to preserve the shell session lifecycle.
    expect(screen.queryByTestId("bottom-panel")).toBeNull();

    const bottomBtn = screen.getByRole("button", { name: /show terminal panel/i });
    await user.click(bottomBtn);
    expect(await screen.findByTestId("bottom-panel")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-panel").closest("[hidden]")).toBeNull();

    await user.click(screen.getByRole("button", { name: /hide panel/i }));
    expect(screen.getByTestId("bottom-panel").closest("[hidden]")).not.toBeNull();
  });

  it("shows default status indicators", () => {
    render(<EditorShell />);

    expect(screen.getByText(/Mode: Quick Insight/i)).toBeInTheDocument();
    expect(screen.getByText(/Health/i)).toBeInTheDocument();
  });

  it("surfaces missing toolchain state in the status bar instead of a top warning banner", async () => {
    render(<EditorShell />);

    expect(await screen.findByText(/Health/i)).toBeInTheDocument();
    expect(screen.queryByText(/toolchain issues detected/i)).toBeNull();
  });

  it("does not render command palette controls", () => {
    render(<EditorShell />);

    expect(screen.queryByTestId("command-palette")).toBeNull();
    expect(screen.queryByRole("button", { name: /show command palette/i })).toBeNull();
  });

  it("pressing Ctrl+Shift+F switches to search tab and focuses the search input", async () => {
    render(<EditorShell />);
    expect(screen.queryByPlaceholderText(/^search$/i)).toBeNull();

    fireEvent.keyDown(document.body, { key: "F", shiftKey: true, ctrlKey: true });
    const searchInput = await screen.findByPlaceholderText(/^search$/i);

    expect(document.activeElement).toBe(searchInput);
  });

  it("keeps workspace search input focused after search state updates", async () => {
    vi.useFakeTimers();
    try {
      render(<EditorShell />);

      fireEvent.keyDown(document.body, { key: "F", shiftKey: true, ctrlKey: true });
      const searchInput = screen.getByPlaceholderText(/^search$/i);
      searchInput.focus();
      fireEvent.change(searchInput, { target: { value: "mutex" } });

      vi.advanceTimersByTime(250);

      expect(document.activeElement).toBe(searchInput);
      expect(screen.queryByTestId("find-widget")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens and hides the terminal panel without using an overflow menu", async () => {
    const user = userEvent.setup();

    render(<EditorShell />);

    expect(screen.queryByTestId("bottom-panel")).toBeNull();

    await user.click(screen.getByRole("button", { name: /show terminal panel/i }));
    expect(await screen.findByTestId("bottom-panel")).toBeInTheDocument();
    expect(screen.getByTestId("bottom-panel").closest("[hidden]")).toBeNull();

    expect(screen.queryByRole("button", { name: /more panel actions/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: /hide panel/i }));

    expect(screen.getByTestId("bottom-panel").closest("[hidden]")).not.toBeNull();
  });

  it("opens quick file picker with Ctrl+P and opens selected file on Enter", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");
    listWorkspaceEntriesMock
      .mockResolvedValueOnce({
        ok: true,
        data: [
          { name: "main.go", path: "main.go", isDir: false },
          { name: "pkg", path: "pkg", isDir: true },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        data: [{ name: "helper.go", path: "pkg/helper.go", isDir: false }],
      });

    render(<EditorShell />);
    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);

    fireEvent.keyDown(document.body, { key: "p", ctrlKey: true });

    const quickOpenInput = await screen.findByLabelText(/quick open file/i);
    expect(quickOpenInput).toBeInTheDocument();

    fireEvent.keyDown(quickOpenInput, { key: "ArrowDown" });
    fireEvent.keyDown(quickOpenInput, { key: "Enter" });

    expect(readWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "pkg/helper.go");
  });
});
