import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";

const openMock = vi.fn();
const listWorkspaceEntriesMock = vi.fn();
const indexWorkspaceFilesMock = vi.fn();
const readWorkspaceFileMock = vi.fn();
const createGoProjectMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    createGoProject: (...args: unknown[]) => createGoProjectMock(...args),
    configureToolchainPaths: async (paths: unknown) => ({ ok: true, data: paths }),
    indexWorkspaceFiles: (...args: unknown[]) => indexWorkspaceFilesMock(...args),
    listWorkspaceEntries: (...args: unknown[]) => listWorkspaceEntriesMock(...args),
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
  };
});

// This suite exercises workbench navigation. CodeMirror rendering and DOM
// geometry are covered by the dedicated CodeEditor suite.
vi.mock("./CodeEditor", () => ({
  default: ({ value }: { value: string }) => (
    <pre data-testid="opened-document">{value}</pre>
  ),
}));

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
    indexWorkspaceFilesMock.mockResolvedValue({ ok: true, data: { files: [], notice: null } });
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "package main\n" });
    createGoProjectMock.mockResolvedValue({ ok: true, data: "C:/projects/hello" });
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

  it("creates a project from the welcome screen and opens main.go in the new workspace", async () => {
    openMock.mockResolvedValue("C:/projects");
    render(<EditorShell />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Quick actions" })).getByRole("button", { name: "New Go Project…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Browse…" }));
    await waitFor(() => expect(screen.getByLabelText("Parent folder")).toHaveValue("C:/projects"));
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "hello" } });
    fireEvent.change(screen.getByLabelText("Module path"), { target: { value: "example.test/hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Project" }));
    await waitFor(() => expect(readWorkspaceFileMock).toHaveBeenCalledWith("C:/projects/hello", "main.go"));
    expect(await screen.findByTestId("opened-document")).toHaveTextContent("package main");
    expect(createGoProjectMock).toHaveBeenCalledOnce();
    expect(openMock).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "New Go Project" })).not.toBeInTheDocument();
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

  it("restores the sidebar and mounted terminal after leaving focus mode", async () => {
    openMock.mockResolvedValue("C:/workspace");
    render(<EditorShell />);
    fireEvent.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Toggle Focus Mode" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /show terminal panel/i }));
    const terminal = await screen.findByTestId("bottom-panel");
    const focus = screen.getByRole("button", { name: "Toggle Focus Mode" });
    fireEvent.click(focus);
    expect(focus).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector("aside")).toHaveAttribute("inert");
    expect(terminal.closest("[hidden]")).not.toBeNull();
    fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true, shiftKey: true });
    expect(focus).toHaveAttribute("aria-pressed", "false");
    expect(document.querySelector("aside")).not.toHaveAttribute("inert");
    expect(screen.getByTestId("bottom-panel")).toBe(terminal);
    expect(terminal.closest("[hidden]")).toBeNull();
  });

  it("surfaces missing toolchain state in the status bar instead of a top warning banner", async () => {
    render(<EditorShell />);

    expect(await screen.findByText(/Health/i)).toBeInTheDocument();
    expect(screen.queryByText(/toolchain issues detected/i)).toBeNull();
  });

  it("keeps the command palette closed until requested", () => {
    render(<EditorShell />);

    expect(screen.queryByTestId("command-palette")).toBeNull();
    expect(screen.queryByRole("button", { name: /show command palette/i })).toBeNull();
  });
  it("opens honest toolchain inspection from the status bar and command registry", async () => {
    render(<EditorShell />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect Go toolchain" }));
    expect(await screen.findByRole("dialog", { name: "Go Toolchain" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("requires the desktop app");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document.body, { key: "P", ctrlKey: true, shiftKey: true });
    const input = await screen.findByRole("combobox", { name: "Search commands" });
    fireEvent.change(input, { target: { value: "Go: Inspect Toolchain" } }); fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByRole("dialog", { name: "Go Toolchain" })).toBeInTheDocument();
  });

  it("opens the shared command palette with Ctrl+Shift+P and executes a searched command", async () => {
    render(<EditorShell />);
    fireEvent.keyDown(document.body, { key: "P", ctrlKey: true, shiftKey: true });
    const input = await screen.findByRole("combobox", { name: "Search commands" });
    fireEvent.change(input, { target: { value: "Toggle Terminal Panel" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.queryByTestId("command-palette")).toBeNull());
    expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();
  });

  it("opens Go project inspection from the command registry for an actual workspace", async () => {
    openMock.mockResolvedValue("C:/workspace");
    render(<EditorShell />);
    await userEvent.setup().click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    fireEvent.keyDown(document.body, { key: "P", ctrlKey: true, shiftKey: true });
    const input = await screen.findByRole("combobox", { name: "Search commands" });
    fireEvent.change(input, { target: { value: "Go: Inspect Project and Environment" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByRole("dialog", { name: "Go Project" })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("desktop app");
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
    indexWorkspaceFilesMock.mockResolvedValue({ ok: true, data: { files: ["main.go", "pkg/helper.go"], notice: null } });
    listWorkspaceEntriesMock.mockImplementation(async (_root: string, path?: string) => ({ ok: true, data: path === "pkg"
      ? [{ name: "helper.go", path: "pkg/helper.go", isDir: false }]
      : [{ name: "main.go", path: "main.go", isDir: false }, { name: "pkg", path: "pkg", isDir: true }] }));

    render(<EditorShell />);
    await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);

    fireEvent.keyDown(document.body, { key: "p", ctrlKey: true });

    const quickOpenInput = await screen.findByLabelText(/quick open file/i);
    expect(quickOpenInput).toBeInTheDocument();
    await screen.findByRole("button", { name: "pkg/helper.go" });

    fireEvent.keyDown(quickOpenInput, { key: "ArrowDown" });
    fireEvent.keyDown(quickOpenInput, { key: "Enter" });

    await waitFor(() =>
      expect(readWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "pkg/helper.go")
    );
    expect(await screen.findByTestId("opened-document")).toHaveTextContent("package main");
  });
});
