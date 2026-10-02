import { DEFAULT_SETTINGS, THEMES, validateSettings, type Settings, type SettingKey } from "./model";
export const SETTINGS_STORAGE_KEY = "goide.settings.v1";
export const THEME_STORAGE_KEY = "goide.colorTheme";
type StorageLike = Pick<Storage, "getItem" | "setItem">;
export type SettingsSnapshot = { values: Readonly<Settings>; error: string | null };
/** Centralize validation, persistence, migration and reactive application settings. */
export class SettingsStore {
  private listeners = new Set<() => void>();
  private invalidStored = false;
  private raw: string | null | undefined; private legacy: string | null | undefined;
  private state: SettingsSnapshot = { values: DEFAULT_SETTINGS, error: null };
  constructor(private storage: () => StorageLike) {}
  snapshot = (): SettingsSnapshot => {
    let raw: string | null, legacy: string | null;
    try { const storage = this.storage(); raw = storage.getItem(SETTINGS_STORAGE_KEY); legacy = storage.getItem(THEME_STORAGE_KEY); }
    catch (error) {
      const message = `Cannot read settings; current session preferences remain active. ${String(error)}`;
      if (this.state.error !== message) this.state = { ...this.state, error: message };
      return this.state;
    }
    if (raw === this.raw && legacy === this.legacy) return this.state;
    this.raw = raw; this.legacy = legacy;
    try {
      let values: Settings;
      if (raw !== null) {
        if (raw.length > 16384) throw new Error("Settings exceed the 16 KiB limit.");
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1) throw new Error("Unsupported settings version. Reset explicitly to use defaults.");
        values = validateSettings(parsed.values);
      } else {
        values = { ...DEFAULT_SETTINGS, "appearance.theme": THEMES.find(theme => theme.id === legacy)?.id ?? "monochrome" };
      }
      this.invalidStored = false;
      this.state = { values: Object.freeze(values), error: null };
    } catch (error) { this.invalidStored = true; this.state = { values: DEFAULT_SETTINGS, error: `Stored settings are invalid; defaults are active. ${String(error)}` }; }
    return this.state;
  };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  refresh = () => { this.raw = undefined; this.legacy = undefined; this.snapshot(); this.listeners.forEach(listener => listener()); };
  update<K extends SettingKey>(key: K, value: Settings[K]) {
    try { const values = this.snapshot().values; if (this.invalidStored) throw new Error("Stored preferences are invalid. Reset preferences explicitly before changing them."); this.persist(validateSettings({ ...values, [key]: value })); }
    catch (error) { this.state = { ...this.state, error: String(error) }; this.listeners.forEach(listener => listener()); }
  }
  reset = () => this.persist({ ...DEFAULT_SETTINGS });
  private persist(values: Settings) {
    this.invalidStored = false;
    let error: string | null = null;
    try {
      const storage = this.storage();
      const raw = JSON.stringify({ version: 1, values });
      storage.setItem(SETTINGS_STORAGE_KEY, raw); this.raw = raw;
      storage.setItem(THEME_STORAGE_KEY, values["appearance.theme"]); this.legacy = values["appearance.theme"];
    } catch (failure) {
      error = `Settings changed for this session but could not be saved. ${String(failure)}`;
      try { this.raw = this.storage().getItem(SETTINGS_STORAGE_KEY); this.legacy = this.storage().getItem(THEME_STORAGE_KEY); } catch { /* Preserve the last readable storage identity. */ }
    }
    this.state = { values: Object.freeze(values), error }; this.listeners.forEach(listener => listener());
  }
}
export const settingsStore = new SettingsStore(() => localStorage);