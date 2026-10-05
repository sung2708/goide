import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { fetchWorkspaceDiagnostics } from "../../lib/ipc/client";
import type { EditorDiagnostic } from "../../lib/ipc/types";
import { isGoFile } from "./editorShellUtils";
import type { DocumentSnapshot } from "../../features/documents/DocumentSession";
import { useLanguageCancellation } from "../../features/language/useLanguageCancellation";

export type DiagnosticsIndicatorState = "available" | "unavailable" | "idle";

export type FileDiagnosticsSummary = {
  hasErrors: boolean;
  hasWarnings: boolean;
};

type UseDiagnosticsStateParams = {
  getDocumentSnapshot?: () => DocumentSnapshot;
  documentSnapshot?: DocumentSnapshot;
  workspacePathRef: MutableRefObject<string | null>;
  activeFilePathRef: MutableRefObject<string | null>;
};

type DiagnosticsState = {
  knownDiagnostics: Record<string, EditorDiagnostic[]>;
  forgetDiagnostics: (path: string) => void;
  diagnostics: EditorDiagnostic[];
  diagnosticsByFile: Record<string, FileDiagnosticsSummary>;
  diagnosticsAvailability: DiagnosticsIndicatorState;
  clearDiagnostics: () => void;
  clearActiveDiagnostics: () => void;
  invalidateDiagnosticsRequests: () => void;
  resetDiagnosticsState: () => void;
  refreshDiagnosticsForFile: (
    diagnosticWorkspacePath: string,
    diagnosticFilePath: string
  ) => Promise<void>;
  scheduleDiagnosticsRefresh: (
    diagnosticWorkspacePath: string | null,
    diagnosticFilePath: string | null
  ) => void;
};

