import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { WorkspaceSearchFile } from "../../lib/ipc/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAngleDown,
  faAngleRight,
  faArrowsTurnToDots,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";

type SearchPanelProps = {
  loading?: boolean;
  results: WorkspaceSearchFile[];
  onSearch: (query: string) => void;
  onOpenResult: (file: string, line: number, query: string) => void;
  autoFocus?: boolean;
  focusTrigger?: number;
  onReplaceMatch?: (file: string, line: number, searchText: string, replacement: string) => void;
  onReplaceAll?: (searchText: string, replacement: string) => void;
};

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchRegex(
  query: string,
  matchCase: boolean,
  wholeWord: boolean,
  useRegex: boolean
): RegExp | null {
  if (!query) return null;
  const basePattern = useRegex ? query : escapeRegex(query);
  const wrappedPattern = wholeWord ? `\\b${basePattern}\\b` : basePattern;
  try {
    return new RegExp(wrappedPattern, matchCase ? "g" : "gi");
  } catch {
    return null;
  }
}

function HighlightedPreview({
  preview,
  query,
  matchCase,
}: {
  preview: string;
  query: string;
  matchCase: boolean;
}) {
  if (!query) return <>{preview}</>;

  let regex: RegExp;
  try {
    regex = new RegExp(`(${escapeRegex(query)})`, matchCase ? "g" : "gi");
  } catch {
    return <>{preview}</>;
  }

  const parts = preview.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark
            key={i}
            className="rounded-xs bg-[rgba(140,170,238,0.22)] text-(--blue) not-italic"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function ToggleButton({
  text,
  label,
  active,
  onClick,
}: {
  text: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`flex h-5 w-5 items-center justify-center rounded transition-colors duration-100 ${
        active
          ? "bg-(--selection-bg) text-(--blue)"
          : "text-(--overlay1) hover:bg-[rgba(255,255,255,0.06)] hover:text-(--subtext1)"
      }`}
    >
      <span className="text-[10px] font-semibold">{text}</span>
    </button>
  );
}

