import { fireEvent, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { matchesShortcut, runCommand } from "./registry";
import { useCommandRegistry } from "./useCommandRegistry";
it("matches platform modifiers exactly without stealing Alt or shifted editor shortcuts", () => {
  const event = { key: "P", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false };
  expect(matchesShortcut(event, "Mod+Shift+p", false)).toBe(true);
  expect(matchesShortcut(event, "Mod+p", false)).toBe(false);
  expect(matchesShortcut(event, "Mod+Shift+p", true)).toBe(false);
  expect(matchesShortcut({ ...event, ctrlKey: false, metaKey: true }, "Mod+Shift+p", true)).toBe(true);
  expect(matchesShortcut({ ...event, altKey: true }, "Mod+Shift+p", false)).toBe(false);
});
it("rejects disabled commands and surfaces native failures through the shared executor", async () => {
  const run = vi.fn(); await expect(runCommand({ id: "save", title: "Save", disabled: "Read only", run })).rejects.toThrow("Read only"); expect(run).not.toHaveBeenCalled();
  await expect(runCommand({ id: "step", title: "Step", run: () => ({ ok: false, error: { message: "DAP disconnected" } }) })).rejects.toThrow("DAP disconnected");
});
it("routes shortcuts through current command state, ignores dialogs/composition, and unsubscribes", async () => {
  const run = vi.fn(), onError = vi.fn();
  const view = renderHook(({ disabled }) => useCommandRegistry([{ id: "save", title: "Save", shortcut: "Ctrl+s", disabled, run }], onError), { initialProps: { disabled: undefined as string | undefined } });
  fireEvent.keyDown(document.body, { key: "s", ctrlKey: true }); expect(run).toHaveBeenCalledOnce();
  await Promise.resolve(); await Promise.resolve();
  view.rerender({ disabled: "Busy" }); fireEvent.keyDown(document.body, { key: "s", ctrlKey: true }); await Promise.resolve(); expect(onError).toHaveBeenCalledWith("Busy");
  await Promise.resolve(); view.rerender({ disabled: undefined });
  const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); const input = document.createElement("input"); dialog.append(input); document.body.append(dialog);
  fireEvent.keyDown(input, { key: "s", ctrlKey: true }); fireEvent.keyDown(document.body, { key: "s", ctrlKey: true, isComposing: true }); expect(run).toHaveBeenCalledOnce();
  dialog.remove(); view.unmount(); fireEvent.keyDown(document.body, { key: "s", ctrlKey: true }); expect(run).toHaveBeenCalledOnce();
});
