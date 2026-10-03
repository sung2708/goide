import { startRegexSearch } from "../features/search/regexSearchClient";
import { setFindRanges } from "../features/search/findDecorations";
import { isolateHistory } from "@codemirror/commands";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { EditorView } from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  searchPanelOpen,
  setSearchQuery,
} from "@codemirror/search";

export type FindWidgetHandlers = {
  isOpen: boolean;
  error: string | null;
  query: string;
  replaceText: string;
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  matchInfo: { current: number; total: number };
  queryInputRef: RefObject<HTMLInputElement | null>;
  open: () => void;
  dismiss: () => void;
  close: () => void;
  setQuery: (q: string) => void;
  setReplaceText: (t: string) => void;
  toggleMatchCase: () => void;
  toggleWholeWord: () => void;
  toggleRegex: () => void;
  handleFindNext: () => void;
  handleFindPrev: () => void;
  handleReplace: () => void;
  handleReplaceAll: () => void;
  documentChanged: () => void;
};

export function useFindWidget(
  viewRef: RefObject<EditorView | null>
): FindWidgetHandlers {
  const [error, setError] = useState<string | null>(null);
  const regexReplacements = useRef<Map<number, string>>(new Map());
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQueryState] = useState("");
  const [replaceText, setReplaceTextState] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchInfo, setMatchInfo] = useState<{ current: number; total: number }>(
    { current: 0, total: 0 }
  );
  const [scanKey, setScanKey] = useState(0);
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const matchIndexRef = useRef(0);
  const matchRangesRef = useRef<Array<{ from: number; to: number }>>([]);
  const selectionIntent = useRef<"start" | "next" | null>(null);
  const scannedDocument = useRef<EditorView["state"]["doc"] | null>(null);
  const documentChanged = useCallback(() => {
    matchRangesRef.current = []; scannedDocument.current = null; selectionIntent.current = null;
    setScanKey(key => key + 1);
  }, []);
  const lastQueryConfigRef = useRef<{
    query: string;
    matchCase: boolean;
    wholeWord: boolean;
    useRegex: boolean;
  } | null>(null);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isOpen) return;

    setError(null);
    const intent = selectionIntent.current; selectionIntent.current = null;
    if (useRegex && query) {
      const document = view.state.doc;
      const previousRanges = scannedDocument.current === document ? matchRangesRef.current : [];
      matchRangesRef.current = []; scannedDocument.current = null;
      view.dispatch({ effects: [setSearchQuery.of(new SearchQuery({ search: "" })), setFindRanges.of(previousRanges)] });
      const task = startRegexSearch({ text: document.toString(), query, replacement: replaceText, matchCase, wholeWord });
      let current = true;
      void task.promise.then(report => {
        if (!current || viewRef.current !== view || view.state.doc !== document) return;
        const matches = report.matches;
        matchRangesRef.current = matches; scannedDocument.current = document;
        regexReplacements.current = new Map(matches.map(match => [match.from, match.replacement]));
        const head = view.state.selection.main.head;
        const index = Math.max(0, matches.findIndex(match => match.from >= head));
        matchIndexRef.current = index;
        setMatchInfo({ current: matches.length ? index + 1 : 0, total: matches.length });
        setError(report.limited ? "2000-match limit reached. Narrow the pattern before replacing all." : null);
        view.dispatch({ effects: setFindRanges.of(matches), ...(intent && matches[index] ? { selection: { anchor: matches[index].from, head: matches[index].to } } : {}) });
      }).catch(error => { if (current) { setError(`${error.message}${previousRanges.length ? " Previous highlights are retained; replacement is disabled." : ""}`); if (!previousRanges.length) setMatchInfo({ current: 0, total: 0 }); } });
      return () => { current = false; task.cancel(); };
    }
    view.dispatch({ effects: setFindRanges.of([]) });
    let searchObj: SearchQuery;
    try {
      searchObj = new SearchQuery({
        search: query,
        replace: replaceText,
        caseSensitive: matchCase,
        wholeWord,
        regexp: useRegex,
      });
    } catch {
      matchRangesRef.current = []; scannedDocument.current = null;
      setMatchInfo({ current: 0, total: 0 });
      return;
    }

    view.dispatch({ effects: setSearchQuery.of(searchObj) });

    if (!query || !searchObj.valid) {
      matchRangesRef.current = []; scannedDocument.current = null;
      matchIndexRef.current = 0;
      setMatchInfo({ current: 0, total: 0 });
      return;
    }

    const matches: Array<{ from: number; to: number }> = [];
    const cursor = searchObj.getCursor(view.state);
    let r;
    while (!(r = cursor.next()).done) {
      if (matches.length >= 2000) { setError("2000-match limit reached. Narrow the query before replacing all."); break; }
      matches.push({ from: r.value.from, to: r.value.to });
    }
    matchRangesRef.current = matches;
    scannedDocument.current = view.state.doc;

    const previousQueryConfig = lastQueryConfigRef.current;
    const queryConfigChanged =
      !previousQueryConfig ||
      previousQueryConfig.query !== query ||
      previousQueryConfig.matchCase !== matchCase ||
      previousQueryConfig.wholeWord !== wholeWord ||
      previousQueryConfig.useRegex !== useRegex;

    const head = view.state.selection.main.head;
    let idx = 0;
    if (!queryConfigChanged) {
      for (let i = 0; i < matches.length; i++) {
        if (matches[i].from <= head) idx = i;
      }
    }

    lastQueryConfigRef.current = {
      query,
      matchCase,
      wholeWord,
      useRegex,
    };
    if (intent === "next") { const next = matches.findIndex(match => match.from >= head); idx = next < 0 ? 0 : next; }
    matchIndexRef.current = matches.length > 0 ? idx : 0;
    setMatchInfo({
      current: matches.length > 0 ? idx + 1 : 0,
      total: matches.length,
    });

    if (intent && matches.length > 0) {
      const active = matches[matchIndexRef.current];
      view.dispatch({
        selection: { anchor: active.from, head: active.to },
      });
    }
  // viewRef is intentionally omitted from deps: RefObjects are stable by
  // convention and including them would cause infinite re-render loops when
  // the ref container is recreated each render (e.g. in tests).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, replaceText, matchCase, wholeWord, useRegex, isOpen, scanKey]);

  const open = useCallback(() => {
    selectionIntent.current = "start";
    const view = viewRef.current;
    if (view) {
      const sel = view.state.selection.main;
      if (!sel.empty) {
        const text = view.state.doc.sliceString(sel.from, sel.to);
        if (!text.includes("\n")) {
          setQueryState(text);
        }
      }
    }
    setIsOpen(true);
    setTimeout(() => queryInputRef.current?.focus(), 0);
  }, [viewRef]);

  const close = useCallback(() => {
    setIsOpen(false);
    matchRangesRef.current = []; scannedDocument.current = null;
    if (viewRef.current) viewRef.current.dispatch({ effects: [setSearchQuery.of(new SearchQuery({ search: "" })), setFindRanges.of([])] });
    viewRef.current?.focus();
  }, [viewRef]);

  const dismiss = useCallback(() => {
    setIsOpen(false);
    matchRangesRef.current = []; scannedDocument.current = null;
    if (viewRef.current) viewRef.current.dispatch({ effects: [setSearchQuery.of(new SearchQuery({ search: "" })), setFindRanges.of([])] });
  }, [viewRef]);

  const setQuery = useCallback((q: string) => {
    matchIndexRef.current = 0; selectionIntent.current = "start";
    matchRangesRef.current = []; scannedDocument.current = null;
    setQueryState(q);
  }, []);

  const toggleMatchCase = useCallback(() => { selectionIntent.current = "start"; setMatchCase((v) => !v); }, []);
  const toggleWholeWord = useCallback(() => { selectionIntent.current = "start"; setWholeWord((v) => !v); }, []);
  const toggleRegex = useCallback(() => { selectionIntent.current = "start"; setUseRegex((v) => !v); }, []);

  const handleFindNext = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (searchPanelOpen(view.state)) {
      closeSearchPanel(view);
    }
    if (matchRangesRef.current.length === 0) return;
    if (scannedDocument.current !== view.state.doc) { documentChanged(); return; }
    const next = (matchIndexRef.current + 1) % matchRangesRef.current.length;
    matchIndexRef.current = next;
    const match = matchRangesRef.current[next];
    view.dispatch({
      selection: { anchor: match.from, head: match.to },
      effects: EditorView.scrollIntoView(match.from, { y: "center" }),
    });
    setMatchInfo((prev) => {
      if (prev.total === 0) return prev;
      return { ...prev, current: next + 1 };
    });
  }, [viewRef]);

  const handleFindPrev = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (searchPanelOpen(view.state)) {
      closeSearchPanel(view);
    }
    if (matchRangesRef.current.length === 0) return;
    if (scannedDocument.current !== view.state.doc) { documentChanged(); return; }
    const next =
      (matchIndexRef.current - 1 + matchRangesRef.current.length) %
      matchRangesRef.current.length;
    matchIndexRef.current = next;
    const match = matchRangesRef.current[next];
    view.dispatch({
      selection: { anchor: match.from, head: match.to },
      effects: EditorView.scrollIntoView(match.from, { y: "center" }),
    });
    setMatchInfo((prev) => {
      if (prev.total === 0) return prev;
      return { ...prev, current: next + 1 };
    });
  }, [viewRef]);

  const handleReplace = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (searchPanelOpen(view.state)) {
      closeSearchPanel(view);
    }
    if (matchRangesRef.current.length === 0) return;
    if (view.state.readOnly || scannedDocument.current !== view.state.doc) { documentChanged(); return; }
    const activeIndex = Math.min(
      matchRangesRef.current.length - 1,
      Math.max(0, matchIndexRef.current)
    );
    const activeMatch = matchRangesRef.current[activeIndex];
    if (view.state.selection.main.from !== activeMatch.from || view.state.selection.main.to !== activeMatch.to) return;
    let replacement = replaceText;
    if (useRegex) { const prepared = regexReplacements.current.get(activeMatch.from); if (prepared === undefined) return; replacement = prepared; }
    view.dispatch({
      changes: { from: activeMatch.from, to: activeMatch.to, insert: replacement },
      annotations: isolateHistory.of("full"),
      selection: { anchor: activeMatch.from, head: activeMatch.from + replacement.length },
    });
    selectionIntent.current = "next";
    setScanKey((k) => k + 1);
  }, [matchCase, query, replaceText, useRegex, viewRef]);

  const handleReplaceAll = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (searchPanelOpen(view.state)) {
      closeSearchPanel(view);
    }
    if (matchRangesRef.current.length === 0) return;
    if (view.state.readOnly || scannedDocument.current !== view.state.doc) { documentChanged(); return; }

    const changes = [...matchRangesRef.current]
      .sort((a, b) => b.from - a.from)
      .map((match) => {
        const replacement = useRegex ? regexReplacements.current.get(match.from) ?? "" : replaceText;
        return { from: match.from, to: match.to, insert: replacement };
      });

    if (error) return;
    view.dispatch({ changes, annotations: isolateHistory.of("full") });
    setScanKey((k) => k + 1);
  }, [error, matchCase, query, replaceText, useRegex, viewRef]);

  return {
    error,
    isOpen,
    query,
    replaceText,
    matchCase,
    wholeWord,
    useRegex,
    matchInfo,
    queryInputRef,
    open,
    dismiss,
    close,
    setQuery,
    setReplaceText: setReplaceTextState,
    toggleMatchCase,
    toggleWholeWord,
    toggleRegex,
    handleFindNext,
    handleFindPrev,
    handleReplace,
    handleReplaceAll,
    documentChanged,
  };
}
