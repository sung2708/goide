import { expect, it, vi } from "vitest";
import type * as Monaco from "monaco-editor";
import { markdownBlocks, renderMarkdown, mountMarkdownPreview } from "./monacoMarkdown";
it("maps headings/lists/fenced code back to source rows with LF and CRLF", () => { for (const eol of ["\n", "\r\n"]) { const blocks = markdownBlocks(["# heading", "", "- one", "- two", "", "```go", "// tiếng Việt 👋", "```", ""].join(eol)); expect(blocks.map(block => [block.fromLine, block.toLine, block.kind])).toEqual([[1, 1, "heading"], [3, 4, "list"], [6, 8, "code"]]); } });
it("renders formatted Markdown while retaining Unicode", () => { const node = renderMarkdown("**Xin chào** 👋 and `code` and *italic*"); expect(node.querySelector("strong")?.textContent).toBe("Xin chào"); expect(node.querySelector("code")?.textContent).toBe("code"); expect(node.querySelector("em")?.textContent).toBe("italic"); expect(node.textContent).toContain("👋"); });
it("sanitizes active HTML, resource loads and navigation", () => { const node = renderMarkdown('<script>alert(1)</script><img src="https://example.com/x" onerror="alert(2)"><iframe src="x"></iframe> [link](javascript:alert(3))'); expect(node.querySelector("script, iframe, img, [onerror], [href]")).toBeNull(); });
it("strips responsive media and SVG resource paths before inserting preview HTML", () => {
  const node = renderMarkdown('<img src="https://example.com/image" srcset="https://example.com/large 2x" alt="image"><svg><image href="https://example.com/svg" /></svg><video poster="https://example.com/poster"><source src="https://example.com/movie"></video><a href="https://example.com/page">link</a>');
  expect(node.querySelector("img, svg, image, video, source, [src], [srcset], [href], [poster]")).toBeNull();
  expect(node.textContent).toContain("image"); expect(node.textContent).toContain("link");
});
it("visits only viewport rows inside a long fenced block", () => {
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; }); vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const lines = ["```go", ...Array.from({ length: 10000 }, () => "// code"), "```"];
  const model = { getValue: () => lines.join("\n"), getVersionId: () => 1, getLineCount: () => lines.length, getLineContent: vi.fn((line: number) => lines[line - 1]), getLineMaxColumn: () => 8 };
  const view = new Proxy({ getModel: () => model, getSelection: () => null, getVisibleRanges: () => [{ startLineNumber: 5000, endLineNumber: 5010 }], getLayoutInfo: () => ({ contentWidth: 400 }), getOption: () => 22, createDecorationsCollection: () => ({ set: vi.fn(), clear: vi.fn() }), addContentWidget: vi.fn(), removeContentWidget: vi.fn(), layoutContentWidget: vi.fn() }, { get(target, key) { if (String(key).startsWith("on")) return () => ({ dispose: vi.fn() }); return target[key as keyof typeof target]; } });
  const cleanup = mountMarkdownPreview(view as unknown as Monaco.editor.IStandaloneCodeEditor, { editor: { EditorOption: { lineHeight: 1 }, ContentWidgetPositionPreference: { EXACT: 0 } } } as unknown as typeof Monaco);
  try { frame!(0); expect(model.getLineContent).toHaveBeenCalledTimes(31); expect(view.addContentWidget).toHaveBeenCalledTimes(31); } finally { cleanup(); vi.unstubAllGlobals(); }
});
it("reveals only the hovered row, keeps the caret row editable and reuses other widgets", () => {
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const listeners: Record<string, Function> = {}, dispose = vi.fn();
  const lines = ["# Title", "- **one**", "- two"];
  const model = { getValue: vi.fn(() => lines.join("\n")), getVersionId: () => 1, getLineCount: () => 3, getLineContent: (line: number) => lines[line - 1], getLineMaxColumn: (line: number) => lines[line - 1].length + 1 };
  const collection = { set: vi.fn(), clear: vi.fn() };
  const view = new Proxy({ getModel: () => model, getSelection: () => ({ startLineNumber: 1, endLineNumber: 1 }), getVisibleRanges: () => [{ startLineNumber: 1, endLineNumber: 3 }], getLayoutInfo: () => ({ contentWidth: 400 }), getOption: () => 22, createDecorationsCollection: () => collection, addContentWidget: vi.fn(), removeContentWidget: vi.fn(), layoutContentWidget: vi.fn() }, { get(target, key) { if (String(key).startsWith("on")) return (callback: Function) => { listeners[String(key)] = callback; return { dispose }; }; return target[key as keyof typeof target]; } });
  const cleanup = mountMarkdownPreview(view as unknown as Monaco.editor.IStandaloneCodeEditor, { editor: { EditorOption: { lineHeight: 1 }, ContentWidgetPositionPreference: { EXACT: 0 } } } as unknown as typeof Monaco);
  try {
    frame!(0); expect(view.addContentWidget).toHaveBeenCalledTimes(2);
    expect(collection.set.mock.calls[0][0].map((item: any) => item.range.startLineNumber)).toEqual([2, 3]);
    listeners.onMouseMove({ target: { position: { lineNumber: 2 } } }); frame!(0);
    expect(collection.set.mock.calls[1][0].map((item: any) => item.range.startLineNumber)).toEqual([3]);
    expect(view.addContentWidget).toHaveBeenCalledTimes(2); expect(model.getValue).toHaveBeenCalledTimes(1);
    listeners.onMouseLeave(); frame!(0); expect(view.addContentWidget).toHaveBeenCalledTimes(3);
  } finally { cleanup(); vi.unstubAllGlobals(); }
  expect(dispose).toHaveBeenCalledTimes(6); expect(collection.clear).toHaveBeenCalledOnce();
});
