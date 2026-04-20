import { useEffect, useState } from "react";
import type { WorkspaceSearchFile } from "../../lib/ipc/types";

type SearchPanelProps = {
  loading?: boolean;
  results: WorkspaceSearchFile[];
  onSearch: (query: string) => void;
  onOpenResult: (file: string, line: number) => void;
  autoFocus?: boolean;
};

function SearchPanel({
  loading = false,
  results,
  onSearch,
  onOpenResult,
  autoFocus = false,
}: SearchPanelProps) {
  const inputId = "workspace-search-input";
  const [query, setQuery] = useState("");
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState("");
  const flatResultCount = results.reduce((total, file) => total + file.matches.length, 0);

  const submitSearch = () => {
    const trimmedQuery = query.trim();
    setLastSubmittedQuery(trimmedQuery);
    onSearch(trimmedQuery);
  };

  useEffect(() => {
    const trimmedQuery = query.trim();
    const handle = window.setTimeout(() => {
      setLastSubmittedQuery(trimmedQuery);
      onSearch(trimmedQuery);
    }, 180);

    return () => window.clearTimeout(handle);
  }, [query, onSearch]);

  const clearSearch = () => {
    setQuery("");
    setLastSubmittedQuery("");
    onSearch("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border-subtle)] px-4 py-3.5 bg-[var(--mantle)]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase text-[var(--overlay1)] text-balance">
            Workspace Search
          </p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--overlay1)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              id={inputId}
              autoFocus={autoFocus}
              value={query}
              type="search"
              aria-describedby={`${inputId}-hint`}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search workspace"
              className="w-full rounded border border-[var(--surface1)] bg-[var(--crust)] py-1.5 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--overlay0)] transition-colors focus:border-[var(--blue)] focus:ring-1 focus:ring-[var(--blue)]"
            />
          </div>
          <button
            type="submit"
            className="rounded border border-[var(--surface1)] px-3 text-[12px] font-semibold text-[var(--subtext1)] transition-colors duration-100 hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={query.trim().length === 0 || loading}
          >
            Search
          </button>
          {lastSubmittedQuery.length > 0 && (
            <button
              type="button"
              className="rounded border border-[var(--surface1)] px-2.5 text-[12px] text-[var(--overlay1)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
              onClick={clearSearch}
            >
              Clear
            </button>
          )}
        </form>
        <div
          id={`${inputId}-hint`}
          className="mt-2 flex items-center justify-between text-[11px] text-[var(--overlay1)]"
        >
          <span>{flatResultCount} match{flatResultCount === 1 ? "" : "es"}</span>
          {query.length > 0 && <span className="font-code opacity-70">Searching as you type</span>}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2" role="region" aria-label="Workspace search results">
        {loading && (
          <p className="px-2 py-1.5 text-[13px] text-[var(--overlay1)]">Searching...</p>
        )}
        {!loading && results.length === 0 && (
          <div className="px-2 py-1.5 text-[13px] text-[var(--overlay0)] text-pretty">
            {lastSubmittedQuery.length > 0
              ? `No matches for "${lastSubmittedQuery}". Try a broader term or search another file name.`
              : "Type a term to search across the workspace."}
          </div>
        )}
        <ul className="space-y-2">
          {results.map((file) => (
            <li key={file.relativePath}>
              <p className="px-2 py-1.5 text-[12px] font-semibold text-[var(--subtext1)]">
                {file.relativePath}
              </p>
              <ul className="space-y-0.5" aria-label={`Matches in ${file.relativePath}`}>
                {file.matches.map((match) => {
                  return (
                    <li key={`${file.relativePath}:${match.line}:${match.preview}`}>
                      <button
                        type="button"
                        className="w-full rounded border border-transparent px-2.5 py-1.5 text-left text-[13px] text-[var(--subtext0)] transition-colors duration-75 hover:bg-[var(--surface0)] hover:text-[var(--subtext1)]"
                        onClick={() => onOpenResult(file.relativePath, match.line)}
                      >
                        <span className="mr-2 inline-block min-w-[28px] text-[11px] font-mono text-[var(--overlay1)]">
                          {match.line}
                        </span>
                        <span className="font-code text-[12px] opacity-90">{match.preview}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default SearchPanel;
