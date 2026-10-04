import { expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, SETTING_DEFINITIONS, validateSettings } from "./model";
import { SettingsStore, SETTINGS_STORAGE_KEY, THEME_STORAGE_KEY } from "./SettingsStore";
function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
}
it("persists all tool paths in one validated settings transaction", () => {
  const backing = storage(); const store = new SettingsStore(() => backing);
  const notify = vi.fn(); store.subscribe(notify);
  store.updateToolPaths({ go: "C:/private/go/bin/go.exe", gopls: "C:/private/bin/gopls.exe", dlv: "C:/private/bin/dlv.exe" });
  expect(notify).toHaveBeenCalledOnce();
  expect(backing.setItem.mock.calls.filter(([key]) => key === SETTINGS_STORAGE_KEY)).toHaveLength(1);
  const restored = new SettingsStore(() => backing).snapshot().values;
  expect(restored["go.executablePath"]).toBe("C:/private/go/bin/go.exe");
  expect(restored["go.goplsPath"]).toBe("C:/private/bin/gopls.exe");
  expect(restored["debug.delvePath"]).toBe("C:/private/bin/dlv.exe");
});
it("defines typed, validated application defaults and rejects malformed or unknown settings", () => {
  expect(SETTING_DEFINITIONS.every(setting => setting.scope === "application" && setting.validate(setting.default))).toBe(true);
  expect(validateSettings({})).toEqual(DEFAULT_SETTINGS);
  for (const patch of [{ "editor.tabSize": 0 }, { "editor.fontSize": 14.5 }, { "files.autoSave": {} }, { "files.autoSaveDelay": 1 }, { "appearance.theme": "unknown" }, { "go.formatOnSave": "true" }, { "secret": "token" }]) expect(() => validateSettings(patch)).toThrow();
});
it("migrates the existing palette and restores validated preferences", () => {
  const backing = storage({ [THEME_STORAGE_KEY]: "tokyo-night" }); const store = new SettingsStore(() => backing);
  expect(store.snapshot().values["appearance.theme"]).toBe("tokyo-night");
  const notify = vi.fn(); const unsubscribe = store.subscribe(notify);
  store.update("editor.tabSize", 8); expect(notify).toHaveBeenCalledOnce(); unsubscribe();
  expect(JSON.parse(backing.getItem(SETTINGS_STORAGE_KEY)!).version).toBe(1);
  expect(new SettingsStore(() => backing).snapshot().values["editor.tabSize"]).toBe(8);
  expect(store.snapshot()).toBe(store.snapshot());
});
it("retains unreadable/future profiles until an explicit reset", () => {
  for (const raw of ["broken JSON", JSON.stringify({ version: 2, values: {} }), JSON.stringify({ version: 1, values: { "files.autoSaveDelay": -1 } })]) {
    const backing = storage({ [SETTINGS_STORAGE_KEY]: raw }); const store = new SettingsStore(() => backing);
    expect(store.snapshot().error).toContain("Stored settings are invalid"); store.update("editor.fontSize", 20); store.update("editor.fontSize", 22);
    expect(backing.setItem).not.toHaveBeenCalled(); expect(backing.getItem(SETTINGS_STORAGE_KEY)).toBe(raw);
    store.reset(); expect(store.snapshot().error).toBeNull(); store.update("editor.fontSize", 22); expect(store.snapshot().values["editor.fontSize"]).toBe(22);
  }
});
it("keeps session preferences active when persistence fails and exposes the failure", () => {
  const backing = storage(); backing.setItem.mockImplementation(() => { throw new Error("quota exceeded"); });
  const store = new SettingsStore(() => backing); store.update("appearance.theme", "nord");
  expect(store.snapshot().values["appearance.theme"]).toBe("nord"); expect(store.snapshot().error).toContain("could not be saved");
  expect(store.snapshot()).toBe(store.snapshot());
});
it("refreshes a valid external profile and rejects invalid updates without losing existing values", () => {
  const backing = storage(); const store = new SettingsStore(() => backing); store.update("editor.fontSize", 18);
  store.update("editor.fontSize", 100); expect(store.snapshot().values["editor.fontSize"]).toBe(18); expect(store.snapshot().error).toContain("Invalid setting");
  backing.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 1, values: { "editor.fontSize": 24 } })); store.refresh();
  expect(store.snapshot().values["editor.fontSize"]).toBe(24); expect(store.snapshot().error).toBeNull();
});
