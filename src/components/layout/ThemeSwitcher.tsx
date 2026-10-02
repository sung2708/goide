import { useLayoutEffect, useState } from "react";

export const THEME_STORAGE_KEY = "goide.colorTheme";
const THEMES = [
  { id: "monochrome", label: "Black & White (Default)" },
  { id: "kott", label: "Kott Graphite" },
  { id: "vscode", label: "VS Code Dark" },
  { id: "nord", label: "Nord" },
  { id: "light", label: "Kott Light" },
  { id: "tokyo-night", label: "Tokyo Night" },
  { id: "tokyo-storm", label: "Tokyo Night Storm" },
  { id: "tokyo-light", label: "Tokyo Night Light" },
  { id: "catppuccin-latte", label: "Catppuccin Latte" },
  { id: "catppuccin-frappe", label: "Catppuccin Frappé" },
  { id: "catppuccin-macchiato", label: "Catppuccin Macchiato" },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha" },
] as const;
type ThemeId = (typeof THEMES)[number]["id"];

function readTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.find(({ id }) => id === saved)?.id ?? "monochrome";
  } catch {
    return "monochrome";
  }
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>(readTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme changes still work when persistent storage is unavailable.
    }
  }, [theme]);

  return (
    <label className="theme-switcher">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
      </svg>
      <select aria-label="Color theme" value={theme} onChange={(event) => setTheme(event.target.value as ThemeId)}>
        {THEMES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
      </select>
    </label>
  );
}
