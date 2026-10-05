import type * as Monaco from "monaco-editor";

/** Monaco requires concrete colors. Resolve the user's existing CSS palette,
 * including nested var() tokens, without introducing an independent palette. */
export function applyEditorTheme(api: typeof Monaco) {
  const style = getComputedStyle(document.documentElement);
  const color = (token: string): string => {
    let value = style.getPropertyValue(token).trim();
    for (let attempt = 0; attempt < 8 && value.includes("var("); attempt++) value = value.replace(/var\((--[\w-]+)(?:,\s*([^)]*))?\)/g, (_, name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback || "");
    const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value);
    if (rgba) value = "#" + rgba.slice(1, 4).map(channel => Math.max(0, Math.min(255, Math.round(Number(channel)))).toString(16).padStart(2, "0")).join("") + (rgba[4] !== undefined ? Math.max(0, Math.min(255, Math.round(Number(rgba[4]) * 255))).toString(16).padStart(2, "0") : "");
    return value;
  };
  const background = color("--bg-editor");
  const hex = background.replace("#", "");
  const rgb = hex.length === 6 ? [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16)) : [0, 0, 0];
  const light = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 150;
  const rules = [
    ["comment", "--syntax-comment", "italic"], ["keyword", "--syntax-keyword", "bold"],
    ["string", "--green", ""], ["number", "--peach", ""], ["type", "--syntax-type", ""],
    ["identifier", "--syntax-variable", ""], ["delimiter", "--syntax-operator", ""],
  ].map(([token, variable, fontStyle]) => ({ token, foreground: color(variable).replace(/^#/, ""), fontStyle }));
  const colors: Record<string, string> = {};
  for (const [key, variable] of Object.entries({
    "editor.background": "--bg-editor", "editor.foreground": "--text", "editorLineNumber.foreground": "--overlay1",
    "editorCursor.foreground": "--blue", "editor.selectionBackground": "--surface1", "editor.lineHighlightBackground": "--bg-active",
    "editorGutter.background": "--bg-editor", "editorWidget.background": "--mantle", "editorWidget.foreground": "--text",
    "editorWidget.border": "--border-muted", "editorSuggestWidget.selectedBackground": "--bg-active",
    "editorError.foreground": "--red", "editorWarning.foreground": "--yellow", "editorInfo.foreground": "--blue",
  })) { const value = color(variable); if (/^#[\da-f]{6,8}$/i.test(value)) colors[key] = value; }
  api.editor.defineTheme("goro-palette", { base: light ? "vs" : "vs-dark", inherit: true, rules: rules.filter(rule => /^[\da-f]{6,8}$/i.test(rule.foreground)), colors });
  api.editor.setTheme("goro-palette");
}