function SearchPanel({
  loading = false,
  results,
  onSearch,
  onOpenResult,
  autoFocus = false,
  focusTrigger = 0,
  onReplaceMatch,
  onReplaceAll,
}: SearchPanelProps) {
  const searchInputId = "workspace-search-input";
  const [query, setQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [showFilesFilter, setShowFilesFilter] = useState(false);
  const [filesInclude, setFilesInclude] = useState("");
  const [filesExclude, setFilesExclude] = useState("");
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState("");
  const [activeMatchKey, setActiveMatchKey] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const latestQueryRef = useRef(query);

  latestQueryRef.current = query;

  const stopNativeKeyEvent = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nativeEvent = event.nativeEvent as KeyboardEvent & {
      stopImmediatePropagation?: () => void;
    };
    nativeEvent.stopImmediatePropagation?.();
  };

  const submitSearch = (nextQuery: string) => {
    const trimmed = nextQuery.trim();
    setLastSubmittedQuery(trimmed);
    onSearch(trimmed);
  };

  useEffect(() => {
    if (focusTrigger > 0) {
      searchInputRef.current?.focus();
    }
  }, [focusTrigger]);

  const activeQuery = query.trim();
  const previewRegex = buildSearchRegex(activeQuery, matchCase, wholeWord, useRegex);
  const displayedResults = previewRegex
    ? results
        .map((file) => ({
          ...file,
          matches: file.matches.filter((match) => {
            previewRegex.lastIndex = 0;
            return previewRegex.test(match.preview);
          }),
        }))
        .filter((file) => file.matches.length > 0)
    : results;
  const flatDisplayedMatches = displayedResults.flatMap((file) =>
    file.matches.map((match) => ({
      file: file.relativePath,
      line: match.line,
      preview: match.preview,
      key: `${file.relativePath}:${match.line}:${match.preview}`,
    }))
  );
  const displayedResultCount = displayedResults.reduce(
    (total, file) => total + file.matches.length,
    0
  );

  useEffect(() => {
    if (!activeQuery || flatDisplayedMatches.length === 0) {
      return;
    }
    const first = flatDisplayedMatches[0];
    if (activeMatchKey === first.key) {
      return;
    }
    setActiveMatchKey(first.key);
    onOpenResult(first.file, first.line, activeQuery);
  }, [activeMatchKey, activeQuery, flatDisplayedMatches, onOpenResult]);

  useEffect(() => {
    const trimmed = query.trim();
    const handle = window.setTimeout(() => {
      submitSearch(trimmed);
    }, 180);
    return () => window.clearTimeout(handle);
  }, [query, onSearch]);

  const clearSearch = () => {
    setQuery("");
    setReplaceQuery("");
    setLastSubmittedQuery("");
    setActiveMatchKey(null);
    onSearch("");
    searchInputRef.current?.focus();
  };

  const openIndexedMatch = (index: number) => {
    if (flatDisplayedMatches.length === 0) return;
    const normalized =
      ((index % flatDisplayedMatches.length) + flatDisplayedMatches.length) %
      flatDisplayedMatches.length;
    const target = flatDisplayedMatches[normalized];
    setActiveMatchKey(target.key);
    onOpenResult(target.file, target.line, activeQuery);
  };

  const advanceActiveMatch = (direction: 1 | -1) => {
    if (flatDisplayedMatches.length === 0) return;
    const currentIndex = flatDisplayedMatches.findIndex(
      (match) => match.key === activeMatchKey
    );
    const nextIndex = currentIndex === -1 ? 0 : currentIndex + direction;
    openIndexedMatch(nextIndex);
  };

  useEffect(() => {
    const handleWindowKeyDownCapture = (event: KeyboardEvent) => {
      if (document.activeElement !== searchInputRef.current) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        submitSearch(latestQueryRef.current);
        advanceActiveMatch(1);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        clearSearch();
      }
    };

    const handleWindowKeyUpCapture = (event: KeyboardEvent) => {
      if (document.activeElement !== searchInputRef.current) {
        return;
      }

      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      }
    };

    window.addEventListener("keydown", handleWindowKeyDownCapture, true);
    window.addEventListener("keyup", handleWindowKeyUpCapture, true);

    return () => {
      window.removeEventListener("keydown", handleWindowKeyDownCapture, true);
      window.removeEventListener("keyup", handleWindowKeyUpCapture, true);
    };
  }, [advanceActiveMatch, clearSearch]);

  const toggleFileCollapse = (path: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col bg-(--mantle)">
      {/* Header */}
      <div className="border-b border-(--border-muted) px-3 py-2.5">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-(--overlay1)">
          Search
        </p>

        {/* Search row */}
        <div className="relative mb-1.5 flex items-center rounded border border-(--surface1) bg-(--crust) transition-colors focus-within:border-(--border-active) focus-within:ring-1 focus-within:ring-(--focus-ring)">
          <span className="ml-2 shrink-0 text-(--overlay1)">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="text-[13px]" />
          </span>
          <input
            ref={searchInputRef}
            id={searchInputId}
            autoFocus={autoFocus}
            value={query}
            type="text"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                stopNativeKeyEvent(e);
                submitSearch(query);
                advanceActiveMatch(1);
                return;
              }

              if (e.key === "Escape") {
                stopNativeKeyEvent(e);
                clearSearch();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                stopNativeKeyEvent(e);
              }
            }}
            placeholder="Search"
            aria-label="Search query"
            className="min-w-0 flex-1 bg-transparent py-1.5 pl-1.5 pr-1 text-[12px] text-(--text) outline-none placeholder:text-(--overlay0)"
          />
          <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
            <ToggleButton text="Aa" label="Match Case" active={matchCase} onClick={() => setMatchCase((v) => !v)} />
            <ToggleButton text="W" label="Match Whole Word" active={wholeWord} onClick={() => setWholeWord((v) => !v)} />
            <ToggleButton text=".*" label="Use Regular Expression" active={useRegex} onClick={() => setUseRegex((v) => !v)} />
          </div>
        </div>

        {/* Replace row */}
        <div className="relative flex items-center rounded border border-(--surface1) bg-(--crust) transition-colors focus-within:border-(--border-active) focus-within:ring-1 focus-within:ring-(--focus-ring)">
          <span className="ml-2 shrink-0 text-(--overlay1)">
            <FontAwesomeIcon icon={faArrowsTurnToDots} className="text-[13px]" />
          </span>
          <input
            value={replaceQuery}
            type="text"
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="Replace"
            aria-label="Replace query"
            className="min-w-0 flex-1 bg-transparent py-1.5 pl-1.5 pr-1 text-[12px] text-(--text) outline-none placeholder:text-(--overlay0)"
          />
        </div>

        {/* Results count + clear */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-(--overlay1)">
            {lastSubmittedQuery.length > 0
              ? `${displayedResultCount} result${displayedResultCount === 1 ? "" : "s"} in ${displayedResults.length} file${displayedResults.length === 1 ? "" : "s"}`
              : ""}
          </span>
          <div className="flex items-center gap-1.5">
            {displayedResults.length > 0 && onReplaceAll && (
              <button
                type="button"
                aria-label="Replace All"
                onClick={() => onReplaceAll(activeQuery, replaceQuery)}
                className="rounded border border-(--border-muted) bg-(--surface0) px-2 py-0.5 text-[10px] font-semibold text-(--subtext1) transition-colors duration-100 hover:border-(--border-active) hover:bg-(--bg-hover) hover:text-(--text)"
              >
                Replace All
              </button>
            )}
            {lastSubmittedQuery.length > 0 && (
              <button
                type="button"
                onClick={clearSearch}
                className="text-[11px] text-(--overlay1) hover:text-(--subtext1) transition-colors duration-100"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Files filter toggle */}
        <button
          type="button"
          onClick={() => setShowFilesFilter((v) => !v)}
          className="mt-1.5 flex w-full items-center gap-1 text-[10px] text-(--overlay1) hover:text-(--subtext1) transition-colors duration-100"
        >
          <span style={{ fontSize: 13 }}>
            <FontAwesomeIcon icon={showFilesFilter ? faAngleDown : faAngleRight} />
          </span>
          <span className="uppercase tracking-wider">Files to include / exclude</span>
        </button>

        {showFilesFilter && (
          <div className="mt-1.5 space-y-1">
            <input
              value={filesInclude}
              onChange={(e) => setFilesInclude(e.target.value)}
              placeholder="e.g. *.go, src/**"
              aria-label="Files to include"
              className="w-full rounded border border-(--surface1) bg-(--crust) px-2 py-1 text-[11px] text-(--text) outline-none placeholder:text-(--overlay0) focus:border-(--border-active)"
            />
            <input
              value={filesExclude}
              onChange={(e) => setFilesExclude(e.target.value)}
              placeholder="e.g. **/vendor/**, *.test.go"
              aria-label="Files to exclude"
              className="w-full rounded border border-(--surface1) bg-(--crust) px-2 py-1 text-[11px] text-(--text) outline-none placeholder:text-(--overlay0) focus:border-(--border-active)"
            />
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto" role="region" aria-label="Workspace search results">
        {loading && (
          <p className="px-3 py-2 text-[12px] text-(--overlay1)">Searching…</p>
        )}
        {!loading && displayedResults.length === 0 && (
          <p className="px-3 py-4 text-[12px] text-(--overlay0) text-pretty">
            {lastSubmittedQuery.length > 0
              ? `No results for "${lastSubmittedQuery}".`
              : "Type a term to search across the workspace."}
          </p>
        )}

        {displayedResults.length > 0 && (
          <ul>
            {displayedResults.map((file) => {
              const isCollapsed = collapsedFiles.has(file.relativePath);
              return (
                <li key={file.relativePath} className="border-b border-(--border-subtle) last:border-b-0">
                  {/* File header */}
                  <button
                    type="button"
                    onClick={() => toggleFileCollapse(file.relativePath)}
                    className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-[rgba(255,255,255,0.03)] transition-colors duration-75"
                  >
                    <span className="shrink-0 text-(--overlay1)" style={{ fontSize: 13 }}>
                      <FontAwesomeIcon icon={isCollapsed ? faAngleRight : faAngleDown} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-(--subtext1)">
                      {file.relativePath}
                    </span>
                    <span className="shrink-0 rounded bg-(--surface0) px-1 py-0.5 text-[9px] font-semibold text-(--overlay1)">
                      {file.matches.length}
                    </span>
                  </button>

                  {/* Match rows */}
                  {!isCollapsed && (
                    <ul aria-label={`Matches in ${file.relativePath}`}>
                      {file.matches.map((match) => (
                        <li key={`${file.relativePath}:${match.line}:${match.preview}`}>
                          <div className="group flex w-full items-start gap-2 px-3 py-1 transition-colors duration-75 hover:bg-(--bg-hover)">
                            <button
                              type="button"
                              className={`flex min-w-0 flex-1 items-start gap-2 text-left ${
                                activeMatchKey === `${file.relativePath}:${match.line}:${match.preview}`
                                  ? "rounded bg-(--bg-hover)"
                                  : ""
                              }`}
                              onClick={() => {
                                setActiveMatchKey(
                                  `${file.relativePath}:${match.line}:${match.preview}`
                                );
                                onOpenResult(file.relativePath, match.line, activeQuery);
                              }}
                            >
                              <span className="mt-0.5 shrink-0 min-w-7 text-right font-code text-[10px] text-(--overlay1)">
                                {match.line}
                              </span>
                              <span className="min-w-0 flex-1 truncate font-code text-[11px] text-(--subtext0)">
                                <HighlightedPreview
                                  preview={match.preview}
                                  query={query}
                                  matchCase={matchCase}
                                />
                              </span>
                            </button>
                            {onReplaceMatch && replaceQuery && (
                              <button
                                type="button"
                                aria-label={`Replace match in ${file.relativePath} line ${match.line}`}
                                title="Replace match"
                                onClick={() =>
                                  onReplaceMatch(
                                    file.relativePath,
                                    match.line,
                                    activeQuery,
                                    replaceQuery
                                  )
                                }
                                className="shrink-0 rounded border border-(--border-muted) bg-(--surface0) px-1.5 py-0.5 text-[10px] text-(--overlay1) opacity-0 transition duration-75 group-focus-within:opacity-100 group-hover:opacity-100 hover:border-(--border-active) hover:text-(--text)"
                              >
                                <FontAwesomeIcon icon={faArrowsTurnToDots} />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SearchPanel;
