import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLensSignals } from "../../features/concurrency/useLensSignals";
import type { VisibleLineRange } from "../../features/concurrency/signalDensity";
import { useHoverHint } from "../../hooks/useHoverHint";
import {
  activateScopedDeepTrace,
  deactivateDeepTrace,
  getRuntimeAvailability,
  getRuntimeSignals,
  readWorkspaceFile,
  writeWorkspaceFile,
  runWorkspaceFile,
  fetchWorkspaceCompletions,
  fetchWorkspaceDiagnostics,
} from "../../lib/ipc/client";
import type {
  ApiResponse,
  CompletionItem,
  ConcurrencyConfidence,
  DeepTraceConstructKind,
  EditorDiagnostic,
  RuntimeSignal,
  RunOutputPayload,
} from "../../lib/ipc/types";
import CommandPalette from "../command-palette/CommandPalette";
import HintUnderline from "../overlays/HintUnderline";
import InlineActions from "../overlays/InlineActions";
import ThreadLine from "../overlays/ThreadLine";
import TraceBubble from "../overlays/TraceBubble";
import type { TraceBubbleConfidence } from "../overlays/TraceBubble";
import type { LensConstructKind } from "../../features/concurrency/lensTypes";
import BottomPanel from "../panels/BottomPanel";
import SummaryPeek, { type SummaryItem } from "../panels/SummaryPeek";
import SourceTree from "../sidebar/SourceTree";
import StatusBar from "../statusbar/StatusBar";
import CodeEditor, {
  type EditorCompletionRequest,
  type JumpRequest,
} from "./CodeEditor";

const EDITOR_BG = "bg-[#1e1e2e]";
const PANEL_BG = "bg-[#181825]";
const BORDER = "border-[#313244]";
const TEXT_MUTED = "text-[#a6adc8]";
const KIND_LABELS: Record<LensConstructKind, string> = {
  channel: "Channel Op",
  select: "Select Stmt",
  mutex: "Mutex",
  "wait-group": "WaitGroup",
};
const BLOCKED_WAIT_REASONS = [
  "chan receive",
  "chan send",
  "semacquire",
  "select",
  "sleep",
  "io wait",
];
const DEFAULT_RUNTIME_SIGNAL_REQUEST_TIMEOUT_MS = 450;
const MAX_PENDING_RUNTIME_SIGNAL_REQUESTS = 2;

function isBlockedWaitReason(waitReason: string): boolean {
  const normalized = waitReason.trim().toLowerCase();
  return BLOCKED_WAIT_REASONS.some((reason) => normalized.includes(reason));
}

function resolveRuntimeSignalTimeoutMs(): number {
  const raw = import.meta.env.VITE_RUNTIME_SIGNAL_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 100 || parsed > 5000) {
    return DEFAULT_RUNTIME_SIGNAL_REQUEST_TIMEOUT_MS;
  }
  return Math.round(parsed);
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").trim();
}

type CounterpartResolution = {
  line: number;
  confidence: ConcurrencyConfidence;
  source: "runtime" | "static";
};

function toTraceBubbleConfidence(
  confidence?: ConcurrencyConfidence | null
): TraceBubbleConfidence {
  switch ((confidence ?? "").toLowerCase()) {
    case "confirmed":
      return "confirmed";
    case "likely":
      return "likely";
    default:
      return "predicted";
  }
}

function runtimeSignalMatchesScope(
  signal: RuntimeSignal,
  scope: {
    scopeKey: string | null;
    filePath: string;
    line: number;
    column: number;
  }
): boolean {
  // Scope key is treated as a preferred discriminator, but line/column/path remain
  // the authoritative identity in case key formatting drifts across layers.
  return (
    normalizeRelativePath(signal.relativePath) === normalizeRelativePath(scope.filePath) &&
    signal.line === scope.line &&
    signal.column === scope.column
  );
}

async function getRuntimeSignalsWithTimeout(
  timeoutMs: number,
  callbacks?: {
    onTimeout?: () => void;
    onSettled?: () => void;
  }
): Promise<ApiResponse<RuntimeSignal[]>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      callbacks?.onTimeout?.();
      reject(new Error("runtime signal request timed out"));
    }, timeoutMs);

    getRuntimeSignals()
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      })
      .finally(() => {
        callbacks?.onSettled?.();
      });
  });
}

function isGoFile(path: string | null): path is string {
  return typeof path === "string" && path.toLowerCase().endsWith(".go");
}

