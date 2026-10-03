export const THEMES = [
  { id: "monochrome", label: "Black & White (Default)" }, { id: "kott", label: "Kott Graphite" },
  { id: "vscode", label: "VS Code Dark" }, { id: "nord", label: "Nord" }, { id: "light", label: "Kott Light" },
  { id: "tokyo-night", label: "Tokyo Night" }, { id: "tokyo-storm", label: "Tokyo Night Storm" }, { id: "tokyo-light", label: "Tokyo Night Light" },
  { id: "catppuccin-latte", label: "Catppuccin Latte" }, { id: "catppuccin-frappe", label: "Catppuccin Frappé" },
  { id: "catppuccin-macchiato", label: "Catppuccin Macchiato" }, { id: "catppuccin-mocha", label: "Catppuccin Mocha" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export type Settings = {
  "updates.autoCheck": boolean; "updates.autoDownload": boolean; "updates.channel": "default" | "stable" | "beta" | "alpha";
  "editor.fontSize": number; "editor.tabSize": number; "editor.wordWrap": boolean;
  "files.autoSave": "off" | "afterDelay" | "onFocusChange"; "files.autoSaveDelay": number;
  "go.formatOnSave": boolean; "go.organizeImportsOnSave": boolean;
  "terminal.fontSize": number; "appearance.theme": ThemeId;
  "go.executablePath": string; "go.goplsPath": string; "debug.delvePath": string;
  "git.defaultView": "changes" | "graph" | "stashes";
};
export type SettingKey = keyof Settings;
type Descriptor = { key: SettingKey; type: "number" | "boolean" | "select" | "string"; group: string; label: string; scope: "application"; default: Settings[SettingKey]; validate: (value: unknown) => boolean; min?: number; max?: number; options?: readonly { id: string; label: string }[] };
const integer = (min: number, max: number) => (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const boolean = (value: unknown) => typeof value === "boolean";
const executable = (value: unknown) => typeof value === "string" && value.length <= 4096 && !value.includes("\0");
export const SETTING_DEFINITIONS: readonly Descriptor[] = [
  { key: "updates.autoCheck", type: "boolean", group: "Updates", label: "Automatically check for updates", scope: "application", default: true, validate: boolean },
  { key: "updates.autoDownload", type: "boolean", group: "Updates", label: "Automatically download verified updates", scope: "application", default: false, validate: boolean },
  { key: "updates.channel", type: "select", group: "Updates", label: "Update channel", scope: "application", default: "default", validate: value => ["default", "stable", "beta", "alpha"].includes(String(value)), options: [{ id: "default", label: "Build default" }, { id: "stable", label: "Stable" }, { id: "beta", label: "Beta / RC" }, { id: "alpha", label: "Alpha" }] },
  { key: "go.executablePath", type: "string", group: "Go", label: "Go executable path (blank: automatic)", scope: "application", default: "", validate: executable },
  { key: "go.goplsPath", type: "string", group: "Go", label: "gopls executable path (blank: automatic)", scope: "application", default: "", validate: executable },
  { key: "debug.delvePath", type: "string", group: "Debug", label: "Delve executable path (blank: automatic)", scope: "application", default: "", validate: executable },
  { key: "git.defaultView", type: "select", group: "Git", label: "Default Source Control view", scope: "application", default: "changes", validate: value => typeof value === "string" && ["changes", "graph", "stashes"].includes(value), options: [{ id: "changes", label: "Changes" }, { id: "graph", label: "Git Graph" }, { id: "stashes", label: "Stashes" }] },
  { key: "editor.fontSize", type: "number", group: "Editor", label: "Editor font size", scope: "application", default: 14, min: 10, max: 32, validate: integer(10, 32) },
  { key: "editor.tabSize", type: "number", group: "Editor", label: "Tab size", scope: "application", default: 4, min: 1, max: 8, validate: integer(1, 8) },
  { key: "editor.wordWrap", type: "boolean", group: "Editor", label: "Word wrap", scope: "application", default: false, validate: boolean },
  { key: "files.autoSave", type: "select", group: "Files", label: "Auto Save", scope: "application", default: "afterDelay", validate: value => typeof value === "string" && ["off", "afterDelay", "onFocusChange"].includes(value), options: [{ id: "off", label: "Off" }, { id: "afterDelay", label: "After delay" }, { id: "onFocusChange", label: "On focus change" }] },
  { key: "files.autoSaveDelay", type: "number", group: "Files", label: "Auto Save delay (ms)", scope: "application", default: 2500, min: 500, max: 60000, validate: integer(500, 60000) },
  { key: "go.formatOnSave", type: "boolean", group: "Go", label: "Format on Save", scope: "application", default: false, validate: boolean },
  { key: "go.organizeImportsOnSave", type: "boolean", group: "Go", label: "Organize Imports on Save", scope: "application", default: false, validate: boolean },
  { key: "terminal.fontSize", type: "number", group: "Terminal", label: "Terminal font size", scope: "application", default: 13, min: 10, max: 32, validate: integer(10, 32) },
  { key: "appearance.theme", type: "select", group: "Appearance", label: "Color theme", scope: "application", default: "monochrome", validate: value => THEMES.some(theme => theme.id === value), options: THEMES },
];
export const DEFAULT_SETTINGS = Object.freeze(Object.fromEntries(SETTING_DEFINITIONS.map(setting => [setting.key, setting.default])) as Settings);
export function validateSettings(value: unknown): Settings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Settings must be an object.");
  const values = value as Record<string, unknown>;
  for (const key of Object.keys(values)) if (!SETTING_DEFINITIONS.some(setting => setting.key === key)) throw new Error(`Unknown setting: ${key}`);
  for (const setting of SETTING_DEFINITIONS) if (setting.key in values && !setting.validate(values[setting.key])) throw new Error(`Invalid setting: ${setting.key}`);
  return { ...DEFAULT_SETTINGS, ...values } as Settings;
}
