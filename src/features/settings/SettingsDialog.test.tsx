import { cleanup, fireEvent, render, screen, within, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import SettingsDialog from "./SettingsDialog";
import { settingsStore, SETTINGS_STORAGE_KEY, THEME_STORAGE_KEY } from "./SettingsStore";
function reset() { localStorage.removeItem(SETTINGS_STORAGE_KEY); localStorage.removeItem(THEME_STORAGE_KEY); settingsStore.refresh(); }
beforeEach(reset); afterEach(() => { cleanup(); reset(); });
it("searches meaningful controls, commits valid numeric drafts, and persists/reset preferences", () => {
  render(<SettingsDialog open onClose={() => {}} />); const dialog = screen.getByRole("dialog", { name: "Settings" });
  const font = within(dialog).getByRole("spinbutton", { name: "Editor font size" }); fireEvent.change(font, { target: { value: "2" } });
  expect(settingsStore.snapshot().values["editor.fontSize"]).toBe(14); fireEvent.change(font, { target: { value: "20" } }); fireEvent.blur(font);
  expect(settingsStore.snapshot().values["editor.fontSize"]).toBe(20);
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Format on Save" })); expect(settingsStore.snapshot().values["go.formatOnSave"]).toBe(true);
  fireEvent.change(within(dialog).getByRole("combobox", { name: "Auto Save" }), { target: { value: "off" } }); expect(settingsStore.snapshot().values["files.autoSave"]).toBe("off");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Search settings" }), { target: { value: "terminal" } });
  expect(within(dialog).queryByRole("checkbox", { name: "Format on Save" })).toBeNull(); expect(within(dialog).getByRole("spinbutton", { name: "Terminal font size" })).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Reset preferences to defaults" })); expect(settingsStore.snapshot().values["editor.fontSize"]).toBe(14); expect(settingsStore.snapshot().values["go.formatOnSave"]).toBe(false);
});
it("reports invalid preferences and restores a corrupt profile only after Reset", () => {
  localStorage.setItem(SETTINGS_STORAGE_KEY, "corrupt"); settingsStore.refresh(); render(<SettingsDialog open onClose={() => {}} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Stored settings are invalid"); fireEvent.click(screen.getByRole("checkbox", { name: "Word wrap" })); expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe("corrupt");
  fireEvent.click(screen.getByRole("button", { name: "Reset preferences to defaults" })); expect(screen.queryByRole("alert")).toBeNull();
  const number = screen.getByRole("spinbutton", { name: "Tab size" }); fireEvent.change(number, { target: { value: "0" } }); fireEvent.blur(number);
  expect(screen.getByRole("alert")).toHaveTextContent("Invalid setting: editor.tabSize"); expect(settingsStore.snapshot().values["editor.tabSize"]).toBe(4);
  act(() => settingsStore.reset());
});