import { describe, expect, it, vi } from "vitest";
import { GOIDE_SIGNAL_PREDICTED_TOKEN, goideEditorExtensions } from "./codemirrorTheme";

describe("codemirrorTheme", () => {
  it("uses CSS token for predicted hint underline color", () => {
    expect(GOIDE_SIGNAL_PREDICTED_TOKEN).toBe("var(--goide-signal-predicted)");
  });

  it("keeps the editor theme extension registered", () => {
    expect(goideEditorExtensions.length).toBeGreaterThan(0);
  });

  it("does not force the scroller height or minHeight in the theme", async () => {
    vi.resetModules();
    const themeSpy = vi.fn((spec: unknown) => ({ spec }));
    vi.doMock("@codemirror/view", async () => {
      const actual = await vi.importActual<typeof import("@codemirror/view")>("@codemirror/view");
      return {
        ...actual,
        EditorView: {
          ...actual.EditorView,
          theme: themeSpy,
        },
      };
    });

    await import("./codemirrorTheme");

    const themeSpec = themeSpy.mock.calls[0]?.[0] as Record<string, Record<string, string>> | undefined;
    expect(themeSpec).toBeDefined();
    expect(themeSpec?.[".cm-scroller"]?.height).toBeUndefined();
    expect(themeSpec?.[".cm-scroller"]?.minHeight).toBeUndefined();
  });
});
