import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { THEMES, type ThemeId } from "../../features/settings/model";
import { useSettings } from "../../features/settings/useSettings";
export { THEME_STORAGE_KEY } from "../../features/settings/SettingsStore";

export default function ThemeSwitcher() {
  const { values, error, store } = useSettings();
  const theme = values["appearance.theme"];
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedLabel = THEMES.find((t) => t.id === theme)?.label ?? theme;

  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useLayoutEffect(() => {
    if (open) {
      setActiveIndex(Math.max(0, THEMES.findIndex(({ id }) => id === theme)));
      listRef.current?.focus();
    }
  }, [open, theme]);
  const choose = (id: ThemeId) => {
    store.update("appearance.theme", id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={containerRef} className="theme-switcher-custom" title={error ?? undefined}>
      <select
        aria-label="Color theme"
        value={theme}
        onChange={(e) => {
          store.update("appearance.theme", e.target.value as ThemeId);
        }}
        className="sr-only"
        tabIndex={-1}
      >
        {THEMES.map(({ id, label }) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>

      <button
        ref={buttonRef}
        type="button"
        aria-label="Color theme"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="theme-switcher-btn"
        onClick={() => setOpen((v) => !v)}
      >
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
        </svg>
        <span className="theme-switcher-label">{selectedLabel}</span>
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          tabIndex={0}
          role="listbox"
          aria-label="Color theme"
          aria-activedescendant={`color-theme-${THEMES[activeIndex].id}`}
          onKeyDown={(event) => {
            if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " ", "Escape"].includes(event.key)) event.preventDefault();
            if (event.key === "ArrowDown") setActiveIndex((index) => (index + 1) % THEMES.length);
            if (event.key === "ArrowUp") setActiveIndex((index) => (index + THEMES.length - 1) % THEMES.length);
            if (event.key === "Home") setActiveIndex(0);
            if (event.key === "End") setActiveIndex(THEMES.length - 1);
            if (event.key === "Enter" || event.key === " ") choose(THEMES[activeIndex].id);
            if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
          }}
          className="theme-switcher-list"
        >
          {THEMES.map(({ id, label }, index) => (
            <li
              key={id}
              id={`color-theme-${id}`}
              role="option"
              aria-selected={id === theme}
              className={`theme-switcher-option${index === activeIndex ? " theme-switcher-option--active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(id as ThemeId);
              }}
            >
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
