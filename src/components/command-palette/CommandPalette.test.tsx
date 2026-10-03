import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import CommandPalette from "./CommandPalette";
beforeEach(() => sessionStorage.clear());
it("fuzzy searches, highlights real matches, displays bindings and calls the shared executor", () => {
  const execute = vi.fn().mockResolvedValue(undefined), close = vi.fn();
  render(<CommandPalette commands={[{ id: "format", title: "Format Document", shortcut: "Shift+Alt+f", run: vi.fn() }]} execute={execute} onClose={close} />);
  const input = screen.getByRole("combobox", { name: "Search commands" });
  fireEvent.change(input, { target: { value: "fmt" } });
  expect(within(screen.getByRole("option")).getByText("Shift+Alt+f")).toBeInTheDocument();
  expect([...document.querySelectorAll("mark")].map(node => node.textContent).join("")).toBe("Fmt");
  fireEvent.keyDown(input, { key: "Enter", isComposing: true }); expect(execute).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" }); expect(execute).toHaveBeenCalledWith("format"); expect(close).toHaveBeenCalledOnce();
});
it("clamps page navigation and explains disabled commands without executing", () => {
  const execute = vi.fn(), close = vi.fn();
  render(<CommandPalette commands={[{ id: "a", title: "A", run: vi.fn() }, { id: "z", title: "Z", disabled: "No workspace", run: vi.fn() }]} execute={execute} onClose={close} />);
  const input = screen.getByRole("combobox");
  fireEvent.keyDown(input, { key: "PageDown" }); fireEvent.keyDown(input, { key: "Enter" });
  expect(execute).not.toHaveBeenCalled(); expect(screen.getByText("No workspace")).toBeInTheDocument();
  fireEvent.keyDown(input, { key: "PageUp" }); fireEvent.keyDown(input, { key: "Enter" }); expect(execute).toHaveBeenCalledWith("a");
});