function EditorShell() {
  const runtimeSignalTimeoutMs = resolveRuntimeSignalTimeoutMs();
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [mode, setMode] = useState<"quick-insight" | "deep-trace">(
    "quick-insight"
  );
  const previousModeRef = useRef<"quick-insight" | "deep-trace">("quick-insight");
  const [runtimeAvailability, setRuntimeAvailability] = useState<
    "available" | "unavailable"
  >("unavailable");
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [runOutput, setRunOutput] = useState<RunOutputPayload[]>([]);
  const [diagnostics, setDiagnostics] = useState<EditorDiagnostic[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const isSavingRef = useRef(false);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedContentRef = useRef<string | null>(null);
  const latestEditorContentRef = useRef<string | null>(null);
  const [paletteReturnFocusEl, setPaletteReturnFocusEl] =
    useState<HTMLElement | null>(null);
  const [visibleRange, setVisibleRange] = useState<VisibleLineRange | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [jumpRequest, setJumpRequest] = useState<JumpRequest | null>(null);
  const [interactionAnchor, setInteractionAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [counterpartAnchor, setCounterpartAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const jumpRequestIdRef = useRef(0);
  const activeRunIdRef = useRef<string | null>(null);
  const workspacePathRef = useRef(workspacePath);
  workspacePathRef.current = workspacePath;
  const activeFilePathRef = useRef(activeFilePath);
  activeFilePathRef.current = activeFilePath;
  const diagnosticsRequestIdRef = useRef(0);
  const completionRequestIdRef = useRef(0);
  const deepTraceRequestIdRef = useRef(0);
  const runtimeCheckRequestIdRef = useRef(0);
  const runtimeSignalRequestIdRef = useRef(0);
  const runtimeSignalInFlightRef = useRef(false);
  const runtimeSignalPendingRequestCountRef = useRef(0);
  const [deepTraceScope, setDeepTraceScope] = useState<{
    workspacePath: string;
    filePath: string;
    line: number;
    column: number;
    scopeKey: string | null;
    anchorTop: number;
    anchorLeft: number;
  } | null>(null);
  const [activeBlockedSignal, setActiveBlockedSignal] = useState<RuntimeSignal | null>(
    null
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    setJumpRequest(null);
  }, [workspacePath, activeFilePath]);

  useEffect(() => {
    const previousMode = previousModeRef.current;
    previousModeRef.current = mode;
    if (previousMode === "deep-trace" && mode !== "deep-trace") {
      void deactivateDeepTrace();
      setDeepTraceScope(null);
      setActiveBlockedSignal(null);
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      void deactivateDeepTrace();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  // Clear the auto-dismiss timer on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current !== null) {
        clearTimeout(saveStatusTimerRef.current);
      }
    };
  }, []);

  const { detectedConstructs, counterpartMappings } = useLensSignals({
    workspacePath,
    activeFilePath,
    workspacePathRef,
  });
  const { hoveredLine, activeHint, activeHintLine, setHoveredLine } = useHoverHint({
    workspacePath,
    activeFilePath,
    runtimeAvailability,
    selectedLine,
    visibleRange,
    detectedConstructs,
  });

  const isInlineActionsVisible =
    activeHint !== null &&
    (hoveredLine !== null || selectedLine === activeHintLine);

  const traceBubbleLabel = activeHint?.kind
    ? (KIND_LABELS[activeHint.kind] ?? activeHint.kind)
    : "";
  const isBlockedConfirmedVisible = mode === "deep-trace" && activeBlockedSignal !== null;
  const isTraceBubbleVisible = isInlineActionsVisible || isBlockedConfirmedVisible;

  const resolveStaticCounterpart = useCallback(
    (sourceLine: number, hintSymbol?: string | null) => {
      const candidates = counterpartMappings.filter(
        (mapping) => mapping.sourceLine === sourceLine
      );
      if (candidates.length === 0) {
        return null;
      }

      const normalizedSymbol =
        typeof hintSymbol === "string" ? hintSymbol.trim() : "";

      if (!normalizedSymbol) {
        return candidates.length === 1
          ? {
              line: candidates[0].counterpartLine,
              confidence: candidates[0].confidence,
              source: "static" as const,
            }
          : null;
      }

      const filtered = candidates.filter(
        (mapping) => mapping.symbol === normalizedSymbol
      );

      if (filtered.length === 0) {
        return null;
      }

      const uniqueCounterpartLines = [
        ...new Set(filtered.map((m) => m.counterpartLine)),
      ];
      if (uniqueCounterpartLines.length !== 1) {
        return null;
      }

      const confidence = filtered[0]?.confidence ?? "predicted";
      return {
        line: uniqueCounterpartLines[0],
        confidence,
        source: "static" as const,
      };
    },
    [counterpartMappings]
  );

  const resolveRuntimeCounterpart = useCallback((): CounterpartResolution | null => {
    if (!activeBlockedSignal) {
      return null;
    }
    const counterpartLine = activeBlockedSignal.counterpartLine ?? null;
    if (
      counterpartLine === null ||
      !Number.isInteger(counterpartLine) ||
      counterpartLine < 1
    ) {
      return null;
    }

    return {
      line: counterpartLine,
      confidence:
        (activeBlockedSignal.counterpartConfidence ?? "likely") as ConcurrencyConfidence,
      source: "runtime",
    };
  }, [activeBlockedSignal]);

  const resolveCounterpartFromActiveHint = useCallback(() => {
    if (activeHintLine === null || activeHint?.kind !== "channel") {
      return null;
    }

    const runtimeResolution =
      mode === "deep-trace" && deepTraceScope && activeHintLine === deepTraceScope.line
        ? resolveRuntimeCounterpart()
        : null;
    if (runtimeResolution) {
      return runtimeResolution;
    }
    return resolveStaticCounterpart(activeHintLine, activeHint.symbol);
  }, [
    activeHint,
    activeHintLine,
    mode,
    deepTraceScope,
    resolveRuntimeCounterpart,
    resolveStaticCounterpart,
  ]);

  const hasCounterpart = useMemo(
    () => resolveCounterpartFromActiveHint() !== null,
    [resolveCounterpartFromActiveHint]
  );
  const counterpartResolution = resolveCounterpartFromActiveHint();
  const effectiveHint =
    isBlockedConfirmedVisible && activeHint
      ? { ...activeHint, confidence: "confirmed" as ConcurrencyConfidence }
      : activeHint;
  const traceBubbleConfidence = isBlockedConfirmedVisible
    ? toTraceBubbleConfidence(counterpartResolution?.confidence ?? "likely")
    : toTraceBubbleConfidence(effectiveHint?.confidence);

  const summaryItems = useMemo<SummaryItem[]>(() => {
    return detectedConstructs
      .filter(
        (construct) =>
          Number.isFinite(construct.line) && Number.isInteger(construct.line) && construct.line >= 1
      )
      .sort((a, b) => {
        if (a.line !== b.line) {
          return a.line - b.line;
        }
        if (a.column !== b.column) {
          return a.column - b.column;
        }
        return a.kind.localeCompare(b.kind);
      })
      .map((construct) => ({
        line: construct.line,
        label: KIND_LABELS[construct.kind] ?? construct.kind,
        confidence: construct.confidence,
        symbol: construct.symbol,
      }));
  }, [detectedConstructs]);

  const requestJump = useCallback((targetLine: number | null) => {
    if (targetLine === null) {
      return;
    }
    if (targetLine < 1 || !Number.isInteger(targetLine)) {
      return;
    }
    if (activeFileContent === null) {
      return;
    }
    const maxLine = activeFileContent.split("\n").length;
    if (targetLine > maxLine) {
      return;
    }

    jumpRequestIdRef.current += 1;
    setJumpRequest({
      line: targetLine,
      requestId: jumpRequestIdRef.current,
    });
  }, [activeFileContent]);

  const handleJump = useCallback(() => {
    requestJump(resolveCounterpartFromActiveHint()?.line ?? null);
  }, [requestJump, resolveCounterpartFromActiveHint]);

  const handleDeepTrace = useCallback(async () => {
    if (runtimeAvailability !== "available") {
      return;
    }
    if (!workspacePath || !activeFilePath || !activeHint) {
      return;
    }

    const line = activeHintLine ?? activeHint.line;
    const column = activeHint.column;
    if (line < 1 || column < 1) {
      return;
    }
    const staticCounterpart = resolveStaticCounterpart(line, activeHint.symbol);
    const requestWorkspacePath = workspacePath;
    const requestFilePath = activeFilePath;
    deepTraceRequestIdRef.current += 1;
    const requestId = deepTraceRequestIdRef.current;

    try {
      const response = await activateScopedDeepTrace({
        workspaceRoot: requestWorkspacePath,
        relativePath: requestFilePath,
        line,
        column,
        constructKind: activeHint.kind as DeepTraceConstructKind,
        symbol: activeHint.symbol,
        counterpartRelativePath: staticCounterpart ? requestFilePath : null,
        counterpartLine: staticCounterpart?.line ?? null,
        counterpartColumn: activeHint.column,
        counterpartConfidence: staticCounterpart?.confidence ?? null,
      });
      if (
        requestId !== deepTraceRequestIdRef.current ||
        workspacePathRef.current !== requestWorkspacePath ||
        activeFilePathRef.current !== requestFilePath
      ) {
        return;
      }

      if (response.ok && response.data?.mode === "deep-trace") {
        setDeepTraceScope({
          workspacePath: requestWorkspacePath,
          filePath: requestFilePath,
          line,
          column,
          scopeKey: response.data.scopeKey ?? null,
          anchorTop: interactionAnchor?.top ?? 24,
          anchorLeft: interactionAnchor?.left ?? 12,
        });
        setMode("deep-trace");
        return;
      }
    } catch (error) {
      console.error("Failed to activate Deep Trace:", error);
    }

    setMode("quick-insight");
    setDeepTraceScope(null);
    setActiveBlockedSignal(null);
  }, [
    activeFilePath,
    activeHint,
    activeHintLine,
    resolveStaticCounterpart,
    runtimeAvailability,
    workspacePath,
  ]);

  useEffect(() => {
    if (
      mode !== "deep-trace" ||
      !deepTraceScope ||
      workspacePath !== deepTraceScope.workspacePath ||
      activeFilePath !== deepTraceScope.filePath
    ) {
      setActiveBlockedSignal(null);
      return;
    }

    const scopeSnapshot = deepTraceScope;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const pollRuntimeSignals = async () => {
      if (
        runtimeSignalInFlightRef.current ||
        runtimeSignalPendingRequestCountRef.current >=
          MAX_PENDING_RUNTIME_SIGNAL_REQUESTS
      ) {
        return;
      }

      runtimeSignalInFlightRef.current = true;
      runtimeSignalPendingRequestCountRef.current += 1;
      runtimeSignalRequestIdRef.current += 1;
      const requestId = runtimeSignalRequestIdRef.current;
      let released = false;
      let pendingSlotReleased = false;
      const releaseInFlight = () => {
        if (
          !released &&
          requestId === runtimeSignalRequestIdRef.current
        ) {
          released = true;
          runtimeSignalInFlightRef.current = false;
        }
      };
      const releasePendingSlot = () => {
        if (!pendingSlotReleased) {
          pendingSlotReleased = true;
          runtimeSignalPendingRequestCountRef.current = Math.max(
            0,
            runtimeSignalPendingRequestCountRef.current - 1
          );
        }
      };

      try {
        const response = await getRuntimeSignalsWithTimeout(
          runtimeSignalTimeoutMs,
          {
            onTimeout: () => {
              if (requestId === runtimeSignalRequestIdRef.current) {
                releaseInFlight();
              }
            },
            onSettled: () => {
              releasePendingSlot();
              releaseInFlight();
            },
          }
        );
        if (
          cancelled ||
          requestId !== runtimeSignalRequestIdRef.current ||
          workspacePathRef.current !== scopeSnapshot.workspacePath ||
          activeFilePathRef.current !== scopeSnapshot.filePath
        ) {
          return;
        }

        const blockedCandidates =
          response.ok && response.data
            ? response.data.filter(
                (signal) =>
                  isBlockedWaitReason(signal.waitReason) &&
                  runtimeSignalMatchesScope(signal, scopeSnapshot)
              )
            : [];
        const prioritizedCandidate =
          blockedCandidates.find(
            (signal) =>
              signal.counterpartLine !== null &&
              signal.counterpartLine !== undefined
          ) ?? blockedCandidates[0] ?? null;
        setActiveBlockedSignal(prioritizedCandidate);
      } catch (_error) {
        if (
          !cancelled &&
          requestId === runtimeSignalRequestIdRef.current &&
          workspacePathRef.current === scopeSnapshot.workspacePath &&
          activeFilePathRef.current === scopeSnapshot.filePath
        ) {
          setActiveBlockedSignal(null);
        }
      } finally {
        releaseInFlight();
      }
    };

    void pollRuntimeSignals();
    intervalId = setInterval(() => {
      void pollRuntimeSignals();
    }, 600);

    return () => {
      cancelled = true;
      runtimeSignalInFlightRef.current = false;
      runtimeSignalPendingRequestCountRef.current = 0;
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, [activeFilePath, deepTraceScope, mode, runtimeSignalTimeoutMs, workspacePath]);

  const persistActiveFileContent = useCallback(
    async (content: string) => {
      const currentPath = activeFilePath;
      if (!workspacePath || !currentPath) {
        return false;
      }
      // Guard: ignore concurrent save requests
      if (isSavingRef.current) {
        return false;
      }

      isSavingRef.current = true;
      latestEditorContentRef.current = content;
      if (saveStatusTimerRef.current !== null) {
        clearTimeout(saveStatusTimerRef.current);
        saveStatusTimerRef.current = null;
      }

      const saveWorkspacePath = workspacePath;
      const saveFilePath = currentPath;
      const refreshDiagnostics = async () => {
        if (!isGoFile(saveFilePath)) {
          setDiagnostics([]);
          return;
        }
        const requestId = diagnosticsRequestIdRef.current + 1;
        diagnosticsRequestIdRef.current = requestId;

        try {
          const diagnosticsResponse = await fetchWorkspaceDiagnostics(
            saveWorkspacePath,
            saveFilePath
          );

          if (
            requestId !== diagnosticsRequestIdRef.current ||
            workspacePathRef.current !== saveWorkspacePath ||
            activeFilePathRef.current !== saveFilePath
          ) {
            return;
          }

          if (diagnosticsResponse.ok && diagnosticsResponse.data) {
            setDiagnostics(diagnosticsResponse.data);
          } else {
            setDiagnostics([]);
          }
        } catch (_error) {
          if (
            requestId === diagnosticsRequestIdRef.current &&
            workspacePathRef.current === saveWorkspacePath &&
            activeFilePathRef.current === saveFilePath
          ) {
            setDiagnostics([]);
          }
        }
      };

      setSaveStatus("saving");
      try {
        const response = await writeWorkspaceFile(workspacePath, currentPath, content);
        if (
          workspacePathRef.current !== saveWorkspacePath ||
          activeFilePathRef.current !== saveFilePath
        ) {
          return false;
        }
        if (response.ok) {
          savedContentRef.current = content;
          const hasNewerEdits = latestEditorContentRef.current !== content;
          setIsDirty(hasNewerEdits);
          if (hasNewerEdits) {
            setSaveStatus("idle");
          } else {
            setSaveStatus("saved");
            saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
          }
          await refreshDiagnostics();
          return true;
        } else {
          setSaveStatus("error");
          saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 5000);
          return false;
        }
      } catch (error) {
        if (
          workspacePathRef.current !== saveWorkspacePath ||
          activeFilePathRef.current !== saveFilePath
        ) {
          return false;
        }
        setSaveStatus("error");
        saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 5000);
        console.error("Failed to save file:", error);
        return false;
      } finally {
        isSavingRef.current = false;
      }
    },
    [workspacePath, activeFilePath]
  );

  const handleSaveFile = useCallback(
    async (content: string) => {
      await persistActiveFileContent(content);
    },
    [persistActiveFileContent]
  );

  const handleRequestCompletions = useCallback(
    async (request: EditorCompletionRequest): Promise<CompletionItem[]> => {
      const currentWorkspace = workspacePathRef.current;
      const currentPath = activeFilePathRef.current;
      if (!currentWorkspace || !currentPath || !isGoFile(currentPath)) {
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
          return [];
        }

        return response.data;
      } catch (_error) {
        if (
          requestId === completionRequestIdRef.current &&
          workspacePathRef.current === currentWorkspace &&
          activeFilePathRef.current === currentPath
        ) {
          return [];
        }
        return [];
      }
    },
    [activeFileContent]
  );
  
  const handleRunFile = useCallback(async () => {
    if (!workspacePath || !activeFilePath) return;
    const runId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    activeRunIdRef.current = runId;

    const contentToRun = latestEditorContentRef.current ?? activeFileContent;
    if (isDirty && typeof contentToRun === "string") {
      const didSave = await persistActiveFileContent(contentToRun);
      if (!didSave) {
        if (activeRunIdRef.current !== runId) {
          return;
        }
        setRunStatus("error");
        setIsBottomPanelOpen(true);
        setRunOutput([
          {
            runId,
            line: "Failed to save latest changes before run. Resolve save errors and retry.",
            stream: "stderr",
          },
        ]);
        return;
      }
    }

    setRunOutput([]);
    setRunStatus("running");
    setIsBottomPanelOpen(true);

    try {
      const resp = await runWorkspaceFile(workspacePath, activeFilePath, runId);
      if (!resp.ok) {
        if (activeRunIdRef.current !== runId) {
          return;
        }
        setRunStatus("error");
        setRunOutput([{
          runId,
          line: `Failed to start: ${resp.error?.message ?? "Unknown error"}`,
          stream: "stderr"
        }]);
      }
    } catch (err) {
      if (activeRunIdRef.current !== runId) {
        return;
      }
      setRunStatus("error");
      setRunOutput([{
        runId,
        line: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
        stream: "stderr"
      }]);
    }
  }, [workspacePath, activeFilePath, activeFileContent, isDirty, persistActiveFileContent]);

  const handleClearOutput = useCallback(() => {
    setRunOutput([]);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isUnmounted = false;

    const setupListener = async () => {
      const dispose = await listen<RunOutputPayload>("run-output", (event) => {
        if (event.payload.runId !== activeRunIdRef.current) {
          return;
        }
        setRunOutput((prev) => [...prev, event.payload]);
        if (event.payload.stream === "exit") {
          setRunStatus(event.payload.exitCode === 0 ? "done" : "error");
        }
      });
      if (isUnmounted) {
        dispose();
        return;
      }
      unlisten = dispose;
    };

    setupListener();
    return () => {
      isUnmounted = true;
      if (unlisten) unlisten();
    };
  }, []);

  const handleEditorChange = useCallback((value: string) => {
    latestEditorContentRef.current = value;
    setIsDirty(value !== savedContentRef.current);
    // Reset transient statuses when the user starts editing again
    setSaveStatus((prev) => (prev === "error" || prev === "saved" ? "idle" : prev));
  }, []);

  const handleModifierClickLine = useCallback(
    (line: number): boolean => {
      if (activeHintLine !== line || activeHint?.kind !== "channel") {
        return false;
      }

      const runtimeResolution =
        mode === "deep-trace" ? resolveRuntimeCounterpart() : null;
      const targetLine =
        runtimeResolution?.line ??
        resolveStaticCounterpart(line, activeHint.symbol)?.line ??
        null;
      if (targetLine === null) {
        return false;
      }

      requestJump(targetLine);
      return true;
    },
    [
      activeHint,
      activeHintLine,
      mode,
      requestJump,
      resolveRuntimeCounterpart,
      resolveStaticCounterpart,
    ]
  );

  const openCommandPalette = useCallback(() => {
    if (isCommandPaletteOpen) {
      return;
    }
    setPaletteReturnFocusEl(document.activeElement as HTMLElement | null);
    setIsCommandPaletteOpen(true);
  }, [isCommandPaletteOpen]);

  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
    if (paletteReturnFocusEl instanceof HTMLElement) {
      requestAnimationFrame(() => paletteReturnFocusEl.focus());
    }
  }, [paletteReturnFocusEl]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCommandPaletteShortcut =
        event.key.toLowerCase() === "k" &&
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey;

      if (isCommandPaletteShortcut) {
        event.preventDefault();
        openCommandPalette();
      }

      if (event.key === "Escape" && isCommandPaletteOpen) {
        event.preventDefault();
        closeCommandPalette();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeCommandPalette, isCommandPaletteOpen, openCommandPalette]);

  const handleOpenWorkspace = useCallback(async () => {
    if (isOpening) {
      return;
    }

    setIsOpening(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open Workspace",
      });

      if (!selected) {
        return;
      }

      const resolvedPath = Array.isArray(selected) ? selected[0] : selected;
      if (typeof resolvedPath === "string") {
        setMode("quick-insight");
        setRuntimeAvailability("unavailable");
        setDeepTraceScope(null);
        setActiveBlockedSignal(null);
        setWorkspacePath(resolvedPath);
        setActiveFilePath(null);
        setActiveFileContent(null);
        diagnosticsRequestIdRef.current += 1;
        completionRequestIdRef.current += 1;
        setDiagnostics([]);
        setSelectedLine(null);
        setInteractionAnchor(null);
        setFileError(null);
      }
    } catch (error) {
      console.error("Failed to open workspace dialog:", error);
    } finally {
      setIsOpening(false);
    }
  }, [isOpening]);

  const handleOpenFile = useCallback(
    async (relativePath: string) => {
      if (!workspacePath || isReading) {
        return;
      }

      const startingPath = workspacePath;
      setIsReading(true);
      setFileError(null);
      setSelectedLine(null);
      setInteractionAnchor(null);
      diagnosticsRequestIdRef.current += 1;
      completionRequestIdRef.current += 1;
      setDiagnostics([]);

      try {
        const response = await readWorkspaceFile(workspacePath, relativePath);

        // If the workspace changed while we were reading, ignore the result
        if (workspacePathRef.current !== startingPath) {
          return;
        }

        if (!response.ok || response.data === undefined) {
          setActiveFilePath(relativePath);
          activeFilePathRef.current = relativePath;
          setActiveFileContent(null);
          setMode("quick-insight");
          setRuntimeAvailability("unavailable");
          setDeepTraceScope(null);
          setActiveBlockedSignal(null);
          setFileError(response.error?.message ?? "Unable to open file");
          return;
        }

        setActiveFilePath(relativePath);
        activeFilePathRef.current = relativePath;
        setActiveFileContent(response.data);
        setMode("quick-insight");
        setDeepTraceScope(null);
        setActiveBlockedSignal(null);
        if (isGoFile(relativePath)) {
          runtimeCheckRequestIdRef.current += 1;
          const requestId = runtimeCheckRequestIdRef.current;
          setRuntimeAvailability("unavailable");
          try {
            const availabilityResponse = await getRuntimeAvailability();
            if (
              requestId === runtimeCheckRequestIdRef.current &&
              workspacePathRef.current === startingPath &&
              activeFilePathRef.current === relativePath
            ) {
              setRuntimeAvailability(
                availabilityResponse.ok &&
                  availabilityResponse.data?.runtimeAvailability === "available"
                  ? "available"
                  : "unavailable"
              );
            }
          } catch (_error) {
            if (
              requestId === runtimeCheckRequestIdRef.current &&
              workspacePathRef.current === startingPath &&
              activeFilePathRef.current === relativePath
            ) {
              setRuntimeAvailability("unavailable");
            }
          }
        } else {
          setRuntimeAvailability("unavailable");
        }
        savedContentRef.current = response.data;
        latestEditorContentRef.current = response.data;
        setIsDirty(false);
        setSaveStatus("idle");
        if (!isGoFile(relativePath)) {
          setDiagnostics([]);
        }
      } catch (error) {
        if (workspacePathRef.current === startingPath) {
          setMode("quick-insight");
          setRuntimeAvailability("unavailable");
          setDeepTraceScope(null);
          setActiveBlockedSignal(null);
          setFileError("An unexpected error occurred while loading the file.");
        }
      } finally {
        setIsReading(false);
      }
    },
    [isReading, workspacePath]
  );

  const editorTitle = useMemo(() => {
    if (!activeFilePath) {
      return "Editor";
    }

    const segments = activeFilePath.split(/[\\/]/);
    const baseName = segments[segments.length - 1] ?? activeFilePath;
    return `${baseName}${isDirty ? " *" : ""}`;
  }, [activeFilePath, isDirty]);

  return (
    <div
      className={`relative flex h-full w-full flex-col ${EDITOR_BG} text-[#cdd6f4]`}
    >
      <div className="flex flex-1 overflow-hidden">
        <aside
          className={`flex min-w-[220px] basis-[22%] flex-col border-r ${BORDER} ${PANEL_BG}`}
        >
          <SourceTree
            workspacePath={workspacePath}
            activeFilePath={activeFilePath}
            onOpenFile={handleOpenFile}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <section className="flex min-w-0 flex-1 flex-col">
              <header
                className={`flex items-center justify-between border-b ${BORDER} px-4 py-2 text-[11px] uppercase tracking-[0.18em] ${TEXT_MUTED}`}
              >
                <span>{editorTitle}</span>
                <button
                  className={`rounded border ${BORDER} px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#cdd6f4] transition ${
                    isOpening
                      ? "cursor-not-allowed opacity-60"
                      : "hover:border-[#45475a] hover:text-white"
                  }`}
                  onClick={handleOpenWorkspace}
                  type="button"
                  disabled={isOpening}
                >
                  {isOpening ? "Opening..." : "Open Workspace"}
                </button>
                {activeFilePath && (
                  <button
                    className={`ml-2 rounded border ${BORDER} px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#cdd6f4] transition ${
                      runStatus === "running"
                        ? "cursor-not-allowed opacity-60"
                        : "hover:border-[#a6e3a1] hover:text-[#a6e3a1]"
                    }`}
                    onClick={handleRunFile}
                    type="button"
                    disabled={runStatus === "running"}
                  >
                    {runStatus === "running" ? "Running..." : "Run"}
                  </button>
                )}
              </header>

              <div className="flex flex-1 flex-col p-6">
                {!workspacePath && (
                  <div className="max-w-xl rounded border border-[#45475a] bg-[#11111b] p-6 text-center">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#a6adc8]">
                      No Workspace Open
                    </p>
                    <p className="mt-3 text-sm text-[#cdd6f4]">
                      Choose a folder to start. The shell is ready and will remain
                      instant.
                    </p>
                    <button
                      className={`mt-5 rounded border ${BORDER} px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#cdd6f4] transition ${
                        isOpening
                          ? "cursor-not-allowed opacity-60"
                          : "hover:border-[#45475a] hover:text-white"
                      }`}
                      onClick={handleOpenWorkspace}
                      type="button"
                      disabled={isOpening}
                    >
                      {isOpening ? "Opening..." : "Open Workspace"}
                    </button>
                    <p className="mt-3 text-xs text-[#9399b2]">
                      Canceling keeps this empty state visible so you can retry.
                    </p>
                  </div>
                )}
                {workspacePath && !activeFilePath && (
                  <div className="max-w-xl rounded border border-[#45475a] bg-[#11111b] p-6">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#a6adc8]">
                      Workspace Loaded
                    </p>
                    <p className="mt-3 text-sm text-[#cdd6f4]">
                      Select a file from the source tree to view its contents.
                    </p>
                  </div>
                )}
                {workspacePath && activeFilePath && (
                  <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
                    <div className="flex items-center justify-between text-xs text-[#9399b2]">
                      <span className="uppercase tracking-[0.16em]">Active File</span>
                      {isReading && <span>Loading.</span>}
                    </div>
                    {fileError && (
                      <div className="rounded border border-[#f38ba8] bg-[#1a1b26] px-3 py-2 text-xs text-[#f38ba8]">
                        {fileError}
                      </div>
                    )}
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-[#313244] bg-[#11111b]">
                      <div className="border-b border-[#313244] px-3 py-2 text-xs text-[#cdd6f4]">
                        {activeFilePath}
                      </div>
                      <div className="relative flex-1 min-h-0">
                        <HintUnderline hint={effectiveHint} />
                        <ThreadLine 
                          visible={isInlineActionsVisible && hasCounterpart}
                          sourceAnchor={interactionAnchor}
                          targetAnchor={counterpartAnchor}
                        />
                        <TraceBubble
                          visible={isTraceBubbleVisible}
                            confidence={traceBubbleConfidence}
                          label={isBlockedConfirmedVisible ? "Blocked Op" : traceBubbleLabel}
                          blocked={isBlockedConfirmedVisible}
                          reducedMotion={prefersReducedMotion}
                          anchorTop={Math.max(
                            4,
                            (isBlockedConfirmedVisible
                              ? deepTraceScope?.anchorTop ?? 24
                              : interactionAnchor?.top ?? 24) - 28
                          )}
                          anchorLeft={
                            isBlockedConfirmedVisible
                              ? deepTraceScope?.anchorLeft ?? 12
                              : interactionAnchor?.left ?? 12
                          }
                        />
                        <InlineActions
                          visible={isInlineActionsVisible}
                          runtimeAvailability={runtimeAvailability}
                          hasCounterpart={hasCounterpart}
                          anchorTop={interactionAnchor?.top ?? null}
                          anchorLeft={interactionAnchor?.left ?? null}
                          onJump={handleJump}
                          onDeepTrace={handleDeepTrace}
                        />
                        {activeFileContent !== null ? (
                          <CodeEditor
                            value={activeFileContent}
                            selectionContextKey={activeFilePath}
                              hintLine={activeHintLine}
                              counterpartLine={counterpartResolution?.line ?? null}
                            jumpRequest={jumpRequest}
                            onHoverLineChange={setHoveredLine}
                            onSelectionLineChange={setSelectedLine}
                            onModifierClickLine={handleModifierClickLine}
                            onInteractionAnchorChange={setInteractionAnchor}
                            onCounterpartAnchorChange={setCounterpartAnchor}
                            onViewportRangeChange={setVisibleRange}
                            onSave={handleSaveFile}
                            onChange={handleEditorChange}
                            onRequestCompletions={handleRequestCompletions}
                            diagnostics={diagnostics}
                          />
                        ) : (
                          <div className="px-4 py-3">
                            <p className="text-xs text-[#9399b2]">
                              {fileError
                                ? "Unable to display file contents."
                                : "Select a file to preview its contents."}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {isSummaryOpen && (
              <SummaryPeek
                items={summaryItems}
                onJumpToLine={(line) => requestJump(line)}
                onClose={() => setIsSummaryOpen(false)}
              />
            )}
          </div>

          {isBottomPanelOpen && (
            <BottomPanel 
              onClose={() => setIsBottomPanelOpen(false)} 
              output={runOutput}
              isRunning={runStatus === "running"}
              onClear={handleClearOutput}
              onRun={handleRunFile}
            />
          )}
        </div>
      </div>

      <StatusBar
        workspacePath={workspacePath}
        activeFilePath={activeFilePath}
        mode={mode}
        runtimeAvailability={runtimeAvailability}
        saveStatus={saveStatus}
        runStatus={runStatus}
        isSummaryOpen={isSummaryOpen}
        isBottomPanelOpen={isBottomPanelOpen}
        isCommandPaletteOpen={isCommandPaletteOpen}
        onToggleCommandPalette={() =>
          isCommandPaletteOpen ? closeCommandPalette() : openCommandPalette()
        }
        onToggleSummary={() => setIsSummaryOpen((prev) => !prev)}
        onToggleBottomPanel={() => setIsBottomPanelOpen((prev) => !prev)}
      />

      {isCommandPaletteOpen && <CommandPalette onClose={closeCommandPalette} />}
    </div>
  );
}

export default EditorShell;
