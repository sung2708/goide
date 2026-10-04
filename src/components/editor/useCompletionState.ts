import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useLanguageCancellation } from "../../features/language/useLanguageCancellation";
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
  onError?: (message: string) => void;
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
  onError,
}: UseCompletionStateParams): CompletionState {
  const context = useMemo(() => ({}), [workspacePathRef.current, activeFilePathRef.current, activeFileContent]);
  const cancellation = useLanguageCancellation(context, onError);
  const [completionAvailability, setCompletionAvailability] =
    useState<CompletionIndicatorState>("idle");
  const completionRequestIdRef = useRef(0);

  const invalidateCompletionRequests = useCallback(() => {
    completionRequestIdRef.current += 1;
    cancellation.cancel();
  }, [cancellation.cancel]);

  const resetCompletionAvailability = useCallback(() => {
    setCompletionAvailability("idle");
  }, []);

  const handleRequestCompletions = useCallback(
    async (request: EditorCompletionRequest): Promise<CompletionItem[]> => {
      const currentWorkspace = workspacePathRef.current;
      const currentPath = activeFilePathRef.current;
      if (request.signal?.aborted) return [];
      if (!currentWorkspace || !currentPath || !isGoFile(currentPath)) {
        setCompletionAvailability("idle");
        return [];
      }

      const requestId = completionRequestIdRef.current + 1;
      completionRequestIdRef.current = requestId;
      const native = cancellation.begin(currentWorkspace);
      const cancelNative = () => cancellation.cancel(native.requestId);
      request.signal?.addEventListener("abort", cancelNative, { once: true });

      try {
        const response = await fetchWorkspaceCompletions({
          ...native,
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
          request.signal?.aborted ||
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
          !request.signal?.aborted &&
          requestId === completionRequestIdRef.current &&
          workspacePathRef.current === currentWorkspace &&
          activeFilePathRef.current === currentPath
        ) {
          setCompletionAvailability("degraded");
          return [];
        }
        return [];
      } finally {
        request.signal?.removeEventListener("abort", cancelNative);
        cancellation.complete(native.requestId);
      }
    },
    [activeFileContent, activeFilePathRef, latestEditorContentRef, workspacePathRef, cancellation.begin, cancellation.complete, cancellation.cancel]
  );

  return {
    completionAvailability,
    setCompletionAvailability,
    invalidateCompletionRequests,
    resetCompletionAvailability,
    handleRequestCompletions,
  };
}
