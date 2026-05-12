import { useCallback, useRef, useState } from "react";
import {
  readWorkspaceFile,
  searchWorkspaceText,
  writeWorkspaceFile,
} from "../../lib/ipc/client";
import type { WorkspaceSearchFile } from "../../lib/ipc/types";

type WorkspaceSearchState = {
  searchLoading: boolean;
  workspaceSearchResults: WorkspaceSearchFile[];
  resetWorkspaceSearch: () => void;
  handleWorkspaceSearch: (query: string) => Promise<void>;
  replaceMatch: (
    file: string,
    line: number,
    searchText: string,
    replacement: string
  ) => Promise<void>;
  replaceAllMatches: (searchText: string, replacement: string) => Promise<void>;
};

export function useWorkspaceSearchState(
  workspacePath: string | null
): WorkspaceSearchState {
  const [searchLoading, setSearchLoading] = useState(false);
  const [workspaceSearchResults, setWorkspaceSearchResults] = useState<
    WorkspaceSearchFile[]
  >([]);
  const searchRequestIdRef = useRef(0);

  const resetWorkspaceSearch = useCallback(() => {
    searchRequestIdRef.current += 1;
    setWorkspaceSearchResults([]);
    setSearchLoading(false);
  }, []);

  const handleWorkspaceSearch = useCallback(
    async (query: string) => {
      const trimmedQuery = query.trim();
      if (!workspacePath || !trimmedQuery) {
        searchRequestIdRef.current += 1;
        setWorkspaceSearchResults([]);
        setSearchLoading(false);
        return;
      }
      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;
      setSearchLoading(true);
      try {
        const resp = await searchWorkspaceText(workspacePath, trimmedQuery);
        if (requestId !== searchRequestIdRef.current) {
          return;
        }
        if (resp.ok && resp.data) {
          setWorkspaceSearchResults(resp.data);
        } else {
          setWorkspaceSearchResults([]);
        }
      } catch (err) {
        console.error("Search failed:", err);
        if (requestId === searchRequestIdRef.current) {
          setWorkspaceSearchResults([]);
        }
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setSearchLoading(false);
        }
      }
    },
    [workspacePath]
  );

  const replaceMatch = useCallback(
    async (
      file: string,
      line: number,
      searchText: string,
      replacement: string
    ): Promise<void> => {
      if (!workspacePath) return;

      const resp = await readWorkspaceFile(workspacePath, file);
      if (!resp.ok || resp.data == null) return;

      const lines = resp.data.split("\n");
      const idx = line - 1;
      if (idx < 0 || idx >= lines.length) return;

      const before = lines[idx].indexOf(searchText);
      if (before === -1) return;
      lines[idx] =
        lines[idx].slice(0, before) +
        replacement +
        lines[idx].slice(before + searchText.length);
      await writeWorkspaceFile(workspacePath, file, lines.join("\n"));
    },
    [workspacePath]
  );

  const replaceAllMatches = useCallback(
    async (searchText: string, replacement: string): Promise<void> => {
      if (!workspacePath) return;

      for (const file of workspaceSearchResults) {
        const resp = await readWorkspaceFile(workspacePath, file.relativePath);
        if (!resp.ok || resp.data == null) continue;

        const newContent = resp.data.split(searchText).join(replacement);
        if (newContent === resp.data) continue;

        await writeWorkspaceFile(workspacePath, file.relativePath, newContent);
      }

      await handleWorkspaceSearch(searchText);
    },
    [workspacePath, workspaceSearchResults, handleWorkspaceSearch]
  );

  return {
    searchLoading,
    workspaceSearchResults,
    resetWorkspaceSearch,
    handleWorkspaceSearch,
    replaceMatch,
    replaceAllMatches,
  };
}
