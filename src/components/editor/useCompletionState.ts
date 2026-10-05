import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useLanguageCancellation } from "../../features/language/useLanguageCancellation";
import { fetchWorkspaceCompletions } from "../../lib/ipc/client";
import type { CompletionItem } from "../../lib/ipc/types";
import type { EditorCompletionRequest } from "./CodeEditor";
import type { DocumentSnapshot } from "../../features/documents/DocumentSession";
import { isGoFile } from "./editorShellUtils";

export type CompletionIndicatorState = "available" | "degraded" | "idle";

type UseCompletionStateParams = {
  documentSnapshot?: DocumentSnapshot;
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
  documentSnapshot,
  workspacePathRef,
  activeFilePathRef,
  activeFileContent,
  latestEditorContentRef,
  onError,
}: UseCompletionStateParams): CompletionState {
  const snapshotRef = useRef(documentSnapshot); snapshotRef.current = documentSnapshot;
  // Monaco can request the just-typed model before React commits its text.
  // Only ownership changes cancel here; Monaco's token owns edit cancellation.
  const context = useMemo(() => ({}), [workspacePathRef.current, activeFilePathRef.current]);
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
      const otherBuffers = snapshotRef.current?.root === currentWorkspace
        ? snapshotRef.current.documents.filter(document => isGoFile(document.path) && document.path !== currentPath).map(document => [document.path, document.text] as const)
        : null;
      const cancelNative = () => cancellation.cancel(native.requestId);
      request.signal?.addEventListener("abort", cancelNative, { once: true });

      try {
        const response = await fetchWorkspaceCompletions({
          ...(snapshotRef.current?.root === currentWorkspace ? { buffers: snapshotRef.current.documents.filter(document => isGoFile(document.path)).map(document => ({ path: document.path, content: document.path === currentPath ? request.fileContent ?? latestEditorContentRef.current ?? document.text : document.text })) } : {}),
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

        if (otherBuffers) {
          const liveOthers = snapshotRef.current?.documents.filter(document => isGoFile(document.path) && document.path !== currentPath).map(document => [document.path, document.text] as const) ?? [];
          if (otherBuffers.length !== liveOthers.length || otherBuffers.some(([path, text], index) => path !== liveOthers[index][0] || text !== liveOthers[index][1])) return [];
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
    [documentSnapshot, activeFileContent, activeFilePathRef, latestEditorContentRef, workspacePathRef, cancellation.begin, cancellation.complete, cancellation.cancel]
  );

  return {
    completionAvailability,
    setCompletionAvailability,
    invalidateCompletionRequests,
    resetCompletionAvailability,
    handleRequestCompletions,
  };
}
