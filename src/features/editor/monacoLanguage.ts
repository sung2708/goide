import type * as Monaco from "monaco-editor";
import type { EditorLanguageAdapter } from "./contracts";
import type { SemanticAnalysisResult } from "../semantics/types";
import { goSnippets } from "./goSnippets";
import { packageCompletionPreview, packageContext, functionContext } from "./packageCompletions";

export function markerData(api: typeof Monaco, diagnostics: readonly import("../../lib/ipc/types").EditorDiagnostic[]): Monaco.editor.IMarkerData[] {
  return diagnostics.map(item => ({ ...item.range, startLineNumber: item.range.startLine, endLineNumber: item.range.endLine,
    severity: item.severity === "error" ? api.MarkerSeverity.Error : item.severity === "warning" ? api.MarkerSeverity.Warning : item.severity === "hint" ? api.MarkerSeverity.Hint : api.MarkerSeverity.Info,
    message: item.message, source: item.source ?? undefined, code: item.code ?? undefined }));
}

/** Only the active model can invoke Goro's active-document language callbacks.
 * Cancellation reaches the existing native $/cancelRequest bridge. */
export function registerLanguageProviders(api: typeof Monaco, active: () => Monaco.editor.ITextModel | null, adapter: () => EditorLanguageAdapter, semantic: () => SemanticAnalysisResult | null) {
  const pending = new Map<AbortController, { model: Monaco.editor.ITextModel; version: number }>();
  // Only exact model versions/cursors may reuse a result. Never reuse edits
  // against a changed prefix, a different tab or an expired tooling context.
  const completionCache = new WeakMap<Monaco.editor.ITextModel, { version: number; line: number; column: number; callback: EditorLanguageAdapter["completions"]; items: import("../../lib/ipc/types").CompletionItem[]; until: number }>();
  const foldingListeners = new Set<(provider: Monaco.languages.FoldingRangeProvider) => void>();
  const foldingProvider: Monaco.languages.FoldingRangeProvider = {
    onDidChange: listener => { foldingListeners.add(listener); return { dispose: () => foldingListeners.delete(listener) }; },
    provideFoldingRanges(model) {
      const result = semantic(); if (model !== active() || result?.sourceText !== model.getValue()) return [];
      return (result?.folds ?? []).map(fold => ({ start: model.getPositionAt(fold.from).lineNumber, end: model.getPositionAt(fold.to).lineNumber })).filter(fold => fold.end > fold.start);
    },
  };
  async function request<T>(model: Monaco.editor.ITextModel, token: Monaco.CancellationToken, run: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    if (model !== active() || token.isCancellationRequested) return null;
    const version = model.getVersionId();
    const controller = new AbortController(); pending.set(controller, { model, version });
    const listener = token.onCancellationRequested(() => controller.abort());
    try {
      const result = await run(controller.signal);
      return controller.signal.aborted || model.isDisposed() || model !== active() || version !== model.getVersionId() ? null : result;
    } finally { listener.dispose(); pending.delete(controller); }
  }
  const providers: Monaco.IDisposable[] = [
    api.languages.registerCompletionItemProvider("go", { provideCompletionItems(model, position) {
      if (model !== active()) return { suggestions: [] };
      const word = model.getWordUntilPosition(position), range = new api.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const line = model.getLineContent(position.lineNumber), prefix = line.slice(0, position.column - 1);
      // A name placeholder in an existing function must not insert another
      // parameter list/body on top of the snippet already being edited.
      const existingFunction = functionContext(prefix) && line.slice(position.column - 1).includes("(");
      const options = existingFunction ? [] : packageContext(prefix) ? [{ label: "main", detail: "package name", insertText: "main" }] : goSnippets.filter(item => functionContext(prefix) ? item.context === "function" : item.context === "general" || item.context === "package" && position.lineNumber === 1);
      return { suggestions: options.map(item => ({ ...item, range, kind: api.languages.CompletionItemKind.Snippet, insertTextRules: api.languages.CompletionItemInsertTextRule.InsertAsSnippet, sortText: `0${item.label}` })) };
    } }),
    api.languages.registerCompletionItemProvider("go", {
      triggerCharacters: ["."],
      async provideCompletionItems(model, position, context, token) {
        const callback = adapter().completions;
        if (!callback) return { suggestions: [] };
        const word = model.getWordUntilPosition(position);
        const source = model.getValue(), prefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
        if (packageContext(prefix) || functionContext(prefix) || /^\s*func$/.test(prefix)) return { suggestions: [] };
        const explicit = context.triggerKind === api.languages.CompletionTriggerKind.Invoke;
        // Monaco uses Invoke for both quick suggestions and Ctrl+Space.
        const preview = context.triggerCharacter !== "." ? packageCompletionPreview(source, model.getOffsetAt(position), word.word) : null;
        if (model !== active() || token.isCancellationRequested) return { suggestions: [] };
        const version = model.getVersionId(), cached = completionCache.get(model);
        const reusable = cached && cached.version === version && cached.line === position.lineNumber && cached.column === position.column && cached.callback === callback && cached.until > Date.now();
        const items = reusable
          ? cached.items
          : await request(model, token, signal => callback({ line: preview?.position.line ?? position.lineNumber, column: preview?.position.column ?? position.column, explicit, triggerCharacter: preview ? "." : context.triggerCharacter, fileContent: preview?.content ?? source, signal }));
        if (!reusable && items?.length) completionCache.set(model, { version, line: position.lineNumber, column: position.column, callback, items, until: Date.now() + 500 });
        const range = new api.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        const kinds: Record<string, Monaco.languages.CompletionItemKind> = { function: api.languages.CompletionItemKind.Function, method: api.languages.CompletionItemKind.Method, variable: api.languages.CompletionItemKind.Variable, field: api.languages.CompletionItemKind.Field, type: api.languages.CompletionItemKind.Class, module: api.languages.CompletionItemKind.Module, keyword: api.languages.CompletionItemKind.Keyword, constant: api.languages.CompletionItemKind.Constant, struct: api.languages.CompletionItemKind.Struct, interface: api.languages.CompletionItemKind.Interface };
        return { incomplete: true, suggestions: (items ?? []).map(item => ({ label: item.label, kind: kinds[item.kind ?? ""] ?? api.languages.CompletionItemKind.Text,
          detail: item.detail ?? undefined, documentation: item.documentation ? { value: item.documentation, isTrusted: false } : undefined,
          insertText: preview ? `${preview.alias}.${item.insertText || item.label}` : item.insertText,
          sortText: item.sortText ?? undefined, filterText: preview ? `${preview.alias}.${item.filterText ?? item.label}` : item.filterText ?? undefined, preselect: item.preselect, commitCharacters: item.commitCharacters, range: !preview && item.range ? new api.Range(item.range.startLine, item.range.startColumn, item.range.endLine, item.range.endColumn) : range,
          additionalTextEdits: preview ? preview.insertion ? [{ range: (() => { const start = model.getPositionAt(preview.insertion!.offset); return new api.Range(start.lineNumber, start.column, start.lineNumber, start.column); })(), text: preview.insertion.text }] : [] : item.additionalTextEdits?.map(edit => ({ range: new api.Range(edit.range.startLine, edit.range.startColumn, edit.range.endLine, edit.range.endColumn), text: edit.newText })),
        })) };
      },
    }),
    api.languages.registerHoverProvider("go", { async provideHover(model, position, token) {
      const callback = adapter().hover; if (!callback) return null;
      const result = await request(model, token, signal => callback({ offset: model.getOffsetAt(position), content: model.getValue(), signal }));
      return result ? { contents: [{ value: result.text, isTrusted: false }] } : null;
    } }),
    api.languages.registerSignatureHelpProvider("go", { signatureHelpTriggerCharacters: ["(", ","], signatureHelpRetriggerCharacters: [")"], async provideSignatureHelp(model, position, token) {
      const callback = adapter().signature; if (!callback) return null;
      const result = await request(model, token, signal => callback({ offset: model.getOffsetAt(position), content: model.getValue(), signal }));
      if (!result || "error" in result) return null;
      return { value: { signatures: result.signatures.map(signature => ({ label: signature.label, documentation: signature.documentation ?? undefined, parameters: signature.parameters.map(parameter => ({ label: parameter.range ?? parameter.label, documentation: parameter.documentation ?? undefined })) })), activeSignature: result.activeSignature, activeParameter: result.signatures[result.activeSignature]?.activeParameter ?? 0 }, dispose() {} };
    } }),
    api.languages.registerFoldingRangeProvider("go", foldingProvider),
    api.languages.registerSelectionRangeProvider("go", { provideSelectionRanges(model, positions) {
      const result = semantic();
      return positions.map(position => {
        const offset = model.getOffsetAt(position);
        const ranges = result?.sourceText === model.getValue() ? result.selectionRanges.filter(range => range.from <= offset && range.to >= offset).sort((a, b) => (a.to - a.from) - (b.to - b.from)) : [];
        return [...ranges.map(range => { const start = model.getPositionAt(range.from), end = model.getPositionAt(range.to); return { range: new api.Range(start.lineNumber, start.column, end.lineNumber, end.column) }; }), { range: model.getFullModelRange() }];
      });
    } }),
  ];
  return {
    semanticChanged() { for (const listener of foldingListeners) listener(foldingProvider); },
    cancelStale(model: Monaco.editor.ITextModel | null) {
      for (const [controller, captured] of pending) {
        if (captured.model === model && captured.version !== model.getVersionId()) controller.abort();
      }
    },
    cancel() { for (const controller of pending.keys()) controller.abort(); },
    dispose() { for (const controller of pending.keys()) controller.abort(); for (const provider of providers) provider.dispose(); foldingListeners.clear(); },
  };
}
