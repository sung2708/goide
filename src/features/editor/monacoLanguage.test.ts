import { describe, expect, it, vi } from "vitest";
import type * as Monaco from "monaco-editor";
import { markerData, registerLanguageProviders } from "./monacoLanguage";
import type { EditorLanguageAdapter } from "./contracts";
function fixture(adapter: EditorLanguageAdapter) {
  const registrations: Record<string, any[]> = {};
  const dispose = vi.fn();
  const languages = new Proxy({ CompletionItemKind: { Function: 1, Text: 2, Snippet: 3 }, CompletionItemInsertTextRule: { InsertAsSnippet: 4 }, CompletionTriggerKind: { Invoke: 0 } }, { get(target, property) { if (String(property).startsWith("register")) return (_id: string, provider: unknown) => { (registrations[String(property)] ??= []).push(provider); return { dispose }; }; return target[property as keyof typeof target]; } });
  const api = { languages, MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 }, Range: class { constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {} } } as unknown as typeof Monaco;
  let version = 1, disposed = false, active = true, cancelled = false, abort = () => {};
  const model = { getValue: () => "// tiếng Việt 👋\nfmt.Pr", getVersionId: () => version, isDisposed: () => disposed, getWordUntilPosition: () => ({ word: "Pr", startColumn: 5, endColumn: 7 }), getOffsetAt: () => 20, getLineContent: () => "fmt.Pr" } as unknown as Monaco.editor.ITextModel;
  const token = { get isCancellationRequested() { return cancelled; }, onCancellationRequested: (callback: () => void) => { abort = callback; return { dispose: vi.fn() }; } } as unknown as Monaco.CancellationToken;
  const owner = registerLanguageProviders(api, () => active ? model : null, () => adapter, () => null);
  return { api, model, token, owner, registrations, dispose, invalidate: () => version++, switchTab: () => { active = false; }, close: () => { disposed = true; }, cancel: () => { cancelled = true; abort(); } };
}
describe("Monaco language adapter", () => {
  it("does not offer a second function body inside a function-name placeholder", () => {
    const f = fixture({}); Object.assign(f.model, { getLineContent: () => "func main(params) {", getWordUntilPosition: () => ({ word: "main", startColumn: 6, endColumn: 10 }) });
    const result = f.registrations.registerCompletionItemProvider[0].provideCompletionItems(f.model, { lineNumber: 2, column: 10 });
    expect(result.suggestions).toEqual([]); f.owner.dispose();
  });
  it("cancels only old-version queries when model listeners run after a fresh request", async () => {
    const signals: AbortSignal[] = [], resolutions: Array<(value: any[]) => void> = [];
    const f = fixture({ completions: request => { signals.push(request.signal!); return new Promise(done => resolutions.push(done)); } });
    const complete = () => f.registrations.registerCompletionItemProvider[1].provideCompletionItems(f.model, { lineNumber: 2, column: 7 }, { triggerKind: 0 }, f.token);
    const old = complete(); f.invalidate(); const fresh = complete();
    f.owner.cancelStale(f.model);
    expect(signals[0].aborted).toBe(true); expect(signals[1].aborted).toBe(false);
    resolutions[0]([{ label: "old", insertText: "old" }]); resolutions[1]([{ label: "Println", insertText: "Println" }]);
    expect((await old).suggestions).toEqual([]); expect((await fresh).suggestions[0].label).toBe("Println"); f.owner.dispose();
  });
  it("never waits for gopls for a local function declaration snippet", async () => {
    const callback = vi.fn(() => new Promise<any[]>(() => {})); const f = fixture({ completions: callback });
    Object.assign(f.model, { getLineContent: () => "func m" });
    const result = await f.registrations.registerCompletionItemProvider[1].provideCompletionItems(f.model, { lineNumber: 2, column: 7 }, { triggerKind: 0 }, f.token);
    expect(result.suggestions).toEqual([]); expect(callback).not.toHaveBeenCalled(); f.owner.dispose();
  });
  it("reuses an exact recent result but queries again after an edit or cursor change", async () => {
    const callback = vi.fn(async () => [{ label: "Println", insertText: "Println" }]); const f = fixture({ completions: callback });
    const provider = f.registrations.registerCompletionItemProvider[1];
    const complete = (column = 7) => provider.provideCompletionItems(f.model, { lineNumber: 2, column }, { triggerKind: 0 }, f.token);
    await complete(); await complete(); expect(callback).toHaveBeenCalledTimes(1);
    f.invalidate(); await complete(); expect(callback).toHaveBeenCalledTimes(2);
    await complete(6); expect(callback).toHaveBeenCalledTimes(3); f.owner.dispose();
  });
  it("never caches empty or cancelled results", async () => {
    const callback = vi.fn(async () => []); const f = fixture({ completions: callback });
    const provider = f.registrations.registerCompletionItemProvider[1];
    const complete = () => provider.provideCompletionItems(f.model, { lineNumber: 2, column: 7 }, { triggerKind: 0 }, f.token);
    await complete(); await complete(); expect(callback).toHaveBeenCalledTimes(2);
    f.cancel(); await complete(); expect(callback).toHaveBeenCalledTimes(2); f.owner.dispose();
  });
  it("expires the exact-result cache without extending its lifetime on hits", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(100);
    const callback = vi.fn(async () => [{ label: "Println", insertText: "Println" }]); const f = fixture({ completions: callback });
    const complete = () => f.registrations.registerCompletionItemProvider[1].provideCompletionItems(f.model, { lineNumber: 2, column: 7 }, { triggerKind: 0 }, f.token);
    try {
      await complete(); now.mockReturnValue(400); await complete(); expect(callback).toHaveBeenCalledTimes(1);
      now.mockReturnValue(601); await complete(); expect(callback).toHaveBeenCalledTimes(2);
    } finally { now.mockRestore(); f.owner.dispose(); }
  });
  it("marks gopls lists incomplete so typing another letter requests fresh candidates", async () => {
    const f = fixture({ completions: async () => [{ label: "Println", insertText: "Println" }] });
    const result = await f.registrations.registerCompletionItemProvider[1].provideCompletionItems(f.model, { lineNumber: 2, column: 7 }, { triggerKind: 0 }, f.token);
    expect(result.incomplete).toBe(true); f.owner.dispose();
  });
  it("previews package members for Invoke, which Monaco also uses for automatic suggestions", async () => {
    const callback = vi.fn(async () => []); const f = fixture({ completions: callback });
    Object.assign(f.model, { getValue: () => "package main\nfunc main(){fmt}", getLineContent: () => "func main(){fmt}", getOffsetAt: () => 28, getWordUntilPosition: () => ({ word: "fmt", startColumn: 13, endColumn: 16 }) });
    await f.registrations.registerCompletionItemProvider[1].provideCompletionItems(f.model, { lineNumber: 2, column: 16 }, { triggerKind: 0 }, f.token);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ triggerCharacter: ".", fileContent: expect.stringContaining('import "fmt"') })); f.owner.dispose();
  });
  it("forwards automatic dot completion without marking it explicit", async () => {
    const callback = vi.fn(async () => []); const f = fixture({ completions: callback });
    await f.registrations.registerCompletionItemProvider[1].provideCompletionItems(f.model, { lineNumber: 2, column: 7 }, { triggerKind: 1, triggerCharacter: "." }, f.token);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ explicit: false, triggerCharacter: ".", fileContent: "// tiếng Việt 👋\nfmt.Pr" })); f.owner.dispose();
  });
  it("never requests language data for an inactive model", async () => {
    const callback = vi.fn(async () => []); const f = fixture({ completions: callback }); f.switchTab();
    expect((await f.registrations.registerCompletionItemProvider[1].provideCompletionItems(f.model, { lineNumber: 2, column: 7 }, { triggerKind: 0 }, f.token)).suggestions).toEqual([]);
    expect(callback).not.toHaveBeenCalled(); f.owner.dispose();
  });
  it("retains signature labels, UTF-16 parameter ranges and active parameter", async () => {
    const f = fixture({ signature: async () => ({ activeSignature: 0, signatures: [{ label: "Print(👋, arg)", documentation: null, activeParameter: 1, parameters: [{ label: "👋", range: [6, 8], documentation: null }, { label: "arg", range: null, documentation: null }] }] }) });
    const result = await f.registrations.registerSignatureHelpProvider[0].provideSignatureHelp(f.model, { lineNumber: 2, column: 7 }, f.token);
    expect(result.value).toMatchObject({ activeParameter: 1, signatures: [{ parameters: [{ label: [6, 8] }, { label: "arg" }] }] }); f.owner.dispose();
  });
  it("preserves all exposed completion metadata and exact UTF-16 edits", async () => {
    const callback = vi.fn(async () => [{ label: "Print", kind: "function", insertText: "Print", detail: "func", documentation: "**doc**", sortText: "a", filterText: "Pr", preselect: true, commitCharacters: ["("], range: { startLine: 2, startColumn: 5, endLine: 2, endColumn: 7 }, additionalTextEdits: [{ range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 }, newText: 'import "fmt"\n' }] }]);
    const f = fixture({ completions: callback }); const provider = f.registrations.registerCompletionItemProvider[1];
    const result = await provider.provideCompletionItems(f.model, { lineNumber: 2, column: 7 }, { triggerKind: 0 }, f.token);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ line: 2, column: 7, fileContent: "// tiếng Việt 👋\nfmt.Pr", signal: expect.any(AbortSignal) }));
    expect(result.suggestions[0]).toMatchObject({ sortText: "a", filterText: "Pr", preselect: true, commitCharacters: ["("], documentation: { isTrusted: false }, range: { startLineNumber: 2, startColumn: 5 }, additionalTextEdits: [{ text: 'import "fmt"\n' }] }); f.owner.dispose();
  });
  it.each(["cancel", "invalidate", "switchTab", "close"] as const)("rejects a late completion after %s", async action => {
    let resolve!: (value: any[]) => void, signal!: AbortSignal;
    const f = fixture({ completions: request => { signal = request.signal!; return new Promise(done => { resolve = done; }); } });
    const pending = f.registrations.registerCompletionItemProvider[1].provideCompletionItems(f.model, { lineNumber: 2, column: 7 }, { triggerKind: 0 }, f.token);
    f[action](); resolve([{ label: "late", insertText: "late" }]); expect((await pending).suggestions).toEqual([]); if (action === "cancel") expect(signal.aborted).toBe(true); f.owner.dispose();
  });
  it("cancels pending hover requests and disposes every provider", async () => {
    let resolve!: (value: { text: string }) => void, signal!: AbortSignal;
    const f = fixture({ hover: request => { signal = request.signal; return new Promise(done => { resolve = done; }); } });
    const pending = f.registrations.registerHoverProvider[0].provideHover(f.model, { lineNumber: 2, column: 5 }, f.token); f.owner.dispose(); expect(signal.aborted).toBe(true); resolve({ text: "late" }); expect(await pending).toBeNull(); expect(f.dispose).toHaveBeenCalledTimes(6);
  });
  it("maps diagnostics independently from UTF-8 bytes and retains source/code/severity", () => {
    const f = fixture({}); expect(markerData(f.api, [{ severity: "hint", message: "👋", source: "compiler", code: "42", range: { startLine: 2, startColumn: 12, endLine: 3, endColumn: 5 } }])[0]).toMatchObject({ severity: 1, startLineNumber: 2, startColumn: 12, endLineNumber: 3, endColumn: 5, source: "compiler", code: "42" }); f.owner.dispose();
  });
});
