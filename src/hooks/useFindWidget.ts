import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import {
  findNext,
  findPrevious,
  replaceNext as cmReplaceNext,
  replaceAll as cmReplaceAll,
  SearchQuery,
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
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const matchIndexRef = useRef(0);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isOpen) return;

    let searchObj: SearchQuery;
    try {
      searchObj = new SearchQuery({
        search: query,
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

    const positions: number[] = [];
    const cursor = searchObj.getCursor(view.state);
    let r;
    while (!(r = cursor.next()).done) {
      positions.push(r.value.from);
    }

    const head = view.state.selection.main.head;
    let idx = 0;
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] <= head) idx = i;
    }
    matchIndexRef.current = positions.length > 0 ? idx : 0;
    setMatchInfo({
      current: positions.length > 0 ? idx + 1 : 0,
      total: positions.length,
    });
  // viewRef is intentionally omitted from deps: RefObjects are stable by
  // convention and including them would cause infinite re-render loops when
  // the ref container is recreated each render (e.g. in tests).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, matchCase, wholeWord, useRegex, isOpen]);

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
    findNext(view);
    setMatchInfo((prev) => {
      if (prev.total === 0) return prev;
      const next = (matchIndexRef.current + 1) % prev.total;
      matchIndexRef.current = next;
      return { ...prev, current: next + 1 };
    });
  }, [viewRef]);

  const handleFindPrev = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    findPrevious(view);
    setMatchInfo((prev) => {
      if (prev.total === 0) return prev;
      const next = (matchIndexRef.current - 1 + prev.total) % prev.total;
      matchIndexRef.current = next;
      return { ...prev, current: next + 1 };
    });
  }, [viewRef]);

  const handleReplace = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    cmReplaceNext(view);
    setMatchInfo((prev) => {
      const newTotal = Math.max(0, prev.total - 1);
      if (newTotal === 0) {
        matchIndexRef.current = 0;
        return { current: 0, total: 0 };
      }
      const next = matchIndexRef.current % newTotal;
      matchIndexRef.current = next;
      return { current: next + 1, total: newTotal };
    });
  }, [viewRef]);

  const handleReplaceAll = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    cmReplaceAll(view);
    matchIndexRef.current = 0;
    setMatchInfo({ current: 0, total: 0 });
  }, [viewRef]);

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
