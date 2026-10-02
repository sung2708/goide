import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeSwitcher, { THEME_STORAGE_KEY } from "./ThemeSwitcher";

describe("Color theme preference", () => {
  beforeEach(() => localStorage.removeItem(THEME_STORAGE_KEY));
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(THEME_STORAGE_KEY);
    delete document.documentElement.dataset.theme;
  });

  it("changes the active theme immediately and restores the preference after remount", () => {
    const view = render(<ThemeSwitcher />);
    expect(document.documentElement.dataset.theme).toBe("monochrome");
    fireEvent.change(screen.getByRole("combobox", { name: "Color theme" }), { target: { value: "light" } });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    view.unmount();
    render(<ThemeSwitcher />);
    expect(screen.getByRole("combobox", { name: "Color theme" })).toHaveValue("light");
  });

  it("falls back to black and white for an unknown saved theme", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "unknown");
    render(<ThemeSwitcher />);
    expect(document.documentElement.dataset.theme).toBe("monochrome");
  });

  it.each([
    "tokyo-night", "tokyo-storm", "tokyo-light", "catppuccin-latte",
    "catppuccin-frappe", "catppuccin-macchiato", "catppuccin-mocha", "monochrome",
  ])("restores the saved %s palette", (theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    render(<ThemeSwitcher />);
    expect(screen.getByRole("combobox", { name: "Color theme" })).toHaveValue(theme);
    expect(document.documentElement.dataset.theme).toBe(theme);
  });

  it("allows theme changes when persistent storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Unavailable"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Unavailable"); });
    render(<ThemeSwitcher />);
    fireEvent.change(screen.getByRole("combobox", { name: "Color theme" }), { target: { value: "nord" } });
    expect(document.documentElement.dataset.theme).toBe("nord");
  });
});
