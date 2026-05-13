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
};

export function useFindWidget(
  viewRef: RefObject<EditorView | null>
): FindWidgetHandlers {
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
  const lastQueryConfigRef = useRef<{
    query: string;
    matchCase: boolean;
    wholeWord: boolean;
    useRegex: boolean;
  } | null>(null);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isOpen) return;

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
      setMatchInfo({ current: 0, total: 0 });
      return;
    }

    view.dispatch({ effects: setSearchQuery.of(searchObj) });

    if (!query || !searchObj.valid) {
      matchIndexRef.current = 0;
      setMatchInfo({ current: 0, total: 0 });
      return;
    }

    const matches: Array<{ from: number; to: number }> = [];
    const cursor = searchObj.getCursor(view.state);
    let r;
    while (!(r = cursor.next()).done) {
      matches.push({ from: r.value.from, to: r.value.to });
    }
    matchRangesRef.current = matches;

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
    matchIndexRef.current = matches.length > 0 ? idx : 0;
    setMatchInfo({
      current: matches.length > 0 ? idx + 1 : 0,
      total: matches.length,
    });

    if (matches.length > 0) {
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
    viewRef.current?.focus();
  }, [viewRef]);

  const dismiss = useCallback(() => {
    setIsOpen(false);
  }, []);

  const setQuery = useCallback((q: string) => {
    matchIndexRef.current = 0;
    setQueryState(q);
  }, []);

  const toggleMatchCase = useCallback(() => setMatchCase((v) => !v), []);
  const toggleWholeWord = useCallback(() => setWholeWord((v) => !v), []);
  const toggleRegex = useCallback(() => setUseRegex((v) => !v), []);

  const handleFindNext = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (searchPanelOpen(view.state)) {
      closeSearchPanel(view);
    }
    if (matchRangesRef.current.length === 0) return;
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
    const activeIndex = Math.min(
      matchRangesRef.current.length - 1,
      Math.max(0, matchIndexRef.current)
    );
    const activeMatch = matchRangesRef.current[activeIndex];
    const currentText = view.state.doc.sliceString(activeMatch.from, activeMatch.to);
    let replacement = replaceText;
    if (useRegex && query) {
      try {
        const flags = matchCase ? "g" : "gi";
        replacement = currentText.replace(new RegExp(query, flags), replaceText);
      } catch {
        replacement = replaceText;
      }
    }
    view.dispatch({
      changes: { from: activeMatch.from, to: activeMatch.to, insert: replacement },
      selection: { anchor: activeMatch.from, head: activeMatch.from + replacement.length },
    });
    setScanKey((k) => k + 1);
  }, [matchCase, query, replaceText, useRegex, viewRef]);

  const handleReplaceAll = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (searchPanelOpen(view.state)) {
      closeSearchPanel(view);
    }
    if (matchRangesRef.current.length === 0) return;

    const changes = [...matchRangesRef.current]
      .sort((a, b) => b.from - a.from)
      .map((match) => {
        const currentText = view.state.doc.sliceString(match.from, match.to);
        let replacement = replaceText;
        if (useRegex && query) {
          try {
            const flags = matchCase ? "g" : "gi";
            replacement = currentText.replace(new RegExp(query, flags), replaceText);
          } catch {
            replacement = replaceText;
          }
        }
        return { from: match.from, to: match.to, insert: replacement };
      });

    view.dispatch({ changes });
    setScanKey((k) => k + 1);
  }, [matchCase, query, replaceText, useRegex, viewRef]);

  return {
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
  };
}
