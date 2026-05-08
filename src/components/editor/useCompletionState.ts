import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { fetchWorkspaceCompletions } from "../../lib/ipc/client";
import type { CompletionItem } from "../../lib/ipc/types";
import type { EditorCompletionRequest } from "./CodeEditor";
import { isGoFile } from "./editorShellUtils";

export type CompletionIndicatorState = "available" | "degraded" | "idle";

type UseCompletionStateParams = {
  workspacePathRef: MutableRefObject<string | null>;
  activeFilePathRef: MutableRefObject<string | null>;
  activeFileContent: string | null;
  latestEditorContentRef: MutableRefObject<string | null>;
};

type CompletionState = {
  completionAvailability: CompletionIndicatorState;
  setCompletionAvailability: React.Dispatch<React.SetStateAction<CompletionIndicatorState>>;
  invalidateCompletionRequests: () => void;
  resetCompletionAvailability: () => void;
  handleRequestCompletions: (request: EditorCompletionRequest) => Promise<CompletionItem[]>;
};

export function useCompletionState({
  workspacePathRef,
  activeFilePathRef,
  activeFileContent,
  latestEditorContentRef,
}: UseCompletionStateParams): CompletionState {
  const [completionAvailability, setCompletionAvailability] =
    useState<CompletionIndicatorState>("idle");
  const completionRequestIdRef = useRef(0);

  const invalidateCompletionRequests = useCallback(() => {
    completionRequestIdRef.current += 1;
  }, []);

  const resetCompletionAvailability = useCallback(() => {
    setCompletionAvailability("idle");
  }, []);

  const handleRequestCompletions = useCallback(
    async (request: EditorCompletionRequest): Promise<CompletionItem[]> => {
      const currentWorkspace = workspacePathRef.current;
      const currentPath = activeFilePathRef.current;
      if (!currentWorkspace || !currentPath || !isGoFile(currentPath)) {
        setCompletionAvailability("idle");
        return [];
      }

      const requestId = completionRequestIdRef.current + 1;
      completionRequestIdRef.current = requestId;

      try {
        const response = await fetchWorkspaceCompletions({
          workspaceRoot: currentWorkspace,
          relativePath: currentPath,
          line: request.line,
          column: request.column,
          triggerCharacter: request.triggerCharacter ?? null,
          fileContent:
            request.fileContent ??
            latestEditorContentRef.current ??
            activeFileContent,
        });

        if (
          requestId !== completionRequestIdRef.current ||
          workspacePathRef.current !== currentWorkspace ||
          activeFilePathRef.current !== currentPath
        ) {
          return [];
        }

        if (!response.ok || !response.data) {
          setCompletionAvailability("degraded");
          return [];
        }
        setCompletionAvailability("available");

        return response.data;
      } catch (_error) {
        if (
          requestId === completionRequestIdRef.current &&
          workspacePathRef.current === currentWorkspace &&
          activeFilePathRef.current === currentPath
        ) {
          setCompletionAvailability("degraded");
          return [];
        }
        return [];
      }
    },
    [activeFileContent, activeFilePathRef, latestEditorContentRef, workspacePathRef]
  );

  return {
    completionAvailability,
    setCompletionAvailability,
    invalidateCompletionRequests,
    resetCompletionAvailability,
    handleRequestCompletions,
  };
}
