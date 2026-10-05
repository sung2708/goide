import { afterEach, expect, it, vi } from "vitest";
import type * as Monaco from "monaco-editor";
import { applyEditorTheme } from "./monacoTheme";
afterEach(() => document.documentElement.removeAttribute("style"));
it.each([["#141517", "vs-dark"], ["#f4f5f7", "vs"]])("uses existing %s palette, nested aliases and alpha colors", (background, base) => {
  const style = document.documentElement.style;
  for (const [key, value] of Object.entries({ "--base": background, "--bg-editor": "var(--base)", "--text": "#aabbcc", "--bg-active": "rgba(182, 201, 226, 0.08)", "--border-muted": "rgba(244, 245, 247, 0.15)", "--syntax-variable": "var(--text)" })) style.setProperty(key, value);
  const defineTheme = vi.fn(), setTheme = vi.fn();
  applyEditorTheme({ editor: { defineTheme, setTheme } } as unknown as typeof Monaco);
  expect(defineTheme).toHaveBeenCalledWith("goro-palette", expect.objectContaining({ base, colors: expect.objectContaining({ "editor.background": background, "editor.lineHighlightBackground": "#b6c9e214", "editorWidget.border": "#f4f5f726" }), rules: expect.arrayContaining([expect.objectContaining({ token: "identifier", foreground: "aabbcc" })]) }));
  expect(setTheme).toHaveBeenCalledWith("goro-palette");
});
