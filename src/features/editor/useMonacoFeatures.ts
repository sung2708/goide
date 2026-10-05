import { useEffect, useRef, type RefObject } from "react";
import type * as Monaco from "monaco-editor";
import type { CodeEditorProps } from "./props";
import type { Settings } from "../settings/model";
import { markerData } from "./monacoLanguage";
import { documentText } from "./MonacoModels";
import { createSemanticAnalysisClient } from "../semantics/createSemanticAnalysisClient";
import { createSemanticAnalysisWorker } from "../semantics/createSemanticAnalysisWorker";
import type { SemanticAnalysisResult } from "../semantics/types";
import type { EditorDiagnostic } from "../../lib/ipc/types";

export type SyntaxSnapshot = { path: string; source: string; diagnostics: EditorDiagnostic[] };

type Context = { editor: RefObject<Monaco.editor.IStandaloneCodeEditor | null>; api: RefObject<typeof Monaco | null>; semantic: RefObject<SemanticAnalysisResult | null>; status: RefObject<HTMLDivElement | null>; ready: number; props: CodeEditorProps; settings: Settings; onError: (error: string) => void; onSemanticChange: () => void; onSyntaxDiagnostics?: (snapshot: SyntaxSnapshot) => void };
export function useMonacoFeatures({ editor, api, semantic, status, ready, props, settings, onError, onSemanticChange, onSyntaxDiagnostics }: Context) {
  const current = useRef(props); current.current = props;
  const notifySemantic = useRef(onSemanticChange); notifySemantic.current = onSemanticChange;
  const notifySyntax = useRef(onSyntaxDiagnostics); notifySyntax.current = onSyntaxDiagnostics;
  const entryNodes = useRef<HTMLElement[]>([]);
  useEffect(() => { for (const node of entryNodes.current) for (const button of node.querySelectorAll("button")) button.disabled = !props.executionActionsEnabled; }, [props.executionActionsEnabled]);
  useEffect(() => {
    const view = editor.current, monaco = api.current, model = view?.getModel(); if (!view || !monaco || !model) return;
    const diagnostics = props.diagnostics ?? [];
    monaco.editor.setModelMarkers(model, "goro.gopls", markerData(monaco, diagnostics.filter(item => item.source !== "race-detector" && item.source !== "go-test")));
    monaco.editor.setModelMarkers(model, "goro.race", markerData(monaco, diagnostics.filter(item => item.source === "race-detector")));
    monaco.editor.setModelMarkers(model, "goro.tests", markerData(monaco, diagnostics.filter(item => item.source === "go-test")));
    const collection = view.createDecorationsCollection([
      ...(props.diagnostics ?? []).filter(item => item.severity === "error" || item.severity === "warning").filter((item, index, items) => items.findIndex(other => other.range.startLine === item.range.startLine) === index).filter(item => item.range.startLine > 0 && item.range.startLine <= model.getLineCount()).map(item => ({ range: new monaco.Range(item.range.startLine, model.getLineMaxColumn(item.range.startLine), item.range.startLine, model.getLineMaxColumn(item.range.startLine)), options: { after: { content: `  ${item.message.replace(/\s+/g, " ").slice(0, 160)}`, inlineClassName: item.severity === "error" ? "goro-inline-error" : "goro-inline-warning", cursorStops: monaco.editor.InjectedTextCursorStops?.None }, hoverMessage: { value: item.message, isTrusted: false } } })),
      ...(props.breakpoints ?? []).filter(line => line > 0 && line <= model.getLineCount()).map(line => ({ range: new monaco.Range(line, 1, line, 1), options: { glyphMarginClassName: "goro-breakpoint", glyphMarginHoverMessage: { value: "Toggle breakpoint" } } })),
      ...[{ line: props.executionLine, className: "goro-debug-current-line" }, { line: props.hintLine, className: "goro-predicted-hint" }].filter(item => item.line && item.line > 0 && item.line <= model.getLineCount()).map(item => ({ range: new monaco.Range(item.line!, 1, item.line!, 1), options: { isWholeLine: true, className: item.className } })),
    ]); return () => collection.clear();
  }, [ready, props.filePath, props.diagnostics, props.breakpoints, props.executionLine, props.hintLine, props.value, editor, api]);
  useEffect(() => {
    const view = editor.current, monaco = api.current, model = view?.getModel(); if (!view || !monaco || !model) return;
    const target = props.externalSearchTarget, ranges: Monaco.editor.IModelDeltaDecoration[] = [];
    if (target && target.line > 0 && target.line <= model.getLineCount() && model.getLineContent(target.line) === target.preview && target.from >= 0 && target.to >= target.from && target.to <= target.preview.length) ranges.push({ range: new monaco.Range(target.line, target.from + 1, target.line, target.to + 1), options: { inlineClassName: "goro-find-match" } });
    else if (!target && props.externalSearchQuery) for (const match of model.findMatches(props.externalSearchQuery, false, false, false, null, false, 2000)) ranges.push({ range: match.range, options: { inlineClassName: "goro-find-match" } });
    const collection = view.createDecorationsCollection(ranges); return () => collection.clear();
  }, [ready, props.filePath, props.value, props.externalSearchQuery, props.externalSearchTarget, editor, api]);
  const handledJump = useRef<number | null>(null);
  useEffect(() => {
    const jump = props.jumpRequest, view = editor.current, model = view?.getModel();
    if (!jump || !view || !model || handledJump.current === jump.requestId || jump.line < 1 || jump.line > model.getLineCount()) return;
    handledJump.current = jump.requestId; const position = { lineNumber: jump.line, column: Math.min(model.getLineMaxColumn(jump.line), Math.max(1, jump.column ?? 1)) };
    view.setPosition(position); view.revealPositionInCenter(position); view.focus();
  }, [ready, props.jumpRequest, props.filePath, editor]);
  useEffect(() => { if (ready && props.signatureRequestTrigger) editor.current?.trigger("goro", "editor.action.triggerParameterHints", {}); }, [ready, props.signatureRequestTrigger, editor]);
  useEffect(() => {
    const view = editor.current, monaco = api.current;
    if (!ready || !view || !monaco || !props.filePath?.endsWith(".go")) { current.current.onDocumentSymbolsChange?.([]); return; }
    const client = props.semanticAnalysisClient ?? createSemanticAnalysisClient(createSemanticAnalysisWorker);
    const widgets: Monaco.editor.IContentWidget[] = [];
    const clearWidgets = () => { for (const widget of widgets) view.removeContentWidget(widget); widgets.length = 0; entryNodes.current = []; };
    const unsubscribe = client.subscribe(result => {
      const model = view.getModel(); if (!model || result.filePath !== current.current.filePath || result.sourceText !== model.getValue()) return;
      semantic.current = result; notifySemantic.current(); clearWidgets();
      notifySyntax.current?.({ path: result.filePath, source: result.sourceText!, diagnostics: (result.syntaxDiagnostics ?? []).map(item => {
        const start = model.getPositionAt(item.range.from), end = model.getPositionAt(Math.max(item.range.from, item.range.to));
        return { source: "Go parser", code: "syntax", severity: "error", message: item.message, range: { startLine: start.lineNumber, startColumn: start.column, endLine: end.lineNumber, endColumn: end.column } };
      }) });
      const bomOffset = current.current.value.startsWith("\uFEFF") ? 1 : 0;
      current.current.onDocumentSymbolsChange?.(result.symbols.map(symbol => ({ ...symbol, from: symbol.range.from + bomOffset, to: symbol.range.to + bomOffset, line: model.getPositionAt(symbol.range.from).lineNumber })));
      for (const [index, action] of (result.entryActions ?? []).filter(action => current.current.filePath?.endsWith("_test.go") ? action.kind === "test" : action.kind === "main").slice(0, 256).entries()) {
        const position = model.getPositionAt(action.range.from), source = result.sourceText!, owner = current.current.selectionContextKey;
        const node = document.createElement("span"); node.className = "goro-entry-actions";
        const widgetHost = document.createElement("span"); widgetHost.append(node);
        node.style.height = `${view.getOption(monaco.editor.EditorOption.lineHeight)}px`;
        node.setAttribute("role", "group");
        node.setAttribute("aria-label", `Actions for ${action.name}`);
        entryNodes.current.push(node);
        for (const intent of ["run", "debug"] as const) {
          const button = document.createElement("button"); button.textContent = `${intent === "run" ? "Run" : "Debug"}${action.kind === "test" ? " Test" : ""}`; button.disabled = !current.current.executionActionsEnabled;
          button.type = "button";
          button.setAttribute("aria-label", `${button.textContent} ${action.name}`);
          button.onclick = () => { if (node.isConnected && current.current.executionActionsEnabled && current.current.selectionContextKey === owner && view.getModel() === model && model.getValue() === source) current.current.onEntryAction?.(action, intent, documentText(source, current.current.value)); };
          node.append(button);
        }
        const widget: Monaco.editor.IContentWidget = { getId: () => `goro.entry.${index}`, getDomNode: () => widgetHost, getPosition: () => ({ position: { lineNumber: position.lineNumber, column: model.getLineMaxColumn(position.lineNumber) }, preference: [monaco.editor.ContentWidgetPositionPreference.EXACT] }) };
        widgets.push(widget); view.addContentWidget(widget);
      }
    });
    const sync = () => { semantic.current = null; clearWidgets(); const path = current.current.filePath; if (path) { client.syncDocument({ filePath: path, text: view.getValue() }); client.requestAnalysis(path); } };
    sync(); const subscription = view.onDidChangeModelContent(sync);
    return () => { clearWidgets(); unsubscribe(); subscription.dispose(); if (!props.semanticAnalysisClient) client.dispose(); };
  }, [ready, props.filePath, props.semanticAnalysisClient, editor, api, semantic]);
  useEffect(() => {
    const view = editor.current; if (!view || !settings["editor.vimEnabled"]) return;
    let cancelled = false, dispose = () => {};
    void import("monaco-vim").then(module => {
      if (cancelled) return;
      const adapter = module.initVimMode(view, status.current);
      // monaco-vim's :write delegates to the adapter save callback.
      (adapter as unknown as { save: () => void }).save = () => { current.current.onSave?.(documentText(view.getValue(), current.current.value)); };
      const vim = (module.VimMode as unknown as { Vim: { setOption: (name: string, value: unknown, editor: unknown) => void; handleKey: (editor: unknown, key: string) => void; map: (lhs: string, rhs: string, context: string) => void; unmap: (lhs: string, context: string) => void } }).Vim;
      vim.setOption("insertModeEscKeysTimeout", settings["editor.vimEscTimeout"], adapter);
      if (settings["editor.vimStartInInsert"]) vim.handleKey(adapter, "i");
      const mappings = settings["editor.vimKeyBindings"].split(/\r?\n/).map(line => /^(\S+)\s+(\S+)\s+(insert|normal|visual)$/.exec(line.trim())).filter(match => match !== null);
      // noremap silently ignores special keys such as <Esc> in this adapter.
      // map supports special keys and multi-key RHS sequences.
      for (const match of mappings) vim.map(match[1], match[2], match[3]);
      dispose = () => { for (const match of mappings) vim.unmap(match[1], match[3]); adapter.dispose(); };
    }).catch(reason => { if (!cancelled) onError(`Vim initialization failed: ${String(reason)}`); });
    return () => { cancelled = true; dispose(); };
  }, [ready, settings["editor.vimEnabled"], settings["editor.vimEscTimeout"], settings["editor.vimStartInInsert"], settings["editor.vimKeyBindings"], editor, status, onError]);
  useEffect(() => {
    const view = editor.current; if (!view || !/\.(md|markdown)$/i.test(props.filePath ?? "")) return;
    let cancelled = false, dispose = () => {};
    void import("./monacoMarkdown").then(module => { if (!cancelled && api.current) dispose = module.mountMarkdownPreview(view, api.current); }).catch(reason => { if (!cancelled) onError(`Markdown initialization failed: ${String(reason)}`); });
    return () => { cancelled = true; dispose(); };
  }, [ready, props.filePath, editor, onError]);
}
