import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

afterEach(() => {
  cleanup();
});

describe("EditorShell panels", () => {
  it("keeps optional panels hidden by default and toggles them on demand", async () => {
    const user = userEvent.setup();

    render(<EditorShell />);

    expect(screen.queryByTestId("summary-panel")).toBeNull();
    expect(screen.queryByTestId("bottom-panel")).toBeNull();

    const summaryBtn = screen.getByRole("button", { name: /summary/i });
    const bottomBtn = screen.getByRole("button", { name: /terminal/i });

    await user.click(summaryBtn);
    expect(screen.getByTestId("summary-panel")).toBeInTheDocument();

    await user.click(bottomBtn);
    expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /hide/i })[0]);
    expect(screen.queryByTestId("summary-panel")).toBeNull();

    await user.click(screen.getByRole("button", { name: /^hide$/i }));
    expect(screen.queryByTestId("bottom-panel")).toBeNull();
  });

  it("shows default status indicators", () => {
    render(<EditorShell />);

    expect(screen.getByText(/Mode: Quick Insight/i)).toBeInTheDocument();
    expect(screen.getByText(/Runtime: Static/i)).toBeInTheDocument();
  });

  it("opens command palette from Cmd/Ctrl+K", async () => {
    render(<EditorShell />);

    expect(screen.queryByTestId("command-palette")).toBeNull();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(await screen.findByTestId("command-palette")).toBeInTheDocument();
  });

  it("opens command palette from Cmd/Ctrl+K even when a contenteditable surface is focused", async () => {
    render(<EditorShell />);
    const fauxEditor = document.createElement("div");
    fauxEditor.contentEditable = "true";
    document.body.appendChild(fauxEditor);
    fauxEditor.focus();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(await screen.findByTestId("command-palette")).toBeInTheDocument();

    document.body.removeChild(fauxEditor);
  });

  it("restores original focus even if the shortcut is re-fired while the palette is open", async () => {
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

      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      expect(await screen.findByTestId("command-palette")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => expect(summaryTrigger).toHaveFocus());
    } finally {
      rafSpy.mockRestore();
    }
  });
});
