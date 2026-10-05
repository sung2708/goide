import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import { useSettings } from "../../features/settings/useSettings";
import { MonacoModels, editorText, documentText } from "../../features/editor/MonacoModels";
import { preserveEditorOffset } from "../../features/editor/preserveEditorSelection";
import { registerLanguageProviders } from "../../features/editor/monacoLanguage";
import { applyEditorTheme } from "../../features/editor/monacoTheme";
import { useMonacoFind } from "../../features/editor/useMonacoFind";
import { useMonacoFeatures, type SyntaxSnapshot } from "../../features/editor/useMonacoFeatures";
import type { CodeEditorProps } from "../../features/editor/props";
import type { SemanticAnalysisResult } from "../../features/semantics/types";
import FindWidget from "./FindWidget";
import "../../features/editor/editor.css";
export type { EditorCompletionRequest, JumpRequest } from "../../features/editor/contracts";

/** React owns layout/callbacks; product persistence/execution stay in Goro. */
export default function CodeEditor(props: CodeEditorProps) {
  const { values: settings } = useSettings();
  const host = useRef<HTMLDivElement | null>(null), status = useRef<HTMLDivElement | null>(null);
  const editor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null), api = useRef<typeof Monaco | null>(null);
  const registry = useRef<MonacoModels | null>(null), entry = useRef<ReturnType<MonacoModels["get"]>>(null);
  const current = useRef(props); current.current = props;
  const syncing = useRef(false), hovered = useRef<number | null>(null), semantic = useRef<SemanticAnalysisResult | null>(null);
  const providers = useRef<ReturnType<typeof registerLanguageProviders> | null>(null);
  const [ready, setReady] = useState(0), [error, setError] = useState<string | null>(null);
  const [syntax, setSyntax] = useState<SyntaxSnapshot | null>(null);
  const effectiveDiagnostics = useMemo(() => {
    const local = syntax && syntax.path === props.filePath && syntax.source === editorText(props.value) ? syntax.diagnostics : [];
    return [...local, ...(props.diagnostics ?? []).filter(item => item.source === "race-detector" || item.source === "go-test" || !local.some(error => item.severity === "error" && error.range.startLine === item.range.startLine))];
  }, [syntax, props.filePath, props.value, props.diagnostics]);
  const find = useMonacoFind(editor), findRef = useRef(find); findRef.current = find;
  const emit = useRef<() => void>(() => {});
  emit.current = () => {
    const view = editor.current, model = view?.getModel(), position = view?.getPosition(); if (!view || !model || !position) return;
    const owner = current.current, visible = view.getVisibleRanges();
    owner.onSelectionLineChange?.(position.lineNumber); owner.onCursorOffsetChange?.(model.getOffsetAt(position) + (owner.value.startsWith("\uFEFF") ? 1 : 0));
    owner.onViewportRangeChange?.(visible.length ? { fromLine: visible[0].startLineNumber, toLine: visible[visible.length - 1].endLineNumber } : null);
    const anchor = (line: number | null | undefined) => {
      if (!line || line < 1 || line > model.getLineCount()) return null;
      const coordinate = view.getScrolledVisiblePosition({ lineNumber: line, column: 1 });
      return coordinate ? { top: coordinate.top, left: coordinate.left } : null;
    };
    owner.onInteractionAnchorChange?.(anchor(hovered.current ?? position.lineNumber)); owner.onCounterpartAnchorChange?.(anchor(owner.counterpartLine));
  };
  useEffect(() => {
    let cancelled = false, dispose = () => {};
    void import("../../features/editor/monacoRuntime").then(({ monaco }) => {
      if (cancelled || !host.current) return;
      const resources: Monaco.IDisposable[] = [];
      let ownedView: Monaco.editor.IStandaloneCodeEditor | null = null;
      let observer: ResizeObserver | null = null, frame = 0;
      dispose = () => { cancelAnimationFrame(frame); observer?.disconnect(); for (const item of resources) item.dispose(); providers.current?.dispose(); providers.current = null; ownedView?.setModel(null); registry.current?.dispose(); registry.current = null; ownedView?.dispose(); editor.current = null; api.current = null; };
      api.current = monaco; registry.current = new MonacoModels(monaco); applyEditorTheme(monaco);
      const view = monaco.editor.create(host.current, {
        model: null, fontFamily: '"JetBrains Mono", "Fira Code", "SFMono-Regular", monospace', fontSize: 13, lineHeight: 21,
        padding: { top: 14, bottom: 14 }, glyphMargin: true, minimap: { enabled: false }, scrollBeyondLastLine: false,
        automaticLayout: false, stickyScroll: { enabled: false }, overviewRulerLanes: 0,
        hover: { delay: 450 },
        quickSuggestionsDelay: 0, suggestOnTriggerCharacters: true, tabCompletion: "on", insertSpaces: false,
        quickSuggestions: { other: "on", comments: "off", strings: "off" },
        suggest: { snippetsPreventQuickSuggestions: false },
        accessibilitySupport: "auto", ariaLabel: "Goro code editor",
      }); ownedView = view; editor.current = view;
      providers.current = registerLanguageProviders(monaco, () => view.getModel(), () => ({ completions: current.current.onRequestCompletions, hover: current.current.onRequestHover, signature: current.current.onRequestSignature }), () => semantic.current);
      resources.push(
        view.onDidChangeModelContent(() => { semantic.current = null; providers.current?.cancelStale(view.getModel()); if (!syncing.current) { findRef.current.documentChanged(); current.current.onChange?.(documentText(view.getValue(), current.current.value)); } }),
        view.onDidChangeCursorPosition(() => emit.current()), view.onDidScrollChange(() => emit.current()),
        view.onMouseMove(event => { const line = event.target.position?.lineNumber ?? null; if (line !== hovered.current) { hovered.current = line; current.current.onHoverLineChange?.(line); emit.current(); } }),
        view.onMouseLeave(() => { hovered.current = null; current.current.onHoverLineChange?.(null); emit.current(); }),
        view.onMouseDown(event => {
          const line = event.target.position?.lineNumber; if (!line) return;
          if (event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) { current.current.onToggleBreakpoint?.(line); event.event.preventDefault(); event.event.stopPropagation(); }
          else if (event.event.leftButton !== false && (navigator.platform.startsWith("Mac") ? event.event.metaKey : event.event.ctrlKey) && current.current.onModifierClickLine?.(line)) { event.event.preventDefault(); event.event.stopPropagation(); }
        }),
        view.onDidBlurEditorWidget(() => { current.current.onSelectionLineChange?.(null); current.current.onCursorOffsetChange?.(null); current.current.onInteractionAnchorChange?.(null); }),
        view.addAction({ id: "goro.save", label: "Save", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], run: () => current.current.onSave?.(documentText(view.getValue(), current.current.value)) }),
        view.addAction({ id: "goro.find", label: "Find", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF], run: () => { if (!current.current.suppressFindWidget) findRef.current.open(); } }),
        view.addAction({ id: "goro.replace", label: "Replace", keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH], run: () => { if (!current.current.suppressFindWidget) findRef.current.open(); } }),
      );
      observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { view.layout(); emit.current(); }); }); observer.observe(host.current);
      setReady(value => value + 1);
    }).catch(reason => { dispose(); if (!cancelled) setError(`Editor initialization failed: ${String(reason)}`); });
    return () => { cancelled = true; dispose(); };
  }, []);
  useLayoutEffect(() => {
    const view = editor.current, models = registry.current; if (!view || !models) return;
    const snapshot = props.documentSnapshot ?? { root: "/goro-editor", activeId: 1, documents: [{ id: 1, path: props.filePath ?? "untitled", text: props.value, baseline: props.value, version: 0, readOnly: props.editable === false, view: { anchor: 0, head: 0, scrollTop: 0, scrollLeft: 0 } }] };
    const active = snapshot.documents.find(document => document.id === snapshot.activeId);
    syncing.current = true;
    try {
      if (entry.current && !entry.current.model.isDisposed()) entry.current.view = view.saveViewState();
      const nextModel = active && snapshot.root ? models.get(snapshot.root, active.path)?.model : null;
      const selection = view.getSelection();
      const previousText = nextModel && view.getModel() === nextModel && active && nextModel.getValue() !== editorText(active.text) ? nextModel.getValue() : null;
      const offsets = previousText !== null && selection && nextModel ? { anchor: nextModel.getOffsetAt(selection.getSelectionStart()), head: nextModel.getOffsetAt(selection.getPosition()) } : null;
      if (view.getModel() !== nextModel) view.setModel(null);
      models.sync(snapshot, nextModel ? { model: nextModel, selections: view.getSelections?.() ?? [] } : undefined);
      if (offsets && previousText !== null && nextModel && active) {
        const anchor = nextModel.getPositionAt(preserveEditorOffset(previousText, editorText(active.text), offsets.anchor)), head = nextModel.getPositionAt(preserveEditorOffset(previousText, editorText(active.text), offsets.head));
        view.setSelection({ selectionStartLineNumber: anchor.lineNumber, selectionStartColumn: anchor.column, positionLineNumber: head.lineNumber, positionColumn: head.column });
      }
      const next = active && snapshot.root ? models.get(snapshot.root, active.path) : null;
      if (view.getModel() !== next?.model) { providers.current?.cancel(); semantic.current = null; hovered.current = null; view.setModel(next?.model ?? null); if (next?.view) view.restoreViewState(next.view); findRef.current.documentChanged(); }
      entry.current = next;
    } finally { syncing.current = false; }
    emit.current();
  }, [props.documentSnapshot, props.filePath, props.value, ready]);
  useEffect(() => { editor.current?.updateOptions({ readOnly: props.editable === false, fontSize: settings["editor.fontSize"], lineHeight: Math.round(settings["editor.fontSize"] * 1.62), tabSize: settings["editor.tabSize"], wordWrap: settings["editor.wordWrap"] ? "on" : "off" }); }, [ready, props.editable, settings]);
  useEffect(() => { if (api.current) applyEditorTheme(api.current); }, [ready, settings["appearance.theme"]]);
  useEffect(() => { if (!ready) return; props.onCommandsChange?.({ find: () => findRef.current.open(), replace: () => findRef.current.open(), next: () => findRef.current.handleFindNext(), previous: () => findRef.current.handleFindPrev() }); return () => props.onCommandsChange?.(null); }, [ready, props.onCommandsChange]);
  useEffect(() => { if (props.suppressFindWidget) findRef.current.dismiss(); }, [props.suppressFindWidget]);
  useEffect(() => { emit.current(); }, [ready, props.counterpartLine]);
  useMonacoFeatures({ editor, api, semantic, status, ready, props: { ...props, diagnostics: effectiveDiagnostics }, settings, onError: setError, onSemanticChange: () => providers.current?.semanticChanged(), onSyntaxDiagnostics: setSyntax });
  return <div className="goro-editor relative h-full min-h-0 w-full flex flex-col">
    {error && <p role="alert" className="p-2 text-(--red)">{error}</p>}
    {!props.suppressFindWidget && find.isOpen && <FindWidget {...find} onQueryChange={find.setQuery} onReplaceTextChange={find.setReplaceText} onToggleMatchCase={find.toggleMatchCase} onToggleWholeWord={find.toggleWholeWord} onToggleRegex={find.toggleRegex} onFindNext={find.handleFindNext} onFindPrev={find.handleFindPrev} onReplace={find.handleReplace} onReplaceAll={find.handleReplaceAll} onClose={find.close} />}
    <div ref={host} className="flex-1 min-h-0 w-full" />
    <div ref={status} className="goro-vim-status" style={{ display: settings["editor.vimEnabled"] && settings["editor.vimShowStatus"] ? undefined : "none" }} />
  </div>;
}
