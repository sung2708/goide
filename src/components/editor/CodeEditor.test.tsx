import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentSession } from "../../features/documents/DocumentSession";
import { settingsStore } from "../../features/settings/SettingsStore";
import type { SemanticAnalysisResult } from "../../features/semantics/types";
import CodeEditor from "./CodeEditor";

const mock = vi.hoisted(() => {
  const listeners: Record<string, (event?: any) => void> = {}, actions: Record<string, any> = {};
  const disposals: Array<ReturnType<typeof vi.fn>> = [], models: any[] = [], collections: any[] = [];
  let model: any = null, position = { lineNumber: 1, column: 1 };
  const listen = (name: string) => (callback: (event?: any) => void) => { listeners[name] = callback; const dispose = vi.fn(); disposals.push(dispose); return { dispose }; };
  const view = { getModel: () => model, setModel: vi.fn((next: any) => { model = next; }), getValue: () => model?.getValue() ?? "", getPosition: () => position, setPosition: vi.fn((next: any) => { position = next; }),
    getVisibleRanges: () => [{ startLineNumber: 1, endLineNumber: 10 }], getSelection: () => null, getScrolledVisiblePosition: ({ lineNumber }: any) => ({ top: lineNumber * 20, left: 12 }),
    saveViewState: vi.fn(() => ({ position })), restoreViewState: vi.fn(), updateOptions: vi.fn(), focus: vi.fn(), revealPositionInCenter: vi.fn(), layout: vi.fn(), dispose: vi.fn(),
    addContentWidget: vi.fn(), removeContentWidget: vi.fn(), addAction: vi.fn((action: any) => { actions[action.id] = action; return { dispose: vi.fn() }; }),
    createDecorationsCollection: vi.fn((values: any[]) => { const collection = { values, set: vi.fn(), clear: vi.fn() }; collections.push(collection); return collection; }),
    onDidChangeModelContent: listen("content"), onDidChangeCursorPosition: listen("cursor"), onDidScrollChange: listen("scroll"), onMouseMove: listen("move"), onMouseLeave: listen("leave"), onMouseDown: listen("down"), onDidBlurEditorWidget: listen("blur"),
    trigger: vi.fn(),
  };
  const range = class { constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {} };
  const providerDispose = vi.fn(); const register = vi.fn(() => ({ dispose: providerDispose }));
  const api = { Range: range, Uri: { parse: (value: string) => value }, KeyMod: { CtrlCmd: 2048 }, KeyCode: { KeyS: 49, KeyF: 36, KeyH: 38 }, MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
    languages: { registerCompletionItemProvider: register, registerHoverProvider: register, registerSignatureHelpProvider: register, registerFoldingRangeProvider: register, registerSelectionRangeProvider: register },
    editor: { EndOfLineSequence: { LF: 0, CRLF: 1 }, MouseTargetType: { GUTTER_GLYPH_MARGIN: 2 }, ContentWidgetPositionPreference: { EXACT: 0 }, create: vi.fn(() => view), defineTheme: vi.fn(), setTheme: vi.fn(), setModelMarkers: vi.fn(),
      createModel: vi.fn((text: string, _language: string, uri: string) => {
        const item = { text, uri, disposed: false, getValue: () => item.text, isDisposed: () => item.disposed, dispose: vi.fn(() => { item.disposed = true; }), getLineCount: () => item.text.split("\n").length, getLineContent: (line: number) => item.text.split("\n")[line - 1], getLineMaxColumn: (line: number) => item.text.split("\n")[line - 1].length + 1,
          getPositionAt: (offset: number) => ({ lineNumber: item.text.slice(0, offset).split("\n").length, column: offset - item.text.slice(0, offset).lastIndexOf("\n") }), getOffsetAt: (p: any) => item.text.split("\n").slice(0, p.lineNumber - 1).reduce((sum: number, line: string) => sum + line.length + 1, 0) + p.column - 1,
          getEOL: () => item.text.includes("\r\n") ? "\r\n" : "\n", pushEOL: vi.fn((eol: number) => { item.text = item.text.replace(/\r\n|\r|\n/g, eol ? "\r\n" : "\n"); }),
          getFullModelRange: () => ({}), pushStackElement: vi.fn(), pushEditOperations: vi.fn((_selection: any, edits: any) => { item.text = edits[0].text; }), findMatches: vi.fn(() => []) };
        models.push(item); return item;
      }),
    },
  };
  return { api, view, listeners, actions, models, collections, disposals, providerDispose, reset: () => { model = null; position = { lineNumber: 1, column: 1 }; models.length = 0; collections.length = 0; disposals.length = 0; } };
});
vi.mock("../../features/editor/monacoRuntime", () => ({ monaco: mock.api }));
vi.mock("../../features/semantics/createSemanticAnalysisWorker", () => ({ createSemanticAnalysisWorker: vi.fn(() => ({ postMessage: vi.fn(), terminate: vi.fn(), onmessage: null })) }));
beforeEach(() => { vi.clearAllMocks(); mock.reset(); localStorage.clear(); settingsStore.refresh(); });
const mount = async (props: Partial<React.ComponentProps<typeof CodeEditor>> = {}) => { const result = render(<CodeEditor value={"package main\nfunc main() {}\n"} {...props} />); await waitFor(() => expect(mock.api.editor.create).toHaveBeenCalledOnce()); await waitFor(() => expect(mock.view.getModel()).not.toBeNull()); return result; };
describe("Monaco editor boundary", () => {
  it("creates one editor and keeps callbacks current without reinstalling providers", async () => {
    const first = vi.fn(), latest = vi.fn(); const rendered = await mount({ onSave: first });
    rendered.rerender(<CodeEditor value={"package main\nfunc main() {}\n"} onSave={latest} />);
    mock.actions["goro.save"].run(); expect(first).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledWith("package main\nfunc main() {}\n"); expect(mock.api.editor.create).toHaveBeenCalledOnce(); expect(mock.api.languages.registerHoverProvider).toHaveBeenCalledTimes(6);
  });
  it("switches models without remounting the editor and disposes a closed inactive tab", async () => {
    const session = new DocumentSession(); session.reset("D:/project"); const first = session.open("main.go", "package main"), second = session.open("other.go", "package main");
    const rendered = await mount({ documentSnapshot: session.snapshot(), value: session.active!.text }); const secondModel = mock.view.getModel();
    session.activate(first.id); rendered.rerender(<CodeEditor value={session.active!.text} documentSnapshot={session.snapshot()} />); expect(mock.view.getModel()).not.toBe(secondModel); expect(secondModel.disposed).toBe(false);
    session.close(second.id); rendered.rerender(<CodeEditor value={session.active!.text} documentSnapshot={session.snapshot()} />); expect(secondModel.disposed).toBe(true); expect(mock.api.editor.create).toHaveBeenCalledOnce(); expect(mock.view.saveViewState).toHaveBeenCalled();
  });
  it("emits cursor UTF-16 offsets, visible lines and independent counterpart anchors", async () => {
    const cursor = vi.fn(), anchor = vi.fn(), counterpart = vi.fn(), viewport = vi.fn(); await mount({ onCursorOffsetChange: cursor, onInteractionAnchorChange: anchor, onCounterpartAnchorChange: counterpart, onViewportRangeChange: viewport, counterpartLine: 2 });
    mock.view.setPosition({ lineNumber: 2, column: 5 }); act(() => mock.listeners.cursor()); expect(cursor).toHaveBeenLastCalledWith(17); expect(anchor).toHaveBeenLastCalledWith({ top: 40, left: 12 }); expect(counterpart).toHaveBeenLastCalledWith({ top: 40, left: 12 }); expect(viewport).toHaveBeenLastCalledWith({ fromLine: 1, toLine: 10 });
  });
  it("reports hover movement and clears hover on leave", async () => { const hover = vi.fn(); await mount({ onHoverLineChange: hover }); act(() => mock.listeners.move({ target: { position: { lineNumber: 2 } } })); expect(hover).toHaveBeenLastCalledWith(2); act(() => mock.listeners.leave()); expect(hover).toHaveBeenLastCalledWith(null); });
  it("toggles only the breakpoint glyph gutter, not folding or text", async () => {
    const toggle = vi.fn(); await mount({ onToggleBreakpoint: toggle }); const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    act(() => mock.listeners.down({ target: { type: 2, position: { lineNumber: 2 } }, event })); expect(toggle).toHaveBeenCalledWith(2); toggle.mockClear(); act(() => mock.listeners.down({ target: { type: 3, position: { lineNumber: 2 } }, event })); expect(toggle).not.toHaveBeenCalled();
  });
  it("routes handled modifier clicks through Goro instead of duplicate navigation", async () => { const modifier = vi.fn(() => true); await mount({ onModifierClickLine: modifier }); const event = { ctrlKey: true, preventDefault: vi.fn(), stopPropagation: vi.fn() }; mock.listeners.down({ target: { type: 6, position: { lineNumber: 2 } }, event }); expect(modifier).toHaveBeenCalledWith(2); expect(event.stopPropagation).toHaveBeenCalledOnce(); });
  it("releases focus signals on blur", async () => { const cursor = vi.fn(), line = vi.fn(), anchor = vi.fn(); await mount({ onCursorOffsetChange: cursor, onSelectionLineChange: line, onInteractionAnchorChange: anchor }); act(() => mock.listeners.blur()); expect(cursor).toHaveBeenLastCalledWith(null); expect(line).toHaveBeenLastCalledWith(null); expect(anchor).toHaveBeenLastCalledWith(null); });
  it("reveals a jump once with bounded columns", async () => { const jump = { line: 2, column: 999, requestId: 4 }; const rendered = await mount({ jumpRequest: jump }); expect(mock.view.setPosition).toHaveBeenCalledWith({ lineNumber: 2, column: 15 }); expect(mock.view.focus).toHaveBeenCalled(); const calls = mock.view.revealPositionInCenter.mock.calls.length; rendered.rerender(<CodeEditor value={"package main\nfunc main() {}\n"} jumpRequest={jump} />); expect(mock.view.revealPositionInCenter).toHaveBeenCalledTimes(calls); });
  it("keeps diagnostics, race findings, breakpoints and execution decorations separate", async () => {
    await mount({ breakpoints: [2], executionLine: 2, hintLine: 1, diagnostics: [{ source: "race-detector", severity: "error", message: "race", range: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 2 } }] });
    expect(mock.api.editor.setModelMarkers).toHaveBeenCalledWith(mock.view.getModel(), "goro.race", expect.arrayContaining([expect.objectContaining({ message: "race" })])); expect(mock.collections.some(collection => collection.values?.some((value: any) => value.options.glyphMarginClassName === "goro-breakpoint"))).toBe(true); expect(mock.collections.some(collection => collection.values?.some((value: any) => value.options.className === "goro-debug-current-line"))).toBe(true);
  });
  it("applies read-only, wrap, tab size and fonts without replacing models", async () => { const rendered = await mount({ editable: false }); expect(mock.view.updateOptions).toHaveBeenCalledWith(expect.objectContaining({ readOnly: true, wordWrap: "off" })); const model = mock.view.getModel(); act(() => { settingsStore.update("editor.wordWrap", true); settingsStore.update("editor.fontSize", 18); }); rendered.rerender(<CodeEditor value={"package main\nfunc main() {}\n"} editable={false} />); expect(mock.view.getModel()).toBe(model); expect(mock.view.updateOptions).toHaveBeenLastCalledWith(expect.objectContaining({ fontSize: 18, wordWrap: "on" })); });
  it("exposes custom find commands and suppresses them during workspace search", async () => { let commands: any; const rendered = await mount({ onCommandsChange: value => { commands = value; } }); act(() => commands.find()); expect(screen.getByRole("textbox", { name: "Find in file" })).toBeInTheDocument(); rendered.rerender(<CodeEditor value={"package main\nfunc main() {}\n"} suppressFindWidget />); expect(screen.queryByRole("textbox", { name: "Find in file" })).toBeNull(); });
  it("fully disposes listeners, providers and models on unmount", async () => { const rendered = await mount(); rendered.unmount(); expect(mock.view.dispose).toHaveBeenCalledOnce(); expect(mock.models.every(model => model.disposed)).toBe(true); expect(mock.disposals.every(dispose => dispose.mock.calls.length > 0)).toBe(true); expect(mock.providerDispose).toHaveBeenCalledTimes(6); });
  it("accepts only semantic results matching the current source and disposes only owned clients", async () => {
    let publish!: (result: SemanticAnalysisResult) => void; const symbols = vi.fn();
    const client = { syncDocument: vi.fn(), requestAnalysis: vi.fn(), subscribe: vi.fn((callback: typeof publish) => { publish = callback; return vi.fn(); }), dispose: vi.fn() };
    const rendered = await mount({ filePath: "main.go", semanticAnalysisClient: client, onDocumentSymbolsChange: symbols });
    const result = { filePath: "main.go", version: 1, sourceText: "outdated", symbols: [{ name: "main", kind: "function" as const, range: { from: 13, to: 27 } }], folds: [], selectionRanges: [] };
    symbols.mockClear(); publish(result); expect(symbols).not.toHaveBeenCalled(); publish({ ...result, sourceText: mock.view.getValue() }); expect(symbols).toHaveBeenCalledWith([expect.objectContaining({ name: "main", line: 2 })]); rendered.unmount(); expect(client.dispose).not.toHaveBeenCalled();
  });
});
