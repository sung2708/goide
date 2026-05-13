import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { fetchWorkspaceDiagnostics } from "../../lib/ipc/client";
import type { EditorDiagnostic } from "../../lib/ipc/types";
import { isGoFile } from "./editorShellUtils";

export type DiagnosticsIndicatorState = "available" | "unavailable" | "idle";

export type FileDiagnosticsSummary = {
  hasErrors: boolean;
  hasWarnings: boolean;
};

type UseDiagnosticsStateParams = {
  workspacePathRef: MutableRefObject<string | null>;
  activeFilePathRef: MutableRefObject<string | null>;
};

type DiagnosticsState = {
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
  workspacePathRef,
  activeFilePathRef,
}: UseDiagnosticsStateParams): DiagnosticsState {
  const [diagnostics, setDiagnostics] = useState<EditorDiagnostic[]>([]);
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
        const diagnosticsResponse = await fetchWorkspaceDiagnostics(
          diagnosticWorkspacePath,
          diagnosticFilePath
        );

        if (
          requestId !== diagnosticsRequestIdRef.current ||
          workspacePathRef.current !== diagnosticWorkspacePath ||
          activeFilePathRef.current !== diagnosticFilePath
        ) {
          return;
        }

        if (diagnosticPollRef.current !== null) {
          clearTimeout(diagnosticPollRef.current);
          diagnosticPollRef.current = null;
        }

        if (diagnosticsResponse.ok && diagnosticsResponse.data) {
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
    [activeFilePathRef, removeDiagnosticsSummary, workspacePathRef]
  );

  const scheduleDiagnosticsRefresh = useCallback(
    (diagnosticWorkspacePath: string | null, diagnosticFilePath: string | null) => {
      diagnosticsRequestIdRef.current += 1;
      cancelDiagnosticsTimers();
      diagnosticDebounceRef.current = setTimeout(() => {
        if (diagnosticWorkspacePath && diagnosticFilePath) {
          void refreshDiagnosticsForFile(diagnosticWorkspacePath, diagnosticFilePath);
        }
      }, 1000);
    },
    [cancelDiagnosticsTimers, refreshDiagnosticsForFile]
  );

  useEffect(() => {
    return () => {
      diagnosticsRequestIdRef.current += 1;
      cancelDiagnosticsTimers();
    };
  }, [cancelDiagnosticsTimers]);

  return {
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
