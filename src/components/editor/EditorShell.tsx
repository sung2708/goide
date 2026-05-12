import { open } from "@tauri-apps/plugin-dialog";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  runWorkspaceFileWithRace,
  switchWorkspaceBranch,
  getDebuggerState,
  debuggerContinue,
  debuggerPause,
  debuggerStepOver,
  debuggerStepInto,
  debuggerStepOut,
  debuggerToggleBreakpoint,
  startDebugSession,
  stopCurrentRun,
} from "../../lib/ipc/client";
import { ConcurrencyConfidence } from "../../lib/ipc/types";
import type {
  ApiResponse,
  BottomPanelTab,
  DeepTraceConstructKind,
  DebugFailure,
  RuntimeSignal,
  WorkspaceGitBranch,
  DebuggerState,
} from "../../lib/ipc/types";
import HintUnderline from "../overlays/HintUnderline";
import InlineActions from "../overlays/InlineActions";
import ThreadLine from "../overlays/ThreadLine";
import TraceBubble from "../overlays/TraceBubble";
import type { TraceBubbleConfidence } from "../overlays/TraceBubble";
import type { LensConstructKind } from "../../features/concurrency/lensTypes";
import Explorer, { type FileDecoration } from "../sidebar/Explorer";
import ActivityBar, { type ActivityBarTab } from "../sidebar/ActivityBar";
import StatusBar from "../statusbar/StatusBar";
import CodeEditor, { type JumpRequest } from "./CodeEditor";
import DocumentOutline, { type DocumentOutlineItem } from "./DocumentOutline";
import SearchPanel from "../panels/SearchPanel";
import GitPanel from "../panels/GitPanel";
import BranchPicker from "../panels/BranchPicker";
import BranchSwitchDialog from "../panels/BranchSwitchDialog";
import ResizableSplit from "../layout/ResizableSplit";
import { DEFAULT_WORKSPACE_LAYOUT, useWorkspaceLayout } from "../../features/layout/useWorkspaceLayout";
import {
  isGoFile,
  mapGitStatus,
  pathsReferToSameFile,
  runtimeSignalMatchesScope,
  selectActiveBlockedSignal,
} from "./editorShellUtils";
import { useWorkspaceFsSync } from "./useWorkspaceFsSync";
import { useToolchainStatus } from "./useToolchainStatus";
import { useWorkspaceGitState } from "./useWorkspaceGitState";
import { useRuntimeTopology } from "./useRuntimeTopology";
import { useDiagnosticsState } from "./useDiagnosticsState";
import { useCompletionState } from "./useCompletionState";
import { useWorkspaceSearchState } from "./useWorkspaceSearchState";
import { useRunOutputState, type RunMode } from "./useRunOutputState";

const DEBUG_UI_ENABLED = true;
const LazyBottomPanel = lazy(() => import("../panels/BottomPanel"));
const LazyRuntimeTopologyPanel = lazy(() => import("../panels/RuntimeTopologyPanel"));
const LazyDebugFailureDialog = lazy(() => import("../panels/DebugFailureDialog"));

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
const ACTIVE_DEBUG_POLL_INTERVAL_MS = 600;
const DEBUG_POLL_BACKOFF_STEP_MS = 900;
const DEBUG_POLL_MAX_INTERVAL_MS = 5000;
type DebugUiState = "idle" | "starting" | "running" | "paused" | "stopping" | "failed";

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

function nextPollingDelay(failureCount: number): number {
  return Math.min(
    ACTIVE_DEBUG_POLL_INTERVAL_MS + failureCount * DEBUG_POLL_BACKOFF_STEP_MS,
    DEBUG_POLL_MAX_INTERVAL_MS
  );
}

