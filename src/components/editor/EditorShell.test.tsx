import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
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
  it("shows search panel by default and hides summary/runtime/git by default", () => {
    render(<EditorShell />);

    expect(screen.getByPlaceholderText(/search workspace/i)).toBeVisible();
    expect(screen.queryByTestId("summary-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /git/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: /concurrency signals/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("keeps optional panels hidden by default and toggles them on demand", async () => {
    const user = userEvent.setup();

    render(<EditorShell />);

    // SummaryPeek is conditionally rendered (not in DOM when hidden)
    expect(screen.queryByTestId("summary-panel")).toBeNull();

    // BottomPanel is always mounted to preserve ShellTerminalView's xterm
    // instance across hide/show cycles.  When hidden, the wrapping div has
    // the HTML `hidden` attribute; the section with data-testid="bottom-panel"
    // is always in the DOM.
    const bottomPanelEl = screen.getByTestId("bottom-panel");
    expect(bottomPanelEl).toBeInTheDocument();
    // The wrapping div added by EditorShell should be hidden initially
    expect(bottomPanelEl.closest("[hidden]")).not.toBeNull();

    const summaryBtn = screen.getByRole("button", { name: /summary/i });
    const bottomBtn = screen.getByRole("button", { name: /show terminal panel/i });

    await user.click(summaryBtn);
    expect(screen.getByTestId("summary-panel")).toBeInTheDocument();

    await user.click(bottomBtn);
    // After opening, the hidden wrapper is removed — panel is visible
    expect(screen.getByTestId("bottom-panel").closest("[hidden]")).toBeNull();

    const summaryPanel = screen.getByTestId("summary-panel");
    await user.click(within(summaryPanel).getByRole("button", { name: /^hide$/i }));
    expect(screen.queryByTestId("summary-panel")).toBeNull();

    // Hide moved into BottomPanel overflow menu
    await user.click(screen.getByRole("button", { name: /more panel actions/i }));
    await user.click(screen.getByRole("menuitem", { name: /hide panel/i }));
    // Panel is hidden again (wrapper div has hidden attribute)
    expect(screen.getByTestId("bottom-panel").closest("[hidden]")).not.toBeNull();
  });

  it("shows default status indicators", () => {
    render(<EditorShell />);

    expect(screen.getByText(/Mode: Quick Insight/i)).toBeInTheDocument();
    expect(screen.getByText(/Runtime: Runtime Off/i)).toBeInTheDocument();
  });

  it("surfaces missing toolchain state in the status bar instead of a top warning banner", async () => {
    render(<EditorShell />);

    expect(await screen.findByText("Tools Setup")).toBeInTheDocument();
    expect(screen.queryByText(/toolchain issues detected/i)).toBeNull();
  });

  it("opens command palette from the status bar control", async () => {
    render(<EditorShell />);

    expect(screen.queryByTestId("command-palette")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /show command palette/i }));

    expect(await screen.findByTestId("command-palette")).toBeInTheDocument();
  });

  it("opens command palette from the status bar control even when a contenteditable surface is focused", async () => {
    render(<EditorShell />);
    const fauxEditor = document.createElement("div");
    fauxEditor.contentEditable = "true";
    document.body.appendChild(fauxEditor);
    fauxEditor.focus();

    fireEvent.click(screen.getByRole("button", { name: /show command palette/i }));

    expect(await screen.findByTestId("command-palette")).toBeInTheDocument();

    document.body.removeChild(fauxEditor);
  });

  it("restores original focus when the palette is closed", async () => {
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
    try {
      render(<EditorShell />);

      const summaryTrigger = screen.getByRole("button", { name: /summary/i });
      summaryTrigger.focus();

      fireEvent.click(screen.getByRole("button", { name: /show command palette/i }));
      expect(await screen.findByTestId("command-palette")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^close$/i }));

      await waitFor(() => expect(summaryTrigger).toHaveFocus());
    } finally {
      rafSpy.mockRestore();
    }
  });
});
