import { useLayoutEffect } from "react";
import { THEMES, type ThemeId } from "../../features/settings/model";
import { useSettings } from "../../features/settings/useSettings";
export { THEME_STORAGE_KEY } from "../../features/settings/SettingsStore";
export default function ThemeSwitcher() {
  const { values, error, store } = useSettings(); const theme = values["appearance.theme"];
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return <label className="theme-switcher" title={error ?? undefined}>
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" /></svg>
    <select aria-label="Color theme" value={theme} onChange={event => store.update("appearance.theme", event.target.value as ThemeId)}>{THEMES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select>
  </label>;
}