type CounterpartResolution = {
  line: number | null;
  column: number | null;
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

function isHintInDeepTraceScope(
  hint: {
    line: number;
    column: number;
    symbol: string | null;
  } | null,
  scope: {
    line: number;
    column: number;
    symbol: string | null;
  } | null
): boolean {
  if (!hint || !scope) {
    return false;
  }
  return (
    hint.line === scope.line &&
    hint.column === scope.column &&
    hint.symbol === scope.symbol
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

function EditorShell() {
  const runtimeSignalTimeoutMs = resolveRuntimeSignalTimeoutMs();
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [hasLoadedBottomPanel, setHasLoadedBottomPanel] = useState(false);
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>("logs");
  const [mode, setMode] = useState<"quick-insight" | "deep-trace">(
    "quick-insight"
  );
  const previousModeRef = useRef<"quick-insight" | "deep-trace">("quick-insight");
  const [runtimeAvailability, setRuntimeAvailability] = useState<
    "available" | "unavailable" | "degraded"
  >("unavailable");
  const toolchainStatus = useToolchainStatus();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [runMode, setRunMode] = useState<RunMode>("standard");
  const {
    runOutput,
    setRunOutput,
    raceSignals,
    setRaceSignals,
    activeRunIdRef,
    activeRunModeRef,
    activeRunTargetFilePathRef,
    raceRunCaptureRef,
    clearPendingRunOutputBuffer,
  } = useRunOutputState({ setRunStatus });
  const {
    gitSnapshot,
    gitError,
    branchSnapshot,
    setBranchSnapshot,
    refreshBranchSnapshot,
    reloadGitState,
  } = useWorkspaceGitState(workspacePath);
  const [isBranchPickerOpen, setIsBranchPickerOpen] = useState(false);
  const [branchQuery, setBranchQuery] = useState("");
  const [pendingTargetBranch, setPendingTargetBranch] = useState<WorkspaceGitBranch | null>(null);
  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);
  const [branchSwitchLoading, setBranchSwitchLoading] = useState(false);
  const [branchSwitchError, setBranchSwitchError] = useState<string | null>(null);

  useEffect(() => {
    if (isBottomPanelOpen) {
      setHasLoadedBottomPanel(true);
    }
  }, [isBottomPanelOpen]);

  const [debugUiState, setDebugUiState] = useState<DebugUiState>("idle");
  const [debugFailure, setDebugFailure] = useState<DebugFailure | null>(null);
  const [debuggerState, setDebuggerState] = useState<DebuggerState | null>(null);
  const {
    runtimePanelSnapshot,
    setRuntimePanelSnapshot,
    runtimeTopologySnapshot,
    setRuntimeTopologySnapshot,
    runtimeTopologyLoading,
    runtimeTopologyError,
    setRuntimeTopologyError,
  } = useRuntimeTopology({
    runMode,
    runStatus,
    nextPollingDelay,
  });
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<ActivityBarTab>("search");
  const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const {
    searchLoading,
    workspaceSearchResults,
    resetWorkspaceSearch,
    handleWorkspaceSearch,
    replaceMatch: handleReplaceMatch,
    replaceAllMatches: handleReplaceAllMatches,
  } = useWorkspaceSearchState(workspacePath);
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const [explorerRevision, setExplorerRevision] = useState(0);
  const isSavingRef = useRef(false);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedContentRef = useRef<string | null>(null);
  const latestEditorContentRef = useRef<string | null>(null);
  const [visibleRange, setVisibleRange] = useState<VisibleLineRange | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [jumpRequest, setJumpRequest] = useState<JumpRequest | null>(null);
  const [documentSymbols, setDocumentSymbols] = useState<DocumentOutlineItem[]>([]);
  const [isSymbolsPending, setIsSymbolsPending] = useState(false);
  const [cursorOffset, setCursorOffset] = useState<number | null>(null);
  const workspaceLayout = useWorkspaceLayout(workspacePath);
  const [interactionAnchor, setInteractionAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [counterpartAnchor, setCounterpartAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const jumpRequestIdRef = useRef(0);
  const workspacePathRef = useRef(workspacePath);
  workspacePathRef.current = workspacePath;
  const activeFilePathRef = useRef(activeFilePath);
  activeFilePathRef.current = activeFilePath;
  const {
    diagnostics,
    diagnosticsByFile,
    diagnosticsAvailability,
    clearDiagnostics,
    clearActiveDiagnostics,
    invalidateDiagnosticsRequests,
    resetDiagnosticsState,
    refreshDiagnosticsForFile,
    scheduleDiagnosticsRefresh,
  } = useDiagnosticsState({
    workspacePathRef,
    activeFilePathRef,
  });
  const {
    completionAvailability,
    setCompletionAvailability,
    invalidateCompletionRequests,
    resetCompletionAvailability,
    handleRequestCompletions,
  } = useCompletionState({
    workspacePathRef,
    activeFilePathRef,
    activeFileContent,
    latestEditorContentRef,
  });
  const deepTraceRequestIdRef = useRef(0);
  const runtimeCheckRequestIdRef = useRef(0);
  const runtimeSignalRequestIdRef = useRef(0);
  const runtimeSignalInFlightRef = useRef(false);
  const runtimeSignalPendingRequestCountRef = useRef(0);
  const debugStopInFlightRef = useRef(false);
  const autoSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deepTraceScope, setDeepTraceScope] = useState<{
    workspacePath: string;
    filePath: string;
    line: number;
    column: number;
    symbol: string | null;
    scopeKey: string | null;
    anchorTop: number;
    anchorLeft: number;
  } | null>(null);
  const [activeBlockedSignal, setActiveBlockedSignal] = useState<RuntimeSignal | null>(
    null
  );

  useEffect(() => {
    setJumpRequest(null);
    setDocumentSymbols([]);
    setIsSymbolsPending(activeFilePath !== null && activeFilePath !== undefined && activeFilePath.endsWith(".go"));
    setCursorOffset(null);
  }, [workspacePath, activeFilePath]);

  const activeDocumentSymbol = useMemo(() => {
    if (cursorOffset === null) {
      return null;
    }

    return (
      documentSymbols
        .filter((symbol) => symbol.from <= cursorOffset && symbol.to >= cursorOffset)
        .sort((a, b) => {
          const aSize = a.to - a.from;
          const bSize = b.to - b.from;
          return aSize - bSize || a.from - b.from;
        })[0] ?? null
    );
  }, [cursorOffset, documentSymbols]);

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

  // Clear editor timers on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current !== null) {
        clearTimeout(saveStatusTimerRef.current);
      }
      if (autoSaveDebounceRef.current !== null) {
        clearTimeout(autoSaveDebounceRef.current);
      }
    };
  }, []);

  // Global keyboard shortcut: Ctrl+Shift+F (or Cmd+Shift+F on Mac) opens search
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.startsWith("Mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setActiveTab("search");
        setSearchFocusTrigger((n) => n + 1);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  const { detectedConstructs, counterpartMappings } = useLensSignals({
    workspacePath,
    activeFilePath,
    workspacePathRef,
    analysisRevision,
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
  const interactionLine = hoveredLine ?? selectedLine;

  const traceBubbleLabel = activeHint?.kind
    ? (KIND_LABELS[activeHint.kind] ?? activeHint.kind)
    : "";
  const markRuntimeDegraded = useCallback(() => {
    setRuntimeAvailability((current) =>
      current === "degraded" ? current : "degraded"
    );
    setActiveBlockedSignal(null);
  }, []);

  const markRuntimeAvailable = useCallback(() => {
    setRuntimeAvailability((current) =>
      current === "available" ? current : "available"
    );
  }, []);

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
              column: candidates[0].counterpartColumn,
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
        line: filtered[0].counterpartLine,
        column: filtered[0].counterpartColumn,
        confidence,
        source: "static" as const,
      };
    },
    [counterpartMappings]
  );

  const resolveRuntimeCounterpart = useCallback((): CounterpartResolution | null => {
    if (
      !activeBlockedSignal ||
      activeBlockedSignal.correlationId === null ||
      activeFilePath === null
    ) {
      return null;
    }
    const counterpartPath = activeBlockedSignal.counterpartRelativePath ?? null;
    const isSameFile =
      counterpartPath === null ||
      pathsReferToSameFile(counterpartPath, activeFilePath);
    const counterpartLine = activeBlockedSignal.counterpartLine ?? null;
    const isValidLine =
      isSameFile &&
      Number.isInteger(counterpartLine) &&
      counterpartLine !== null &&
      counterpartLine >= 1;

    return {
      line: isValidLine ? counterpartLine : null,
      column: activeBlockedSignal.counterpartColumn ?? null,
      confidence:
        (activeBlockedSignal.counterpartConfidence ?? "likely") as ConcurrencyConfidence,
      source: "runtime",
    };
  }, [activeBlockedSignal, activeFilePath]);

  const resolveCounterpartFromActiveHint = useCallback(() => {
    if (activeHintLine === null || activeHint?.kind !== "channel") {
      return null;
    }

    const isActiveHintTraced = isHintInDeepTraceScope(
      {
        line: activeHintLine,
        column: activeHint.column,
        symbol: activeHint.symbol ?? null,
      },
      deepTraceScope
        ? {
            line: deepTraceScope.line,
            column: deepTraceScope.column,
            symbol: deepTraceScope.symbol,
          }
        : null
    );

    const runtimeResolution =
      mode === "deep-trace" && deepTraceScope && isActiveHintTraced
        ? resolveRuntimeCounterpart()
        : null;
    const staticResolution = resolveStaticCounterpart(activeHintLine, activeHint.symbol);

    if (runtimeResolution) {
      if (runtimeResolution.line !== null) {
        return runtimeResolution;
      }
      if (staticResolution) {
        return staticResolution;
      }
      return runtimeResolution;
    }
    return staticResolution;
  }, [
    activeHint,
    activeHintLine,
    mode,
    deepTraceScope,
    resolveRuntimeCounterpart,
    resolveStaticCounterpart,
  ]);

  const handleWorkspaceFsChanged = useCallback(() => {
    setExplorerRevision((prev) => prev + 1);
  }, []);

  useWorkspaceFsSync({
    workspacePath,
    workspacePathRef,
    onWorkspaceChanged: handleWorkspaceFsChanged,
  });

  const fileDecorations = useMemo(() => {
    const decorations = new Map<string, FileDecoration>();
    if (gitSnapshot) {
      for (const file of gitSnapshot.changedFiles) {
        const status = mapGitStatus(file.status);
        decorations.set(file.path, { gitStatus: status });
      }
    }
    for (const [path, summary] of Object.entries(diagnosticsByFile)) {
      if (!summary.hasErrors && !summary.hasWarnings) {
        continue;
      }
      const existing = decorations.get(path) || {};
      decorations.set(path, {
        ...existing,
        hasErrors: summary.hasErrors,
        hasWarnings: !summary.hasErrors && summary.hasWarnings,
      });
    }
    return decorations;
  }, [gitSnapshot, diagnosticsByFile]);

  const hasCounterpart = useMemo(() => {
    const resolution = resolveCounterpartFromActiveHint();
    return resolution !== null && resolution.line !== null;
  }, [resolveCounterpartFromActiveHint]);

  const counterpartResolution = resolveCounterpartFromActiveHint();
  const activeRaceSignal = useMemo(() => {
    if (!activeFilePath) {
      return null;
    }
    const activeFileRaceSignals = raceSignals.filter((signal) =>
      pathsReferToSameFile(signal.relativePath, activeFilePath)
    );
    if (activeFileRaceSignals.length === 0) {
      return null;
    }
    if (interactionLine === null) {
      return activeFileRaceSignals[0] ?? null;
    }
    return (
      activeFileRaceSignals.find((signal) => signal.line === interactionLine) ??
      null
    );
  }, [activeFilePath, interactionLine, raceSignals]);
  const isActiveHintRuntimeConfirmed =
    activeRaceSignal !== null ||
    (mode === "deep-trace" &&
      deepTraceScope !== null &&
      activeHint !== null &&
      activeHintLine !== null &&
      isHintInDeepTraceScope(
        {
          line: activeHintLine,
          column: activeHint.column,
          symbol: activeHint.symbol ?? null,
        },
        {
          line: deepTraceScope.line,
          column: deepTraceScope.column,
          symbol: deepTraceScope.symbol,
        }
      ));
  const isBlockedConfirmedVisible =
    mode === "deep-trace" && activeBlockedSignal !== null;
  const isRaceConfirmedVisible = activeRaceSignal !== null;
  const isTraceBubbleVisible =
    isInlineActionsVisible || isBlockedConfirmedVisible || isRaceConfirmedVisible;
  const effectiveHint =
    isActiveHintRuntimeConfirmed && activeHint
      ? { ...activeHint, confidence: "confirmed" as ConcurrencyConfidence }
      : activeHint;
  const traceBubbleConfidence = isActiveHintRuntimeConfirmed
    ? "confirmed" as const
    : toTraceBubbleConfidence(counterpartResolution?.confidence ?? effectiveHint?.confidence);


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

  const navigateDocumentSymbol = useCallback(
    (direction: "next" | "previous") => {
      if (documentSymbols.length === 0) {
        return;
      }

      const activeIndex =
        activeDocumentSymbol === null
          ? -1
          : documentSymbols.findIndex((symbol) => symbol.from === activeDocumentSymbol.from);

      const targetIndex =
        direction === "next"
          ? activeIndex >= 0
            ? (activeIndex + 1) % documentSymbols.length
            : 0
          : activeIndex >= 0
            ? (activeIndex - 1 + documentSymbols.length) % documentSymbols.length
            : documentSymbols.length - 1;

      requestJump(documentSymbols[targetIndex]?.line ?? null);
    },
    [activeDocumentSymbol, documentSymbols, requestJump]
  );

  const handleDeepTrace = useCallback(async () => {
    if (runtimeAvailability === "unavailable") {
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
        counterpartColumn: staticCounterpart?.column ?? null,
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
        markRuntimeAvailable();
        setDeepTraceScope({
          workspacePath: requestWorkspacePath,
          filePath: requestFilePath,
          line,
          column,
          symbol: activeHint.symbol ?? null,
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

    markRuntimeDegraded();
    setMode("quick-insight");
    setDeepTraceScope(null);
    setActiveBlockedSignal(null);
  }, [
    activeFilePath,
    activeHint,
    activeHintLine,
    markRuntimeAvailable,
    markRuntimeDegraded,
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
    let failureCount = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const scheduleNextPoll = () => {
      if (cancelled) {
        return;
      }
      timeoutId = setTimeout(() => {
        void pollRuntimeSignals();
      }, nextPollingDelay(failureCount));
    };

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

        if (!response.ok || !response.data) {
          failureCount += 1;
          markRuntimeDegraded();
          return;
        }

        failureCount = 0;
        markRuntimeAvailable();
        const blockedCandidates =
          response.data.filter(
            (signal) =>
              isBlockedWaitReason(signal.waitReason) &&
              runtimeSignalMatchesScope(signal, scopeSnapshot)
          );
        const prioritizedCandidate = selectActiveBlockedSignal(
          blockedCandidates,
          scopeSnapshot.filePath
        );
        setActiveBlockedSignal(prioritizedCandidate);
      } catch (_error) {
        if (
          !cancelled &&
          requestId === runtimeSignalRequestIdRef.current &&
          workspacePathRef.current === scopeSnapshot.workspacePath &&
          activeFilePathRef.current === scopeSnapshot.filePath
        ) {
          failureCount += 1;
          markRuntimeDegraded();
        }
      } finally {
        releaseInFlight();
        if (!cancelled) {
          scheduleNextPoll();
        }
      }
    };

    void pollRuntimeSignals();

    return () => {
      cancelled = true;
      runtimeSignalInFlightRef.current = false;
      runtimeSignalPendingRequestCountRef.current = 0;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    activeFilePath,
    deepTraceScope,
    markRuntimeAvailable,
    markRuntimeDegraded,
    mode,
    runtimeSignalTimeoutMs,
    workspacePath,
  ]);

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
          if (!hasNewerEdits) {
            setActiveFileContent(content);
          }
          setIsDirty(hasNewerEdits);
          if (hasNewerEdits) {
            setSaveStatus("idle");
          } else {
            setSaveStatus("saved");
            saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
          }
          await refreshDiagnosticsForFile(saveWorkspacePath, saveFilePath);
          setAnalysisRevision((current) => current + 1);
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
    [workspacePath, activeFilePath, refreshDiagnosticsForFile]
  );

  const handleSaveFile = useCallback(
    async (content: string) => {
      await persistActiveFileContent(content);
    },
    [persistActiveFileContent]
  );

  const handleRunFile = useCallback(async (modeToRun: RunMode = "standard") => {
    if (debugUiState === "starting") {
      return;
    }
    if (!workspacePath || !activeFilePath) return;
    const isRaceRun = modeToRun === "race";
    const runId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    activeRunIdRef.current = runId;
    activeRunModeRef.current = modeToRun;
    activeRunTargetFilePathRef.current = activeFilePath;
    clearPendingRunOutputBuffer();

    const contentToRun = latestEditorContentRef.current ?? activeFileContent;
    if (isDirty && typeof contentToRun === "string") {
      const didSave = await persistActiveFileContent(contentToRun);
      if (!didSave) {
        if (activeRunIdRef.current !== runId) {
          return;
        }
        setRunStatus("error");
        setRunMode(modeToRun);
        raceRunCaptureRef.current = {
          isRaceRun,
          sawWarning: false,
          matchedLines: new Set<number>(),
        };
        setRaceSignals([]);
        setIsBottomPanelOpen(true);
        setBottomPanelTab("logs");
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
    setRunMode(modeToRun);
    setIsBottomPanelOpen(true);
    setBottomPanelTab("logs");
    raceRunCaptureRef.current = {
      isRaceRun,
      sawWarning: false,
      matchedLines: new Set<number>(),
    };
    setRaceSignals([]);

    try {
      const resp =
        modeToRun === "race"
          ? await runWorkspaceFileWithRace(workspacePath, activeFilePath, runId)
          : await runWorkspaceFile(workspacePath, activeFilePath, runId);
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
  }, [
    workspacePath,
    activeFilePath,
    activeFileContent,
    isDirty,
    persistActiveFileContent,
    debugUiState,
  ]);

  const handleRunFileStandard = useCallback(() => {
    void handleRunFile("standard");
  }, [handleRunFile]);

  const handleStartDebug = useCallback(async () => {
    if (debugStopInFlightRef.current || (runStatus === "running" && runMode !== "debug")) {
      return;
    }
    if (!workspacePath || !activeFilePath || !isGoFile(activeFilePath)) return;
    setDebugUiState("starting");
    setDebugFailure(null);

    let response: Awaited<ReturnType<typeof startDebugSession>>;
    try {
      response = await startDebugSession({
        workspaceRoot: workspacePath,
        relativePath: activeFilePath,
      });
    } catch (error) {
      setDebugUiState("failed");
      setDebugFailure({
        code: "debug_session_start_failed",
        title: "Unable to start debug session",
        message: error instanceof Error ? error.message : "Unknown debug startup failure.",
        details: null,
      });
      return;
    }

    if (!response.ok) {
      setDebugUiState("failed");
      setDebugFailure({
        code: response.error?.code ?? "debug_session_start_failed",
        title: "Unable to start debug session",
        message: response.error?.message ?? "Unknown debug startup failure.",
        details: null,
      });
      return;
    }

    setDebugUiState("running");

    if (DEBUG_UI_ENABLED) {
      setRunStatus("running");
      setRunMode("debug");
      setIsBottomPanelOpen(true);
      clearPendingRunOutputBuffer();
      setRunOutput([]);
      activeRunIdRef.current = "debug-" + Date.now();
    }
  }, [workspacePath, activeFilePath, runStatus, runMode]);

  const handleStopDebug = useCallback(async () => {
    if (debugStopInFlightRef.current) {
      return;
    }
    debugStopInFlightRef.current = true;
    setDebugUiState("stopping");
    try {
      const deactivateResponse = await deactivateDeepTrace();
      if (!deactivateResponse.ok) {
        throw new Error(deactivateResponse.error?.message ?? "Failed to stop debug session.");
      }
      setDebugUiState("idle");
      setRunStatus("done");
      setRunMode("standard");
      setDebuggerState(null);
      setRuntimePanelSnapshot(null);
      setRuntimeTopologySnapshot(null);
      setRuntimeTopologyError(null);
      setActiveBlockedSignal(null);
      setDeepTraceScope(null);
    } catch (_error) {
      setDebugUiState(debuggerState?.paused ? "paused" : "running");
    } finally {
      debugStopInFlightRef.current = false;
    }
  }, [debuggerState?.paused]);

  useEffect(() => {
    let cancelled = false;
    let failureCount = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (runStatus === "running" && runMode === "debug") {
      const scheduleNextPoll = () => {
        if (cancelled) {
          return;
        }
        timeoutId = setTimeout(() => {
          void pollDebuggerState();
        }, nextPollingDelay(failureCount));
      };
      const pollDebuggerState = async () => {
        try {
          const state = await getDebuggerState();
          if (cancelled) {
            return;
          }
          if (state.ok && state.data) {
            failureCount = 0;
            setDebuggerState(state.data);
            setBreakpoints(
              activeFilePath
                ? state.data.breakpoints
                    .filter((breakpoint) => breakpoint.relativePath === activeFilePath)
                    .map((breakpoint) => breakpoint.line)
                : [],
            );
          } else {
            failureCount += 1;
          }
        } catch (_error) {
          if (!cancelled) {
            failureCount += 1;
          }
        } finally {
          scheduleNextPoll();
        }
      };
      void pollDebuggerState();
    } else {
      setDebuggerState(null);
    }
    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [activeFilePath, runStatus, runMode]);

  useEffect(() => {
    if (runMode !== "debug" || runStatus !== "running") {
      return;
    }
    if (debuggerState && !debuggerState.sessionActive) {
      setRunStatus("done");
      setRunMode("standard");
      setRuntimePanelSnapshot(null);
      setRuntimeTopologySnapshot(null);
      setRuntimeTopologyError(null);
    }
  }, [debuggerState, runMode, runStatus]);

  useEffect(() => {
    if (!DEBUG_UI_ENABLED) {
      return;
    }
    if (debugUiState === "starting" || debugUiState === "failed" || debugUiState === "stopping") {
      return;
    }
    if (runMode !== "debug" || runStatus !== "running") {
      if (debugUiState !== "idle") {
        setDebugUiState("idle");
      }
      return;
    }

    const nextState: DebugUiState = debuggerState?.paused ? "paused" : "running";
    if (debugUiState !== nextState) {
      setDebugUiState(nextState);
    }
  }, [debugUiState, debuggerState?.paused, runMode, runStatus]);

  useEffect(() => {
    if (!workspacePath || !activeFilePath) {
      setBreakpoints([]);
      return;
    }

    let isCancelled = false;
    void getDebuggerState().then((state) => {
      if (isCancelled || !state.ok || !state.data) {
        return;
      }
      setDebuggerState((current) => current ?? state.data ?? null);
      setBreakpoints(
        state.data.breakpoints
          .filter((breakpoint) => breakpoint.relativePath === activeFilePath)
          .map((breakpoint) => breakpoint.line),
      );
    });

    return () => {
      isCancelled = true;
    };
  }, [activeFilePath, workspacePath]);

  const handleToggleBreakpoint = useCallback(async (line: number) => {
    if (!workspacePath || !activeFilePath) return;
    try {
      const resp = await debuggerToggleBreakpoint({
        relativePath: activeFilePath,
        line,
      });
      if (resp.ok && resp.data) {
        setDebuggerState(resp.data);
        setBreakpoints(
          resp.data.breakpoints
            .filter((breakpoint) => breakpoint.relativePath === activeFilePath)
            .map((breakpoint) => breakpoint.line),
        );
      }
    } catch (err) {
      console.error("Failed to toggle breakpoint:", err);
    }
  }, [workspacePath, activeFilePath, runStatus, runMode]);

  const isDebugSessionRunning = debugUiState === "running" || debugUiState === "paused";
  const isDebugPaused = debugUiState === "paused";
  const isDebugSessionBusy =
    isDebugSessionRunning || debugUiState === "starting" || debugUiState === "stopping";

  const showDebugTab =
    isDebugSessionRunning ||
    Boolean(workspacePath && activeFilePath && activeFilePath.toLowerCase().endsWith(".go"));

  const handleToggleDebugPause = useCallback(() => {
    if (isDebugPaused) {
      setDebugUiState("running");
      void debuggerContinue();
      return;
    }
    setDebugUiState("paused");
    void debuggerPause();
  }, [isDebugPaused]);

  // Fall back to explorer when the debug tab becomes unavailable while active.
  useEffect(() => {
    if (activeTab === "debug" && !showDebugTab) {
      setActiveTab("explorer");
    }
  }, [activeTab, showDebugTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const canStartDebug =
        DEBUG_UI_ENABLED &&
        !isDebugSessionBusy &&
        !debugStopInFlightRef.current &&
        runStatus !== "running" &&
        Boolean(workspacePath && isGoFile(activeFilePath));

      if (e.key === "F9" && activeFilePath && selectedLine) {
        e.preventDefault();
        void handleToggleBreakpoint(selectedLine);
        return;
      }

      if (e.key === "F5" && !e.shiftKey) {
        e.preventDefault();
        if (!isDebugSessionRunning) {
          if (canStartDebug) {
            void handleStartDebug();
          }
          return;
        }
        handleToggleDebugPause();
        return;
      }

      if (e.key === "F5" && e.shiftKey) {
        e.preventDefault();
        if (isDebugSessionRunning) {
          void handleStopDebug();
        }
        return;
      }

      if (e.key === "F8" && !e.shiftKey) {
        e.preventDefault();
        navigateDocumentSymbol("next");
        return;
      }

      if (e.key === "F8" && e.shiftKey) {
        e.preventDefault();
        navigateDocumentSymbol("previous");
        return;
      }


      if (!isDebugSessionRunning || !isDebugPaused) {
        return;
      }

      if (e.key === "F10") {
        e.preventDefault();
        void debuggerStepOver();
        return;
      }

      if (e.key === "F11" && !e.shiftKey) {
        e.preventDefault();
        void debuggerStepInto();
        return;
      }

      if (e.key === "F11" && e.shiftKey) {
        e.preventDefault();
        void debuggerStepOut();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeFilePath,
    handleToggleBreakpoint,
    handleToggleDebugPause,
    handleStartDebug,
    handleStopDebug,
    isDebugSessionBusy,
    isDebugPaused,
    isDebugSessionRunning,
    navigateDocumentSymbol,
    runStatus,
    selectedLine,
    workspacePath,
  ]);

  const handleRunFileWithRace = useCallback(() => {
    if (runtimeAvailability === "unavailable") {
      return;
    }
    void handleRunFile("race");
  }, [handleRunFile, runtimeAvailability]);

  const handleClearOutput = useCallback(() => {
    clearPendingRunOutputBuffer();
    setRunOutput([]);
    setBottomPanelTab("logs");
  }, [clearPendingRunOutputBuffer]);

  const handleStopRun = useCallback(() => {
    // Clear the active run ID immediately so trailing exit events from the
    // stopped run cannot attach to the next run.
    activeRunIdRef.current = null;
    clearPendingRunOutputBuffer();
    void stopCurrentRun();
    setRunStatus((current) => (current === "running" ? "done" : current));
  }, [clearPendingRunOutputBuffer]);

  const handleEditorChange = useCallback((value: string) => {
    latestEditorContentRef.current = value;
    setActiveFileContent(value);
    setIsDirty(value !== savedContentRef.current);
    // Reset transient statuses when the user starts editing again
    setSaveStatus((prev) => (prev === "error" || prev === "saved" ? "idle" : prev));
    setCompletionAvailability((prev) => (prev === "degraded" ? "idle" : prev));

    scheduleDiagnosticsRefresh(workspacePath, activeFilePath);

    if (autoSaveDebounceRef.current) {
      clearTimeout(autoSaveDebounceRef.current);
    }
    autoSaveDebounceRef.current = setTimeout(() => {
      if (workspacePathRef.current && activeFilePathRef.current) {
        void persistActiveFileContent(value);
      }
    }, 5000);
  }, [persistActiveFileContent, scheduleDiagnosticsRefresh]);

  const handleModifierClickLine = useCallback(
    (line: number): boolean => {
      if (activeHintLine !== line || activeHint?.kind !== "channel") {
        return false;
      }

      const runtimeResolution =
        mode === "deep-trace" &&
        deepTraceScope &&
        isHintInDeepTraceScope(
          {
            line,
            column: activeHint.column,
            symbol: activeHint.symbol ?? null,
          },
          {
            line: deepTraceScope.line,
            column: deepTraceScope.column,
            symbol: deepTraceScope.symbol,
          }
        )
          ? resolveRuntimeCounterpart()
          : null;
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
      deepTraceScope,
      requestJump,
      resolveRuntimeCounterpart,
      resolveStaticCounterpart,
    ]
  );


  const handleTerminalPaneResize = useCallback(
    (size: number) => {
      workspaceLayout.setTerminalSize(size);
    },
    [workspaceLayout]
  );

  const handleLeftPaneResize = useCallback(
    (size: number) => {
      workspaceLayout.setSplitSizes({
        ...workspaceLayout.splitSizes,
        left: size,
      });
    },
    [workspaceLayout]
  );

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
        setRaceSignals([]);
        setWorkspacePath(resolvedPath);
        setActiveFilePath(null);
        setActiveFileContent(null);
        resetWorkspaceSearch();
        resetDiagnosticsState();
        invalidateCompletionRequests();
        resetCompletionAvailability();
        setSelectedLine(null);
        setInteractionAnchor(null);
        setFileError(null);
      }
    } catch (error) {
      console.error("Failed to open workspace dialog:", error);
    } finally {
      setIsOpening(false);
    }
  }, [isOpening, resetDiagnosticsState, resetWorkspaceSearch]);

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
      invalidateDiagnosticsRequests();
      invalidateCompletionRequests();
      clearActiveDiagnostics();
      resetCompletionAvailability();

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
        void refreshDiagnosticsForFile(startingPath, relativePath);
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
          clearActiveDiagnostics();
          resetCompletionAvailability();
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
    [clearActiveDiagnostics, invalidateDiagnosticsRequests, isReading, refreshDiagnosticsForFile, workspacePath]
  );

  const reloadWorkspaceState = useCallback(async () => {
    if (!workspacePathRef.current) return;

    await reloadGitState(workspacePathRef.current);

    clearDiagnostics();
    setDebuggerState(null);
    clearPendingRunOutputBuffer();
    setRunOutput([]);
    resetWorkspaceSearch();

    // Explicitly refresh the Explorer tree so branch-switched file layout is reflected.
    setExplorerRevision((prev) => prev + 1);

    if (activeFilePathRef.current) {
      await handleOpenFile(activeFilePathRef.current);
    }
  }, [clearDiagnostics, handleOpenFile, reloadGitState, resetWorkspaceSearch]);

  const handleBranchSelect = useCallback(async (branch: WorkspaceGitBranch) => {
    if (!workspacePathRef.current || !branchSnapshot) return;
    if (branch.name === branchSnapshot.currentBranch) {
      setIsBranchPickerOpen(false);
      setBranchQuery("");
      return;
    }

    const latestBranchSnapshot = await refreshBranchSnapshot(workspacePathRef.current);

    setIsBranchPickerOpen(false);
    setBranchQuery("");

    if (!latestBranchSnapshot) {
      setBranchSnapshot(null);
      setBranchSwitchError("Branch data unavailable");
      return;
    }

    setBranchSnapshot(latestBranchSnapshot);

    if (branch.name === latestBranchSnapshot.currentBranch) {
      return;
    }
    if (latestBranchSnapshot.hasUncommittedChanges) {
      setPendingTargetBranch(branch);
      setIsBranchDialogOpen(true);
    } else {
      setPendingTargetBranch(branch);
      setBranchSwitchError(null);
      setBranchSwitchLoading(true);
      void switchWorkspaceBranch({
        workspaceRoot: workspacePathRef.current,
        targetBranch: branch.name,
        remoteRef: branch.remoteRef ?? null,
        preSwitchAction: "none",
      }).then((res) => {
        setBranchSwitchLoading(false);
        if (res.ok && res.data) {
          setBranchSnapshot(res.data);
          setPendingTargetBranch(null);
          void reloadWorkspaceState();
        } else {
          setBranchSwitchError(res.error?.message ?? "Branch switch failed");
        }
      });
    }
  }, [branchSnapshot, refreshBranchSnapshot, reloadWorkspaceState]);

  const handleBranchSwitchConfirm = useCallback(
    (payload: { action: "commit" | "stash" | "discard"; commitMessage?: string }) => {
      if (!pendingTargetBranch || !workspacePathRef.current) return;
      setIsBranchDialogOpen(false);
      setBranchSwitchError(null);
      setBranchSwitchLoading(true);
      void switchWorkspaceBranch({
        workspaceRoot: workspacePathRef.current,
        targetBranch: pendingTargetBranch.name,
        remoteRef: pendingTargetBranch.remoteRef ?? null,
        preSwitchAction: payload.action,
        commitMessage: payload.commitMessage ?? null,
      }).then((res) => {
        setBranchSwitchLoading(false);
        if (res.ok && res.data) {
          setBranchSnapshot(res.data);
          setPendingTargetBranch(null);
          void reloadWorkspaceState();
        } else {
          setBranchSwitchError(res.error?.message ?? "Branch switch failed");
        }
      });
    },
    [pendingTargetBranch, reloadWorkspaceState]
  );

  const editorTitle = useMemo(() => {
    if (!activeFilePath) {
      return "Editor";
    }

    const segments = activeFilePath.split(/[\\/]/);
    const baseName = segments[segments.length - 1] ?? activeFilePath;
    return `${baseName}${isDirty ? " *" : ""}`;
  }, [activeFilePath, isDirty]);

  /**
   * Stable session key for the workspace-owned interactive shell.
   *
   * WORKSPACE-OWNED SHELL IDENTITY:
   * One shell session is kept alive for the entire workspace, independent of
   * which file is currently active in the editor.  The key is fixed to
   * `workspace-shell` (when a workspace is open), so switching files does not
   * change the surfaceKey and therefore does not remount or reset the shell
   * panel.  Backend disposal is triggered only at the workspace lifecycle
   * level (when the workspace changes or is closed).
   */
  const surfaceKey = workspacePath ? "workspace-shell" : null;

  return (
    <div
      className="relative flex h-full w-full flex-col bg-[var(--base)] text-[var(--text)]"
    >
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <ActivityBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          signalCount={raceSignals.length}
          showDebugTab={showDebugTab}
        />
        <ResizableSplit
          orientation="horizontal"
          className="flex-1"
          size={workspaceLayout.splitSizes.left}
          defaultSize={DEFAULT_WORKSPACE_LAYOUT.splitSizes.left}
          minSize={180}
          maxSize={420}
          onResize={handleLeftPaneResize}
          primary={
            <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-[var(--border-muted)] bg-[var(--mantle)]">
              {activeTab === "explorer" && (
                <Explorer
                  workspacePath={workspacePath}
                  activeFilePath={activeFilePath}
                  onOpenFile={handleOpenFile}
                  fileDecorations={fileDecorations}
                  explorerRevision={explorerRevision}
                />
              )}
              {activeTab === "search" && (
                <SearchPanel
                  results={workspaceSearchResults}
                  loading={searchLoading}
                  onSearch={handleWorkspaceSearch}
                  onOpenResult={(file, line) => {
                    void handleOpenFile(file).then(() => {
                      requestJump(line);
                    });
                  }}
                  autoFocus
                  focusTrigger={searchFocusTrigger}
                  onReplaceMatch={(file, line, searchText, replacement) =>
                    void handleReplaceMatch(file, line, searchText, replacement)
                  }
                  onReplaceAll={(searchText, replacement) =>
                    void handleReplaceAllMatches(searchText, replacement)
                  }
                />
              )}
              {activeTab === "git" && (
                <GitPanel
                  loading={!gitSnapshot && Boolean(workspacePath)}
                  snapshot={gitSnapshot}
                  branchSnapshot={branchSnapshot}
                  error={gitError}
                  onOpenBranchPicker={() => setIsBranchPickerOpen(true)}
                />
              )}
              {activeTab === "concurrency" && (
                <Suspense fallback={<div className="h-full min-h-0 min-w-0" />}>
                  <LazyRuntimeTopologyPanel
                    loading={runtimeTopologyLoading}
                    runMode={runMode}
                    runStatus={runStatus}
                    isDebugSessionRunning={isDebugSessionRunning}
                    isDebugPaused={isDebugPaused}
                    debuggerState={debuggerState}
                    panelSnapshot={runtimePanelSnapshot}
                    topologySnapshot={runtimeTopologySnapshot}
                    error={runtimeTopologyError}
                  />
                </Suspense>
              )}
              {DEBUG_UI_ENABLED && activeTab === "debug" && (
                <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase text-[var(--overlay1)]">Runtime Session</h3>
                <p className="text-[11px] text-[var(--subtext0)]">
                  {debugUiState === "stopping"
                    ? "Stopping"
                    : isDebugSessionRunning
                    ? isDebugPaused
                      ? "Paused"
                      : "Running"
                    : "Idle"}
                </p>
                {debuggerState?.activeRelativePath && debuggerState.activeLine && (
                  <p className="text-[11px] tabular-nums text-[var(--subtext1)]">
                    {debuggerState.activeRelativePath}:{debuggerState.activeLine}
                    {debuggerState.activeColumn ? `:${debuggerState.activeColumn}` : ""}
                  </p>
                )}
              </div>

              {!isDebugSessionBusy && (
                <button
                  type="button"
                  aria-label="Start debug session"
                  className={`rounded-md border px-3 py-2 text-[11px] font-semibold ${
                    runStatus === "running" || isDebugSessionBusy
                      ? "cursor-not-allowed border-[var(--border-subtle)] text-[var(--overlay2)]"
                      : "border-[rgba(235,160,172,0.3)] text-[var(--maroon)] hover:bg-[rgba(235,160,172,0.1)]"
                  }`}
                  onClick={handleStartDebug}
                  disabled={runStatus === "running" || isDebugSessionBusy}
                >
                  Start Debug Session
                </button>
              )}

              {isDebugSessionRunning && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-label={isDebugPaused ? "Continue debugging" : "Pause debugging"}
                      className="rounded-md border border-[rgba(140,170,238,0.3)] px-3 py-2 text-[11px] font-semibold text-[var(--blue)] hover:bg-[rgba(140,170,238,0.12)]"
                      onClick={handleToggleDebugPause}
                    >
                      {isDebugPaused ? "Continue" : "Pause"}
                    </button>
                    <button
                      type="button"
                      aria-label="Stop debugging"
                      className="rounded-md border border-[rgba(231,130,132,0.3)] px-3 py-2 text-[11px] font-semibold text-[var(--red)] hover:bg-[rgba(231,130,132,0.12)]"
                      onClick={() => void handleStopDebug()}
                    >
                      Stop
                    </button>
                  </div>

                  {isDebugPaused && (
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        aria-label="Step over"
                        className="rounded-md border border-[rgba(129,200,190,0.3)] px-3 py-2 text-[11px] font-semibold text-[var(--teal)] hover:bg-[rgba(129,200,190,0.12)]"
                        onClick={() => void debuggerStepOver()}
                      >
                        Over
                      </button>
                      <button
                        type="button"
                        aria-label="Step into"
                        className="rounded-md border border-[rgba(229,200,144,0.3)] px-3 py-2 text-[11px] font-semibold text-[var(--yellow)] hover:bg-[rgba(229,200,144,0.12)]"
                        onClick={() => void debuggerStepInto()}
                      >
                        Into
                      </button>
                      <button
                        type="button"
                        aria-label="Step out"
                        className="rounded-md border border-[rgba(239,159,118,0.3)] px-3 py-2 text-[11px] font-semibold text-[var(--peach)] hover:bg-[rgba(239,159,118,0.12)]"
                        onClick={() => void debuggerStepOut()}
                      >
                        Out
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-md border border-[var(--border-subtle)] px-3 py-2 text-[11px] text-[var(--subtext0)]">
                {isDebugSessionRunning
                  ? isDebugPaused
                    ? "Step controls are active while the program is paused."
                    : "Pause or hit a breakpoint to inspect state."
                  : "Open a Go file, place breakpoints, then start a debug session."}
              </div>
                </div>
              )}
            </aside>
          }
          secondary={
            <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
          <ResizableSplit
            orientation="vertical"
            className="h-full flex-1 flex-col-reverse"
            size={isBottomPanelOpen ? workspaceLayout.terminalSize : 0}
            resizeAnchor="end"
            defaultSize={DEFAULT_WORKSPACE_LAYOUT.splitSizes.terminalBottom}
            minSize={isBottomPanelOpen ? 240 : 0}
            maxSize={520}
            collapsed={!isBottomPanelOpen}
            onResize={handleTerminalPaneResize}
            primary={
              <div
                hidden={!isBottomPanelOpen}
                className="h-full min-h-0 min-w-0"
              >
                {hasLoadedBottomPanel ? (
                  <Suspense fallback={<div className="h-full min-h-0 min-w-0" />}>
                    <LazyBottomPanel
                      activeTab={bottomPanelTab}
                      onActiveTabChange={setBottomPanelTab}
                      logEntries={runOutput}
                      surfaceKey={surfaceKey}
                      workspacePath={workspacePath}
                      onClose={() => setIsBottomPanelOpen(false)}
                      isRunning={runStatus === "running"}
                      onClear={handleClearOutput}
                      onRun={handleRunFileStandard}
                      onRunWithRace={handleRunFileWithRace}
                      onStop={handleStopRun}
                      canRunWithRace={runtimeAvailability !== "unavailable"}
                    />
                  </Suspense>
                ) : null}
              </div>
            }
            secondary={
              <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
            <section
              data-testid="editor-workbench"
              className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--crust)] shadow-lg"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(113,125,144,0.2)] bg-[var(--base)] px-3 py-2 md:px-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase text-[var(--overlay1)] text-balance">Editor</span>
                  <span className="text-[var(--overlay0)] opacity-50">/</span>
                  <span className="text-[12px] font-medium text-[var(--subtext1)]">{editorTitle}</span>
                </div>
                
                <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-x-auto pb-0.5 md:gap-2">
                  <button
                    className={`flex cursor-pointer items-center gap-2 rounded border border-[rgba(113,125,144,0.3)] bg-[rgba(42,48,61,0.4)] px-3 py-1.5 text-[11px] font-semibold text-[var(--subtext1)] transition-colors duration-150 ease-out hover:bg-[rgba(126,162,220,0.12)] ${
                      isOpening ? "cursor-not-allowed opacity-60" : ""
                    }`}
                    onClick={handleOpenWorkspace}
                    type="button"
                    aria-label="Open workspace folder"
                    title="Choose a Go workspace folder."
                    disabled={isOpening}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    {isOpening ? "Opening..." : "Open"}
                  </button>

                  {activeFilePath && (
                    <button
                      className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 ease-out ${
                        runStatus === "running" || debugUiState === "starting"
                          ? "border-[rgba(113,125,144,0.25)] bg-[rgba(42,48,61,0.35)] text-[var(--overlay2)] cursor-not-allowed"
                          : "border-[rgba(127,176,142,0.35)] bg-[rgba(127,176,142,0.14)] text-[var(--green)] hover:bg-[rgba(127,176,142,0.22)]"
                      }`}
                      onClick={handleRunFileStandard}
                      type="button"
                      aria-label="Run active Go file"
                      title="Run the active Go file and show output in the terminal panel."
                      disabled={runStatus === "running" || debugUiState === "starting"}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      {runStatus === "running" ? "Running..." : "Run"}
                    </button>
                  )}
                  {isGoFile(activeFilePath) && runMode !== "debug" && (
                    <button
                      className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 ease-out ${
                        runStatus === "running" ||
                        debugUiState === "starting" ||
                        runtimeAvailability === "unavailable"
                          ? "border-[rgba(113,125,144,0.25)] text-[var(--overlay2)] cursor-not-allowed"
                          : "border-[rgba(126,162,220,0.4)] text-[var(--blue)] hover:bg-[rgba(126,162,220,0.12)]"
                      }`}
                      onClick={handleRunFileWithRace}
                      type="button"
                      aria-label="Run active Go file with race detector"
                      title="Run the active Go file with the Go race detector and surface confirmed race findings."
                      disabled={
                        runStatus === "running" ||
                        debugUiState === "starting" ||
                        runtimeAvailability === "unavailable"
                      }
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>
                      {runStatus === "running" && runMode === "race" ? "Race..." : "Run Race"}
                    </button>
                  )}
                  {isGoFile(activeFilePath) && (
                    <button
                      className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 ease-out ${
                        isDebugSessionBusy || runStatus === "running"
                          ? "border-[rgba(239,159,118,0.25)] text-[var(--overlay2)] cursor-not-allowed"
                          : "border-[rgba(239,159,118,0.4)] text-[var(--peach)] hover:bg-[rgba(239,159,118,0.12)]"
                      }`}
                      onClick={() => void handleStartDebug()}
                      type="button"
                      aria-label="Debug active Go file"
                      title="Start a debug session for the active Go file."
                      disabled={isDebugSessionBusy || runStatus === "running"}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                      {debugUiState === "starting"
                        ? "Starting..."
                        : debugUiState === "stopping"
                        ? "Stopping..."
                        : isDebugSessionRunning
                        ? "Debugging..."
                        : "Debug"}
                    </button>
                  )}
                </div>
              </header>

              <div
                data-testid="editor-content-region"
                className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4 md:p-5"
              >
                {!workspacePath && (
                  <div className="flex flex-1 flex-col items-center justify-center">
                    <div className="max-w-md text-center">
                      <div className="mb-6 flex justify-center">
                        <div className="rounded-full border border-[rgba(113,125,144,0.3)] bg-[rgba(42,48,61,0.5)] p-4 text-[var(--blue)]">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        </div>
                      </div>
                      <h2 className="text-sm font-semibold text-[var(--subtext1)] text-balance">GoIDE</h2>
                      <p className="mt-4 text-sm text-[var(--subtext0)] leading-relaxed">
                        Open a workspace folder to begin concurrency-first development. 
                        Your code will stay responsive and fluid.
                      </p>
                      <button
                        className="mt-8 cursor-pointer rounded border border-[rgba(126,162,220,0.4)] bg-[rgba(126,162,220,0.16)] px-6 py-2.5 text-[11px] font-semibold text-[var(--flamingo)] transition-colors duration-150 ease-out hover:bg-[rgba(126,162,220,0.24)]"
                        onClick={handleOpenWorkspace}
                        type="button"
                        title="Choose a Go workspace folder."
                        disabled={isOpening}
                      >
                        Open Workspace
                      </button>
                    </div>
                  </div>
                )}
                {workspacePath && !activeFilePath && (
                  <div className="flex flex-1 flex-col items-center justify-center">
                    <div className="max-w-md text-center">
                      <p className="text-[11px] font-semibold text-[var(--overlay1)] text-balance">Workspace Active</p>
                      <p className="mt-4 text-sm text-[var(--subtext0)] leading-relaxed">
                        Select a target file from the explorer to activate the concurrency lens.
                      </p>
                    </div>
                  </div>
                )}
                {workspacePath && activeFilePath && (
                  <div
                    data-testid="editor-active-file-region"
                    className="flex min-h-0 flex-1 overflow-hidden"
                  >
                    {fileError && (
                      <div className="absolute left-0 right-0 top-0 z-10 mx-3 mt-2 rounded border border-[var(--red)] bg-[var(--crust)] px-3 py-2 text-xs text-[var(--red)]">
                        {fileError}
                      </div>
                    )}
                    <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--crust)]">
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                      <div className="flex items-center gap-2 border-b border-[rgba(113,125,144,0.2)] px-3 py-1.5">
                        <span className="min-w-0 truncate text-[12px] font-medium text-[var(--subtext1)]">{editorTitle}</span>
                        {isReading && <span className="shrink-0 text-[10px] text-[var(--overlay0)]">Loading…</span>}
                        <span className="shrink-0 text-[rgba(113,125,144,0.4)]">/</span>
                        <div
                          className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--overlay1)]"
                          data-testid="editor-scope-breadcrumb"
                        >
                          {activeDocumentSymbol ? (
                            <button
                              type="button"
                              className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors duration-100 hover:bg-[var(--bg-hover)]"
                              onClick={() => requestJump(activeDocumentSymbol.line)}
                              title={`Jump to ${activeDocumentSymbol.name} on line ${activeDocumentSymbol.line}.`}
                            >
                              <span className="rounded bg-[var(--surface0)] px-1 py-0.5 text-[9px] uppercase tracking-[0.04em]">
                                {activeDocumentSymbol.kind}
                              </span>
                              <span className="truncate text-[var(--subtext1)]">
                                {activeDocumentSymbol.name}
                              </span>
                              <span className="text-[rgba(113,125,144,0.5)]">
                                L{activeDocumentSymbol.line}
                              </span>
                            </button>
                          ) : (
                            <span className="text-[var(--overlay0)]">No active symbol</span>
                          )}
                        </div>
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
                          confidence={
                            isBlockedConfirmedVisible ? "confirmed" : traceBubbleConfidence
                          }
                          label={activeRaceSignal ? "Race Detector" : isBlockedConfirmedVisible ? "Blocked Op" : traceBubbleLabel}
                          blocked={isBlockedConfirmedVisible}
                          source={activeRaceSignal ? "race-detector" : "runtime"}
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
                            filePath={activeFilePath}
                            executionLine={debuggerState?.activeLine ?? null}
                            breakpoints={breakpoints}
                            onToggleBreakpoint={handleToggleBreakpoint}
                            diagnostics={diagnostics}
                            selectionContextKey={activeFilePath}
                              hintLine={activeHintLine}
                              counterpartLine={counterpartResolution?.line ?? null}
                            jumpRequest={jumpRequest}
                            onHoverLineChange={setHoveredLine}
                            onSelectionLineChange={setSelectedLine}
                            onCursorOffsetChange={setCursorOffset}
                            onModifierClickLine={handleModifierClickLine}
                            onInteractionAnchorChange={setInteractionAnchor}
                            onCounterpartAnchorChange={setCounterpartAnchor}
                            onViewportRangeChange={setVisibleRange}
                            onSave={handleSaveFile}
                            onChange={handleEditorChange}
                            onRequestCompletions={handleRequestCompletions}
                            onDocumentSymbolsChange={(symbols) => {
                              setDocumentSymbols(symbols);
                              setIsSymbolsPending(false);
                            }}
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
                      <DocumentOutline
                        activeItemFrom={activeDocumentSymbol?.from ?? null}
                        items={documentSymbols}
                        isPending={isSymbolsPending}
                        onJumpToLine={(line) => requestJump(line)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>

              </div>
            }
          />
            </div>
          }
        />
      </div>

      <StatusBar
        workspacePath={workspacePath}
        activeFilePath={activeFilePath}
        activeSymbol={activeDocumentSymbol}
        onJumpToActiveSymbol={
          activeDocumentSymbol ? () => requestJump(activeDocumentSymbol.line) : undefined
        }
        mode={mode}
        runtimeAvailability={runtimeAvailability}
        diagnosticsAvailability={diagnosticsAvailability}
        completionAvailability={completionAvailability}
        toolchainStatus={toolchainStatus}
        saveStatus={saveStatus}
        runStatus={runStatus}
        branchName={branchSnapshot?.currentBranch ?? null}
        onToggleBranchPicker={() => setIsBranchPickerOpen((prev) => !prev)}
        isBottomPanelOpen={isBottomPanelOpen}
        onToggleBottomPanel={() => setIsBottomPanelOpen((prev) => !prev)}
      />


      {isBranchPickerOpen && branchSnapshot && (
        <div className="absolute bottom-10 left-[240px] z-50 w-72">
          <BranchPicker
            open={isBranchPickerOpen}
            currentBranch={branchSnapshot.currentBranch}
            branches={branchSnapshot.branches}
            query={branchQuery}
            onQueryChange={setBranchQuery}
            onSelectBranch={handleBranchSelect}
            onClose={() => {
              setIsBranchPickerOpen(false);
              setBranchQuery("");
            }}
          />
        </div>
      )}

      {isBranchDialogOpen && pendingTargetBranch && branchSnapshot && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-96">
            <BranchSwitchDialog
              open={isBranchDialogOpen}
              targetBranch={pendingTargetBranch.name}
              changedFiles={branchSnapshot.changedFilesSummary}
              onConfirm={handleBranchSwitchConfirm}
              onCancel={() => {
                setIsBranchDialogOpen(false);
                setPendingTargetBranch(null);
                setBranchSwitchError(null);
              }}
            />
          </div>
        </div>
      )}

      {branchSwitchLoading && (
        <div className="absolute bottom-10 left-1/2 z-50 -translate-x-1/2 rounded border border-[var(--border-muted)] bg-[var(--mantle)] px-4 py-2 text-xs text-[var(--subtext1)]">
          Switching branch…
        </div>
      )}

      {branchSwitchError && (
        <div className="absolute bottom-10 left-1/2 z-50 -translate-x-1/2 rounded border border-[var(--red)] bg-[var(--mantle)] px-4 py-2 text-xs text-[var(--red)]">
          {branchSwitchError}
        </div>
      )}

      {debugFailure !== null ? (
        <Suspense fallback={null}>
          <LazyDebugFailureDialog
            open
            title={debugFailure.title}
            message={debugFailure.message}
            details={debugFailure.details ?? null}
            onClose={() => {
              setDebugFailure(null);
              setDebugUiState("idle");
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

export default EditorShell;

