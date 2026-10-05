import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type * as Monaco from "monaco-editor";
import { startRegexSearch } from "../search/regexSearchClient";
import type { RegexSearchMatch } from "../search/regexSearch";

export function useMonacoFind(editorRef: RefObject<Monaco.editor.IStandaloneCodeEditor | null>) {
  const [isOpen, setOpen] = useState(false), [query, setQuery] = useState(""), [replaceText, setReplaceText] = useState("");
  const [matchCase, setCase] = useState(false), [wholeWord, setWord] = useState(false), [useRegex, setRegex] = useState(false);
  const [error, setError] = useState<string | null>(null), [matchInfo, setInfo] = useState({ current: 0, total: 0 });
  const [revision, setRevision] = useState(0);
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const scanned = useRef<{ model: Monaco.editor.ITextModel; version: number; matches: RegexSearchMatch[]; index: number; limited: boolean } | null>(null);
  const decorations = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSearch = useRef<string | null>(null);
  useEffect(() => () => clearTimeout(focusTimer.current), []);
  const documentChanged = useCallback(() => { scanned.current = null; setRevision(value => value + 1); }, []);
  useEffect(() => {
    const editor = editorRef.current, model = editor?.getModel(), previous = scanned.current;
    scanned.current = null; setError(null);
    if (!editor || !model || !isOpen || !query) { decorations.current?.clear(); setInfo({ current: 0, total: 0 }); return; }
    if (!previous || previous.model !== model || previous.version !== model.getVersionId()) { decorations.current?.clear(); setInfo({ current: 0, total: 0 }); }
    const version = model.getVersionId();
    const key = JSON.stringify([isOpen, query, matchCase, wholeWord, useRegex]);
    const selectMatch = lastSearch.current !== key;
    lastSearch.current = key;
    const task = startRegexSearch({ text: model.getValue(), query: useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), replacement: useRegex ? replaceText : replaceText.replace(/\$/g, "$$$$"), matchCase, wholeWord });
    let current = true;
    void task.promise.then(report => {
      if (!current || editor.getModel() !== model || model.isDisposed() || version !== model.getVersionId()) return;
      const position = editor.getPosition(), head = position ? model.getOffsetAt(position) : 0;
      const index = Math.max(0, report.matches.findIndex(match => match.from >= head));
      scanned.current = { model, version, matches: report.matches, index, limited: report.limited };
      decorations.current ??= editor.createDecorationsCollection();
      decorations.current.set(report.matches.map(match => ({ range: range(model, match.from, match.to), options: { inlineClassName: "goro-find-match" } })));
      setInfo({ current: report.matches.length ? index + 1 : 0, total: report.matches.length });
      if (selectMatch && report.matches[index]) editor.setSelection(range(model, report.matches[index].from, report.matches[index].to));
      setError(report.limited ? "2000-match limit reached. Narrow the pattern before replacing all." : null);
    }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { current = false; task.cancel(); };
  }, [isOpen, query, replaceText, matchCase, wholeWord, useRegex, revision, editorRef]);
  const navigate = (direction: number) => {
    const scan = scanned.current, editor = editorRef.current;
    if (!scan || !editor || editor.getModel() !== scan.model || scan.model.getVersionId() !== scan.version || !scan.matches.length) return;
    scan.index = (scan.index + direction + scan.matches.length) % scan.matches.length;
    const match = scan.matches[scan.index], selection = range(scan.model, match.from, match.to);
    editor.setSelection(selection); editor.revealRangeInCenter(selection); setInfo({ current: scan.index + 1, total: scan.matches.length });
  };
  const open = () => {
    const editor = editorRef.current, model = editor?.getModel(), selection = editor?.getSelection();
    if (model && selection && !selection.isEmpty()) { const selected = model.getValueInRange(selection); if (!selected.includes("\n")) setQuery(selected); }
    lastSearch.current = null;
    setOpen(true); setRevision(value => value + 1); clearTimeout(focusTimer.current); focusTimer.current = setTimeout(() => queryInputRef.current?.focus(), 0);
  };
  const dismiss = () => { clearTimeout(focusTimer.current); lastSearch.current = null; setOpen(false); scanned.current = null; decorations.current?.clear(); };
  const replace = (all: boolean) => {
    const scan = scanned.current, editor = editorRef.current;
    if (!scan || !editor || editor.getModel() !== scan.model || scan.model.getVersionId() !== scan.version || editor.getRawOptions().readOnly || scan.limited || error) return;
    const matches = all ? scan.matches : scan.matches.slice(scan.index, scan.index + 1);
    if (!all) { const match = matches[0], selection = editor.getSelection(); if (!match || !selection || !selection.equalsRange(range(scan.model, match.from, match.to))) { navigate(0); return; } }
    editor.pushUndoStop(); editor.executeEdits("goro.find.replace", matches.map(match => ({ range: range(scan.model, match.from, match.to), text: match.replacement }))); editor.pushUndoStop(); documentChanged();
  };
  return { isOpen, query, replaceText, matchCase, wholeWord, useRegex, error, matchInfo, queryInputRef, open, dismiss, close: () => { dismiss(); editorRef.current?.focus(); }, setQuery, setReplaceText, toggleMatchCase: () => setCase(value => !value), toggleWholeWord: () => setWord(value => !value), toggleRegex: () => setRegex(value => !value), handleFindNext: () => navigate(1), handleFindPrev: () => navigate(-1), handleReplace: () => replace(false), handleReplaceAll: () => replace(true), documentChanged };
}
function range(model: Monaco.editor.ITextModel, from: number, to: number): Monaco.IRange {
  const start = model.getPositionAt(from), end = model.getPositionAt(to);
  return { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column };
}
