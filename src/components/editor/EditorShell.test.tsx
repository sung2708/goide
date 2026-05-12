import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText(/Runtime: Runtime Off/i)).toBeInTheDocument();
  });

  it("surfaces missing toolchain state in the status bar instead of a top warning banner", async () => {
    render(<EditorShell />);

    expect(await screen.findByText("Tools Setup")).toBeInTheDocument();
    expect(screen.queryByText(/toolchain issues detected/i)).toBeNull();
  });

  it("does not render command palette controls", () => {
    render(<EditorShell />);

    expect(screen.queryByTestId("command-palette")).toBeNull();
    expect(screen.queryByRole("button", { name: /show command palette/i })).toBeNull();
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
});
