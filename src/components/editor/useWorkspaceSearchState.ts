import { useCallback, useRef, useState } from "react";
import { searchWorkspaceText } from "../../lib/ipc/client";
import type { WorkspaceSearchFile } from "../../lib/ipc/types";

type WorkspaceSearchState = {
  searchLoading: boolean;
  workspaceSearchResults: WorkspaceSearchFile[];
  resetWorkspaceSearch: () => void;
  handleWorkspaceSearch: (query: string) => Promise<void>;
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

  return {
    searchLoading,
    workspaceSearchResults,
    resetWorkspaceSearch,
    handleWorkspaceSearch,
  };
}