export function useDiagnosticsState({
  getDocumentSnapshot,
  documentSnapshot,
  workspacePathRef,
  activeFilePathRef,
}: UseDiagnosticsStateParams): DiagnosticsState {
  const latestSnapshot = useRef(documentSnapshot); latestSnapshot.current = documentSnapshot;
  const snapshotGetter = useRef(getDocumentSnapshot); snapshotGetter.current = getDocumentSnapshot;
  const cancellation = useLanguageCancellation(documentSnapshot);
  const [diagnostics, setDiagnostics] = useState<EditorDiagnostic[]>([]);
  const [knownDiagnostics, setKnownDiagnostics] = useState<Record<string, EditorDiagnostic[]>>({});
  const forgetDiagnostics = useCallback((path: string) => {
    setKnownDiagnostics(previous => { const next = { ...previous }; delete next[path]; return next; });
    setDiagnosticsByFile(previous => { const next = { ...previous }; delete next[path]; return next; });
  }, []);
  const [diagnosticsByFile, setDiagnosticsByFile] = useState<
    Record<string, FileDiagnosticsSummary>
  >({});
  const [diagnosticsAvailability, setDiagnosticsAvailability] =
    useState<DiagnosticsIndicatorState>("idle");
  const diagnosticsRequestIdRef = useRef(0);
  const diagnosticDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diagnosticPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelDiagnosticsTimers = useCallback(() => {
    if (diagnosticDebounceRef.current !== null) {
      clearTimeout(diagnosticDebounceRef.current);
      diagnosticDebounceRef.current = null;
    }
    if (diagnosticPollRef.current !== null) {
      clearTimeout(diagnosticPollRef.current);
      diagnosticPollRef.current = null;
    }
  }, []);

  const clearDiagnostics = useCallback(() => {
    setDiagnostics([]);
  }, []);

  const clearActiveDiagnostics = useCallback(() => {
    cancelDiagnosticsTimers();
    setDiagnostics([]);
    setDiagnosticsAvailability("idle");
  }, [cancelDiagnosticsTimers]);

  const invalidateDiagnosticsRequests = useCallback(() => {
    diagnosticsRequestIdRef.current += 1;
    cancelDiagnosticsTimers();
  }, [cancelDiagnosticsTimers]);

  const resetDiagnosticsState = useCallback(() => {
    diagnosticsRequestIdRef.current += 1;
    cancelDiagnosticsTimers();
    setDiagnostics([]);
    setDiagnosticsByFile({});
    setKnownDiagnostics({});
    setDiagnosticsAvailability("idle");
  }, [cancelDiagnosticsTimers]);

  const removeDiagnosticsSummary = useCallback((diagnosticFilePath: string) => {
    setDiagnosticsByFile((prev) => {
      if (!(diagnosticFilePath in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[diagnosticFilePath];
      return next;
    });
  }, []);

  const refreshDiagnosticsForFile = useCallback(
    async (diagnosticWorkspacePath: string, diagnosticFilePath: string) => {
      if (!isGoFile(diagnosticFilePath)) {
        setDiagnostics([]);
        setDiagnosticsAvailability("idle");
        removeDiagnosticsSummary(diagnosticFilePath);
        return;
      }
      const requestId = diagnosticsRequestIdRef.current + 1;
      diagnosticsRequestIdRef.current = requestId;

      try {
        const expected = snapshotGetter.current?.() ?? latestSnapshot.current;
        const live = expected?.root === diagnosticWorkspacePath ? cancellation.begin(diagnosticWorkspacePath, expected) : null;
        let diagnosticsResponse;
        try {
          diagnosticsResponse = live && expected ? await fetchWorkspaceDiagnostics(diagnosticWorkspacePath, diagnosticFilePath, { requestId: live.requestId, buffers: expected.documents.filter(document => isGoFile(document.path)).map(document => ({ path: document.path, content: document.text })) }) : await fetchWorkspaceDiagnostics(diagnosticWorkspacePath, diagnosticFilePath);
        } finally { if (live) cancellation.complete(live.requestId); }

        if (
          requestId !== diagnosticsRequestIdRef.current ||
          workspacePathRef.current !== diagnosticWorkspacePath ||
          activeFilePathRef.current !== diagnosticFilePath ||
          (snapshotGetter.current?.() ?? latestSnapshot.current) !== expected
        ) {
          return;
        }

        if (diagnosticPollRef.current !== null) {
          clearTimeout(diagnosticPollRef.current);
          diagnosticPollRef.current = null;
        }

        if (diagnosticsResponse.ok && diagnosticsResponse.data) {
          setKnownDiagnostics(previous => ({ ...previous, [diagnosticFilePath]: diagnosticsResponse.data!.diagnostics }));
          setDiagnostics(diagnosticsResponse.data.diagnostics);
          setDiagnosticsAvailability(diagnosticsResponse.data.toolingAvailability);
          const hasErrors = diagnosticsResponse.data.diagnostics.some(
            (item) => item.severity === "error"
          );
          const hasWarnings = diagnosticsResponse.data.diagnostics.some(
            (item) => item.severity === "warning"
          );
          setDiagnosticsByFile((prev) => ({
            ...prev,
            [diagnosticFilePath]: { hasErrors, hasWarnings },
          }));
          if (hasErrors) {
            const pollRequestId = requestId;
            diagnosticPollRef.current = setTimeout(() => {
              if (
                pollRequestId === diagnosticsRequestIdRef.current &&
                workspacePathRef.current === diagnosticWorkspacePath &&
                activeFilePathRef.current === diagnosticFilePath
              ) {
                void refreshDiagnosticsForFile(diagnosticWorkspacePath, diagnosticFilePath);
              }
            }, 1200);
          }
        }
      } catch (_error) {
        // Keep the last known diagnostics on transient failures to avoid
        // flickering between valid and empty states.
      }
    },
    [activeFilePathRef, removeDiagnosticsSummary, workspacePathRef, cancellation.begin, cancellation.complete]
  );

  const scheduleDiagnosticsRefresh = useCallback(
    (diagnosticWorkspacePath: string | null, diagnosticFilePath: string | null) => {
      diagnosticsRequestIdRef.current += 1;
      cancelDiagnosticsTimers();
      diagnosticDebounceRef.current = setTimeout(() => {
        if (diagnosticWorkspacePath && diagnosticFilePath) {
          void refreshDiagnosticsForFile(diagnosticWorkspacePath, diagnosticFilePath);
        }
      }, 180);
    },
    [cancelDiagnosticsTimers, refreshDiagnosticsForFile]
  );

  const activeVersion = documentSnapshot?.documents.find(document => document.id === documentSnapshot.activeId)?.version;
  const priorActive = useRef<{ root: string | null; id: number | null; version: number | undefined } | null>(null);
  useEffect(() => {
    const previous = priorActive.current;
    priorActive.current = documentSnapshot ? { root: documentSnapshot.root, id: documentSnapshot.activeId, version: activeVersion } : null;
    // Opening/switching files already requests diagnostics through the shell.
    // Only buffer edits need this debounce, avoiding duplicate initial pulls.
    if (documentSnapshot && previous?.root === documentSnapshot.root && previous.id === documentSnapshot.activeId && previous.version !== activeVersion) scheduleDiagnosticsRefresh(documentSnapshot.root, documentSnapshot.documents.find(document => document.id === documentSnapshot.activeId)?.path ?? null);
  }, [documentSnapshot?.root, documentSnapshot?.activeId, activeVersion, scheduleDiagnosticsRefresh]);

  useEffect(() => {
    return () => {
      diagnosticsRequestIdRef.current += 1;
      cancelDiagnosticsTimers();
    };
  }, [cancelDiagnosticsTimers]);

  return {
    knownDiagnostics, forgetDiagnostics,
    diagnostics,
    diagnosticsByFile,
    diagnosticsAvailability,
    clearDiagnostics,
    clearActiveDiagnostics,
    invalidateDiagnosticsRequests,
    resetDiagnosticsState,
    refreshDiagnosticsForFile,
    scheduleDiagnosticsRefresh,
  };
}
