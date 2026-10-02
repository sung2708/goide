import { open } from "@tauri-apps/plugin-dialog";
import WelcomeScreen from "./WelcomeScreen";
import { useQuickOpenIndex } from "../../features/navigation/useQuickOpenIndex";
import Dialog from "../primitives/Dialog";
import CommandPalette from "../command-palette/CommandPalette";
import { useCommandRegistry } from "../../features/commands/useCommandRegistry";
import type { Command } from "../../features/commands/registry";
import { useDocumentSession } from "../../features/documents/useDocumentSession";
import { useOpenDocumentDiskSync } from "../../features/documents/useOpenDocumentDiskSync";
import DocumentTabs from "../../features/documents/DocumentTabs";
import { useSaveDecision } from "../../features/documents/useSaveDecision";
import { buildProblems, diagnosticProblems, type Problem } from "../../features/problems/model";
import { useLanguageQueries } from "../../features/language/useLanguageQueries";
import LanguageResults from "../../features/language/LanguageResults";
import { useLanguageEditReview } from "../../features/language/useLanguageEditReview";
import LanguageEditReview from "../../features/language/LanguageEditReview";
import ThemeSwitcher from "../layout/ThemeSwitcher";
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
  getWorkspaceFileInfo,
  writeWorkspaceFile,
  runWorkspaceFile,
  runWorkspaceFileWithRace,
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
import { useReplacementReview } from "./useReplacementReview";
import { discardConflictDrafts, hasConflictDrafts, saveConflictDrafts } from "../../features/git/conflictDrafts";
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
import { useBranchTransition } from "./useBranchTransition";
import { useGitDocumentTransaction } from "../../features/git/useGitDocumentTransaction";
import { useExternalFileState } from "./useExternalFileState";
import ExternalFileConflict from "./ExternalFileConflict";
import { useSafeWindowClose } from "./useSafeWindowClose";
import { useExplorerDocumentTransaction } from "./useExplorerDocumentTransaction";
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

type GoOutlineMatch = {
  name: string;
  kind: DocumentOutlineItem["kind"];
  startIndex: number;
};

function getLineNumberAtOffset(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
    }
  }
  return line;
}

function findBlockEnd(source: string, startIndex: number): number {
  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return source.length;
}

function buildFallbackDocumentSymbols(source: string): DocumentOutlineItem[] {
  const matches: GoOutlineMatch[] = [];
  const functionRegex = /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;
  const typeRegex = /^type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(struct|interface)\b/gm;

  for (const match of source.matchAll(functionRegex)) {
    const name = match[1];
    if (!name) continue;
    matches.push({
      name,
      kind: match[0].startsWith("func (") ? "method" : "function",
      startIndex: match.index ?? 0,
    });
  }

  for (const match of source.matchAll(typeRegex)) {
    const name = match[1];
    const typeKind = match[2];
    if (!name || !typeKind) continue;
    matches.push({
      name,
      kind: typeKind === "struct" ? "struct" : "interface",
      startIndex: match.index ?? 0,
    });
  }

  return matches
    .sort((a, b) => a.startIndex - b.startIndex)
    .map((match) => {
      const blockStart = source.indexOf("{", match.startIndex);
      return {
        name: match.name,
        kind: match.kind,
        line: getLineNumberAtOffset(source, match.startIndex),
        from: match.startIndex,
        to: blockStart === -1 ? match.startIndex + match.name.length : findBlockEnd(source, blockStart),
      };
    });
}

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
  const { session: documents, snapshot: documentSnapshot, workspacePath, setWorkspacePath, activeFilePath, setActiveFilePath, activeFileContent, setActiveFileContent, isDirty, activeFilePathRef, savedContentRef, latestEditorContentRef } = useDocumentSession();
  const [isOpening, setIsOpening] = useState(false);
  const documentDecision = useSaveDecision(workspacePath);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fsSyncError, setFsSyncError] = useState<string | null>(null);
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
  const [problemRun, setProblemRun] = useState<{ root: string; id: string } | null>(null);
  useEffect(() => { setProblemRun(null); }, [workspacePath]);
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
  const [activeTab, setActiveTab] = useState<ActivityBarTab>("explorer");
  const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenSelectedIndex, setQuickOpenSelectedIndex] = useState(0);
  const quickOpenInputRef = useRef<HTMLInputElement | null>(null);
  const [breakpoints, setBreakpoints] = useState<number[]>([]);
  const replacementReview = useReplacementReview(workspacePath);
  const {
    searchLoading,
    searchError,
    searchWarning,
    cancelSearch,
    workspaceSearchResults,
    resetWorkspaceSearch,
    handleWorkspaceSearch,
    replaceMatch: handleReplaceMatch,
    replaceAllMatches: handleReplaceAllMatches,
  } = useWorkspaceSearchState(workspacePath, {
    review: replacementReview.review,
    transaction: (operation) => gitDocumentTransaction(operation, true, true),
    onChanged: () => setExplorerRevision((revision) => revision + 1),
  });
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const [explorerRevision, setExplorerRevision] = useState(0);
  const [gitOperationBusy, setGitOperationBusy] = useState(false);
  const [explorerOperationBusy, setExplorerOperationBusy] = useState(false);
  const isSavingRef = useRef(false);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibleRange, setVisibleRange] = useState<VisibleLineRange | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [jumpRequest, setJumpRequest] = useState<JumpRequest | null>(null);
  const [editorHighlightQuery, setEditorHighlightQuery] = useState<string | null>(null);
  const [documentSymbols, setDocumentSymbols] = useState<DocumentOutlineItem[]>([]);
  const [isSymbolsPending, setIsSymbolsPending] = useState(false);
  const [cursorOffset, setCursorOffset] = useState<number | null>(null);
  const language = useLanguageQueries(documentSnapshot, cursorOffset);
  const languageEdits = useLanguageEditReview(documents, documentSnapshot, () => {
    if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
    setProblemRun(null);
    resetDiagnosticsState();
    invalidateCompletionRequests();
    resetCompletionAvailability();
    setSaveStatus("idle");
    setAnalysisRevision(revision => revision + 1);
  }, cursorOffset);
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
  const documentTransitionRef = useRef(false);
  const externalFile = useExternalFileState({
    root: workspacePath, path: activeFilePath, revision: explorerRevision,
    saved: savedContentRef, buffer: latestEditorContentRef, busy: documentTransitionRef, saving: isSavingRef,
    apply: (content) => {
      if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
      savedContentRef.current = content; latestEditorContentRef.current = content;
      setActiveFileContent(content);  setAnalysisRevision((revision) => revision + 1); setFileError(null);
      clearActiveDiagnostics();
      if (workspacePath && activeFilePath) void refreshDiagnosticsForFile(workspacePath, activeFilePath);
    }, onError: setFileError,
  });
  const inactiveDiskConflicts = useOpenDocumentDiskSync({
    documents, snapshot: documentSnapshot, revision: explorerRevision,
    blocked: gitOperationBusy || explorerOperationBusy || isReading || isSavingRef.current,
    busy: () => documentTransitionRef.current || isSavingRef.current || gitOperationBusy || explorerOperationBusy,
    onReload: (path) => { forgetDiagnostics(path); setProblemRun(null); setAnalysisRevision(revision => revision + 1); },
    onError: setFileError,
  });
  const {
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
  const runStopInFlightRef = useRef(false);
  const autoSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const branchMutationRef = useRef(false);
  const editorMountedRef = useRef(true);
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
    setCursorOffset(null);
    setIsSymbolsPending(Boolean(activeFilePath?.toLowerCase().endsWith(".go")));
  }, [workspacePath, activeFilePath]);

  useEffect(() => {
    if (!activeFilePath?.toLowerCase().endsWith(".go") || activeFileContent === null) {
      return;
    }

    const fallbackSymbols = buildFallbackDocumentSymbols(activeFileContent);
    setDocumentSymbols(fallbackSymbols);
    setIsSymbolsPending(false);
  }, [activeFilePath, activeFileContent]);

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
    editorMountedRef.current = true;
    return () => {
      editorMountedRef.current = false;
      if (saveStatusTimerRef.current !== null) {
        clearTimeout(saveStatusTimerRef.current);
      }
      if (autoSaveDebounceRef.current !== null) {
        clearTimeout(autoSaveDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isQuickOpenOpen) {
      queueMicrotask(() => quickOpenInputRef.current?.focus());
    }
  }, [isQuickOpenOpen]);

  const { files: quickOpenFilteredFiles, loading: quickOpenLoading, error: quickOpenError, notice: quickOpenNotice, remember: rememberOpenedFile } = useQuickOpenIndex(workspacePath, explorerRevision, isQuickOpenOpen, quickOpenQuery);

  useEffect(() => {
    setQuickOpenSelectedIndex((current) => {
      if (quickOpenFilteredFiles.length === 0) return 0;
      return Math.min(current, quickOpenFilteredFiles.length - 1);
    });
  }, [quickOpenFilteredFiles]);

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
    setProblemRun(null);
    resetDiagnosticsState();
    scheduleDiagnosticsRefresh(workspacePathRef.current, activeFilePathRef.current);
  }, [resetDiagnosticsState, scheduleDiagnosticsRefresh]);

  useWorkspaceFsSync({
    workspacePath,
    workspacePathRef,
    onWorkspaceChanged: handleWorkspaceFsChanged,
    onSyncError: setFsSyncError,
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


  const requestJump = useCallback((targetLine: number | null, column = 1) => {
    if (targetLine === null) {
      return;
    }
    if (targetLine < 1 || !Number.isInteger(targetLine)) {
      return;
    }
    if (latestEditorContentRef.current === null) {
      return;
    }
    const maxLine = latestEditorContentRef.current.split("\n").length;
    if (targetLine > maxLine) {
      return;
    }

    jumpRequestIdRef.current += 1;
    setJumpRequest({
      line: targetLine,
      column,
      requestId: jumpRequestIdRef.current,
    });
  }, [latestEditorContentRef]);

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
    async (content: string): Promise<boolean> => {
      const currentPath = activeFilePath;
      if (!workspacePath || !currentPath) {
        return false;
      }
      // Guard: ignore concurrent save requests
      if (isSavingRef.current || branchMutationRef.current) {
        return false;
      }

      isSavingRef.current = true;
      if (autoSaveDebounceRef.current !== null) {
        clearTimeout(autoSaveDebounceRef.current);
        autoSaveDebounceRef.current = null;
      }
      if (saveStatusTimerRef.current !== null) {
        clearTimeout(saveStatusTimerRef.current);
        saveStatusTimerRef.current = null;
      }

      const saveWorkspacePath = workspacePath;
      const saveFilePath = currentPath;
      let didWrite = false;

      setSaveStatus("saving");
      try {
        const response = await writeWorkspaceFile(workspacePath, currentPath, content, savedContentRef.current ?? undefined);
        if (
          !editorMountedRef.current ||
          workspacePathRef.current !== saveWorkspacePath ||
          activeFilePathRef.current !== saveFilePath
        ) {
          return false;
        }
        if (response.ok) {
          didWrite = true;
          setFileError(null);
          savedContentRef.current = content;
          const hasNewerEdits = latestEditorContentRef.current !== content;
          if (!hasNewerEdits) {
            setActiveFileContent(content);
          }

          if (hasNewerEdits) {
            setSaveStatus("idle");
          } else {
            setSaveStatus("saved");
            saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
          }
          await refreshDiagnosticsForFile(saveWorkspacePath, saveFilePath);
          if (
            editorMountedRef.current &&
            workspacePathRef.current === saveWorkspacePath &&
            activeFilePathRef.current === saveFilePath
          ) {
            setAnalysisRevision((current) => current + 1);
          }
          return true;
        } else {
          if (response.error?.code === "external_file_conflict") {
            // Recheck after the save guard is released; do not schedule another write.
            setTimeout(() => void externalFile.check(), 0);
          }
          setFileError(response.error?.message ?? "Unable to save the current file.");
          setSaveStatus("error");
          saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 5000);
          return false;
        }
      } catch (error) {
        if (
          !editorMountedRef.current ||
          workspacePathRef.current !== saveWorkspacePath ||
          activeFilePathRef.current !== saveFilePath
        ) {
          return false;
        }
        setSaveStatus("error");
        setFileError(error instanceof Error ? error.message : "Unable to save the current file.");
        saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 5000);
        console.error("Failed to save file:", error);
        return false;
      } finally {
        isSavingRef.current = false;
        const newerContent = latestEditorContentRef.current;
        if (
          editorMountedRef.current && didWrite && newerContent !== null && newerContent !== content &&
          autoSaveDebounceRef.current === null &&
          workspacePathRef.current === saveWorkspacePath &&
          activeFilePathRef.current === saveFilePath
        ) {
          // A debounce may have fired while this write was pending. Retain the
          // newer buffer and schedule its save after the successful write.
          autoSaveDebounceRef.current = setTimeout(() => {
            autoSaveDebounceRef.current = null;
            if (
              workspacePathRef.current === saveWorkspacePath &&
              activeFilePathRef.current === saveFilePath &&
              latestEditorContentRef.current === newerContent &&
              savedContentRef.current !== newerContent
            ) {
              void persistActiveFileContent(newerContent);
            }
          }, 2500);
        }
      }
    },
    [workspacePath, activeFilePath, refreshDiagnosticsForFile, externalFile.check]
  );

  const handleSaveFile = useCallback(
    async (content: string) => {
      if (branchMutationRef.current) return;
      // The explicit save command carries the editor's current buffer.
      latestEditorContentRef.current = content;
      await persistActiveFileContent(content);
    },
    [persistActiveFileContent]
  );

  const preserveDocuments = useCallback(async () => {
    if (isSavingRef.current) { setFileError("Saving is still in progress."); return false; }
    if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
    isSavingRef.current = true; setSaveStatus("saving");
    try {
      await documents.saveAll(writeWorkspaceFile);
      setSaveStatus("saved"); setFileError(null);
      if (workspacePathRef.current && activeFilePathRef.current) void refreshDiagnosticsForFile(workspacePathRef.current, activeFilePathRef.current);
      return true;
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Cannot save all documents.");
      setSaveStatus("error"); setTimeout(() => void externalFile.check(), 0); return false;
    } finally { isSavingRef.current = false; }
  }, [documents, refreshDiagnosticsForFile, externalFile.check, activeFilePathRef]);

  const preserveAllDocuments = useCallback(async () => {
    if (!(await preserveDocuments())) return false;
    if (workspacePathRef.current && hasConflictDrafts(workspacePathRef.current)) {
      try { await saveConflictDrafts(workspacePathRef.current); }
      catch (error) { setFileError(error instanceof Error ? error.message : "Cannot save retained conflict results."); return false; }
    }
    return true;
  }, [preserveDocuments]);

  const safeCloseDialog = useSafeWindowClose({
    dirty: () => hasConflictDrafts(workspacePathRef.current) || documents.dirty,
    busy: () => documentTransitionRef.current || isSavingRef.current,
    save: preserveAllDocuments,
    cancelAutosave: () => { if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; } },
    onError: setFileError,
    onPending: (pending) => { branchMutationRef.current = pending; setExplorerOperationBusy(pending); },
  });
  const explorerTransaction = useExplorerDocumentTransaction({
    root: workspacePathRef, path: activeFilePathRef, lock: documentTransitionRef, mutation: branchMutationRef,
    preserve: preserveDocuments,
    touches: (affected) => documentSnapshot.documents.some(document => document.path === affected || document.path.startsWith(`${affected}/`)),
    isPreserved: () => !isSavingRef.current && !documents.dirty,
    setBusy: setExplorerOperationBusy, onError: setFileError,
  });

  const handleRunFile = useCallback(async (modeToRun: RunMode = "standard") => {
    if (documentTransitionRef.current || runStopInFlightRef.current || debugUiState === "starting") {
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
    setProblemRun({ root: workspacePath, id: runId });
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
    if (documentTransitionRef.current || runStopInFlightRef.current || debugStopInFlightRef.current || (runStatus === "running" && runMode !== "debug")) {
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

  // A DAP acknowledgement does not prove that the target paused/continued.
  // Runtime polling updates the UI from backend-observed debugger state.
  const handleToggleDebugPause = useCallback(
    () => isDebugPaused ? debuggerContinue() : debuggerPause(),
    [isDebugPaused]
  );

  // Fall back to explorer when the debug tab becomes unavailable while active.
  useEffect(() => {
    if (activeTab === "debug" && !showDebugTab) {
      setActiveTab("explorer");
    }
  }, [activeTab, showDebugTab]);

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

  const handleStopRun = useCallback(async () => {
    if (runStopInFlightRef.current) return;
    runStopInFlightRef.current = true;
    const stoppedId = activeRunIdRef.current;
    try {
      const response = await stopCurrentRun();
      if (!response.ok) throw new Error(response.error?.message ?? "Unable to stop the active run.");
      if (activeRunIdRef.current === stoppedId) {
        activeRunIdRef.current = null;
        clearPendingRunOutputBuffer();
        setRunStatus((current) => current === "running" ? "done" : current);
      }
    } finally { runStopInFlightRef.current = false; }
  }, [clearPendingRunOutputBuffer]);

  const handleEditorChange = useCallback((value: string) => {
    if (branchMutationRef.current || documents.active?.readOnly) return;
    latestEditorContentRef.current = value;
    setProblemRun(null);
    if (activeFilePath) { forgetDiagnostics(activeFilePath); clearDiagnostics(); invalidateDiagnosticsRequests(); }
    setActiveFileContent(value);

    // Reset transient statuses when the user starts editing again
    setSaveStatus((prev) => (prev === "error" || prev === "saved" ? "idle" : prev));
    setCompletionAvailability((prev) => (prev === "degraded" ? "idle" : prev));

    if (autoSaveDebounceRef.current) {
      clearTimeout(autoSaveDebounceRef.current);
    }
    const expectedWorkspace = workspacePath;
    const expectedFile = activeFilePath;
    autoSaveDebounceRef.current = setTimeout(() => {
      autoSaveDebounceRef.current = null;
      if (
        expectedWorkspace && expectedFile &&
        workspacePathRef.current === expectedWorkspace &&
        activeFilePathRef.current === expectedFile &&
        latestEditorContentRef.current === value &&
        savedContentRef.current !== value
      ) {
        void persistActiveFileContent(value);
      }
    }, 2500);
  }, [documents, forgetDiagnostics, clearDiagnostics, invalidateDiagnosticsRequests, persistActiveFileContent, workspacePath, activeFilePath]);

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
    if (isOpening || documentTransitionRef.current) {
      return;
    }

    documentTransitionRef.current = true;
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
        if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
        branchMutationRef.current = true; setExplorerOperationBusy(true);
        const choice = documents.dirty || hasConflictDrafts(workspacePathRef.current)
          ? await documentDecision.ask("Save all editor and conflict-result changes before changing workspace?") : "save";
        if (choice === "cancel") return;
        if (choice === "save" && !(await preserveAllDocuments())) return;
        if (choice === "discard") {
          if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
          discardConflictDrafts(workspacePathRef.current);
          documents.reset(workspacePathRef.current, true);
        }
        setMode("quick-insight");
        setRuntimeAvailability("unavailable");
        setDeepTraceScope(null);
        setActiveBlockedSignal(null);
        setRaceSignals([]);
        setWorkspacePath(resolvedPath);
        workspacePathRef.current = resolvedPath;
        setActiveFilePath(null);
        activeFilePathRef.current = null;
        setActiveFileContent(null);
        savedContentRef.current = null;
        latestEditorContentRef.current = null;

        setSaveStatus("idle");
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
      branchMutationRef.current = false; setExplorerOperationBusy(false);
      documentTransitionRef.current = false;
      setIsOpening(false);
    }
  }, [documents, documentDecision, isOpening, preserveAllDocuments, resetDiagnosticsState, resetWorkspaceSearch]);

  const handleOpenFile = useCallback(
    async (relativePath: string) => {
      if (!workspacePath || isReading || documentTransitionRef.current) {
        return;
      }
      if (isSavingRef.current) { setFileError("Wait for the pending document save before switching tabs."); return; }
      if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }

      documentTransitionRef.current = true;
      const startingPath = workspacePath;
      const readFileWithRetry = async (workspaceRoot: string, path: string) => {
        let lastResponse = await readWorkspaceFile(workspaceRoot, path);
        const isLikelyNotFound = (message?: string | null) =>
          typeof message === "string" && /not\s+found|cannot\s+find/i.test(message);
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (lastResponse.ok || !isLikelyNotFound(lastResponse.error?.message)) {
            return lastResponse;
          }
          await new Promise((resolve) => setTimeout(resolve, 140));
          lastResponse = await readWorkspaceFile(workspaceRoot, path);
        }
        return lastResponse;
      };
      setIsReading(true);
      setFileError(null);
      setSelectedLine(null);
      setInteractionAnchor(null);
      try {
        const info = await getWorkspaceFileInfo(workspacePath, relativePath);
        if (!info.ok && info.error?.code !== "fs_info_unavailable") throw new Error(info.error?.message ?? "Cannot read file metadata.");
        const retained = documents.snapshot().documents.find(document => document.path === relativePath);
        const response = retained ? { ok: true, data: retained.text } : await readFileWithRetry(workspacePath, relativePath);

        // If the workspace changed while we were reading, ignore the result
        if (workspacePathRef.current !== startingPath) {
          return;
        }
        if (!response.ok || response.data === undefined) {
          setFileError(response.error?.message ?? "Unable to open file");
          return;
        }

        if (autoSaveDebounceRef.current !== null) {
          clearTimeout(autoSaveDebounceRef.current);
          autoSaveDebounceRef.current = null;
        }
        invalidateDiagnosticsRequests();
        invalidateCompletionRequests();
        clearActiveDiagnostics();
        resetCompletionAvailability();
        rememberOpenedFile(relativePath);
        setActiveFilePath(relativePath);
        activeFilePathRef.current = relativePath;
        setActiveFileContent(response.data);
        if (!retained) savedContentRef.current = response.data;
        latestEditorContentRef.current = response.data;
        if (info.ok && info.data && documents.active) documents.setReadOnly(documents.active.id, info.data.readOnly);

        setSaveStatus("idle");
        setMode("quick-insight");
        setDeepTraceScope(null);
        setActiveBlockedSignal(null);
        void refreshDiagnosticsForFile(startingPath, relativePath);
        if (isGoFile(relativePath)) {
          runtimeCheckRequestIdRef.current += 1;
          const requestId = runtimeCheckRequestIdRef.current;
          setRuntimeAvailability("unavailable");
          // Toolchain health is independent of loading the document. A slow
          // probe must not hold the file/workspace transition lock.
          const checkRuntimeAvailability = async () => {
            try {
              const availabilityResponse = await getRuntimeAvailability();
              if (
                editorMountedRef.current &&
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
                editorMountedRef.current &&
                requestId === runtimeCheckRequestIdRef.current &&
                workspacePathRef.current === startingPath &&
                activeFilePathRef.current === relativePath
              ) {
                setRuntimeAvailability("unavailable");
              }
            }
          };
          void checkRuntimeAvailability();
        } else {
          setRuntimeAvailability("unavailable");
        }
        if (!isGoFile(relativePath)) {
          clearActiveDiagnostics();
          resetCompletionAvailability();
        }
      } catch (error) {
        if (workspacePathRef.current === startingPath) {
          setFileError(error instanceof Error ? `An unexpected error occurred while loading the file: ${error.message}` : "An unexpected error occurred while loading the file.");
        }
      } finally {
        documentTransitionRef.current = false;
        setIsReading(false);
      }
    },
    [documents, clearActiveDiagnostics, invalidateDiagnosticsRequests, isReading, refreshDiagnosticsForFile, rememberOpenedFile, workspacePath]
  );

  // Git has already preserved the buffer before entering this callback. Never
  // route reload through handleOpenFile: its save targets the *new* branch.
  const reloadWorkspaceState = useCallback(async () => {
    const root = workspacePathRef.current;
    const path = activeFilePathRef.current;
    if (!root) return;
    invalidateDiagnosticsRequests();
    invalidateCompletionRequests();
    runtimeCheckRequestIdRef.current += 1;
    resetDiagnosticsState();
    setDebuggerState(null);
    clearPendingRunOutputBuffer();
    setRunOutput([]);
    resetWorkspaceSearch();
    setExplorerRevision((prev) => prev + 1);
    setMode("quick-insight");
    setDeepTraceScope(null);
    setActiveBlockedSignal(null);
    setRaceSignals([]);
    setBreakpoints([]);
    setSelectedLine(null);
    setInteractionAnchor(null);
    setFileError(null);
    if (autoSaveDebounceRef.current !== null) {
      clearTimeout(autoSaveDebounceRef.current);
      autoSaveDebounceRef.current = null;
    }
    // Retire the previous branch's document even if the destination lacks it.
    documents.reset(root);
    activeFilePathRef.current = null;
    savedContentRef.current = null;
    latestEditorContentRef.current = null;
    setActiveFilePath(null);
    setActiveFileContent(null);

    setSaveStatus("idle");
    if (path) {
      try {
        const response = await readWorkspaceFile(root, path);
        if (!editorMountedRef.current || workspacePathRef.current !== root) return;
        if (response.ok && response.data !== undefined) {
          activeFilePathRef.current = path;
          savedContentRef.current = response.data;
          latestEditorContentRef.current = response.data;
          setActiveFilePath(path);
          setActiveFileContent(response.data);
          void refreshDiagnosticsForFile(root, path);
        } else {
          setFileError(response.error?.message ?? "The active file is unavailable after the Git operation. Select another file.");
        }
      } catch (error) {
        setFileError(error instanceof Error ? error.message : "Unable to reload the file after the Git operation.");
      }
    }
    await reloadGitState(root);
  }, [documents, resetDiagnosticsState, refreshDiagnosticsForFile, reloadGitState, resetWorkspaceSearch, invalidateDiagnosticsRequests, invalidateCompletionRequests]);

  const {
    pendingTargetBranch, isBranchDialogOpen, branchSwitchLoading, branchSwitchError,
    isBranchMutationInProgress, handleBranchSelect, handleBranchSwitchConfirm, cancelBranchSwitch,
  } = useBranchTransition({
    workspacePathRef, documentTransitionRef, branchMutationRef,
    branchSnapshot, setBranchSnapshot, refreshBranchSnapshot,
    preserveActiveDocument: preserveDocuments, reloadWorkspaceState,
    isDocumentPreserved: () => !isSavingRef.current && !documents.dirty,
    closePicker: () => { setIsBranchPickerOpen(false); setBranchQuery(""); },
    getBlockReason: () => runStatus === "running" || ["starting", "running", "paused", "stopping"].includes(debugUiState)
      ? "Stop the active run or debug session before switching branches." : null,
  });
  const handleQuickOpenSelect = useCallback(
    (relativePath: string) => {
      setIsQuickOpenOpen(false);
      setQuickOpenQuery("");
      setQuickOpenSelectedIndex(0);
      void handleOpenFile(relativePath);
    },
    [handleOpenFile]
  );

  const closeDocument = useCallback(async (id: number) => {
    if (documentTransitionRef.current || isSavingRef.current) { setFileError("Wait for the current document operation."); return; }
    const document = documents.snapshot().documents.find(item => item.id === id);
    if (!document) return;
    documentTransitionRef.current = true; branchMutationRef.current = true; setExplorerOperationBusy(true);
    if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
    try {
      const dirty = document.text !== document.baseline;
      const choice = dirty ? await documentDecision.ask(`Save changes to ${document.path} before closing its tab?`) : "save";
      if (choice === "cancel") return;
      if (choice === "save") await documents.save(id, writeWorkspaceFile);
      documents.close(id, choice === "discard");
      clearActiveDiagnostics(); invalidateCompletionRequests(); setSelectedLine(null); setInteractionAnchor(null); setFileError(null);
      const active = documents.active;
      if (active && workspacePathRef.current) void refreshDiagnosticsForFile(workspacePathRef.current, active.path);
    } catch (error) { setFileError(error instanceof Error ? error.message : "Cannot close document."); }
    finally { documentTransitionRef.current = false; branchMutationRef.current = false; setExplorerOperationBusy(false); }
  }, [documents, documentDecision, clearActiveDiagnostics, invalidateCompletionRequests, refreshDiagnosticsForFile]);

  const gitDocumentTransaction = useGitDocumentTransaction({
    root: workspacePathRef, lock: documentTransitionRef, mutation: branchMutationRef,
    preserve: preserveDocuments,
    isPreserved: () => !isSavingRef.current && !documents.dirty,
    setBusy: setGitOperationBusy,
    canChangeFiles: () => runStatus !== "running" && debugUiState !== "starting" && debugUiState !== "running" && debugUiState !== "paused" && debugUiState !== "stopping",
  });

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

  const commandBusy = documentTransitionRef.current || branchMutationRef.current || runStopInFlightRef.current;
  const problems = useMemo(() => [
    ...Object.entries(knownDiagnostics)
      .filter(([file]) => !documentSnapshot.documents.some(document => document.path === file && document.text !== document.baseline))
      .flatMap(([file, values]) => diagnosticProblems(file, values)),
    ...(documents.dirty || problemRun?.root !== workspacePath ? [] : buildProblems(workspacePath, runOutput.filter(entry => entry.runId === problemRun?.id))),
  ], [documents, documentSnapshot, knownDiagnostics, workspacePath, runOutput, problemRun]);
  const selectedProblemRef = useRef<string | null>(null);
  const navigateProblem = (problem: Problem) => {
    selectedProblemRef.current = problem.id;
    const root = workspacePath;
    void handleOpenFile(problem.file).then(() => { if (workspacePathRef.current === root && activeFilePathRef.current === problem.file) requestJump(problem.line, problem.column); });
  };
  const navigateAdjacentProblem = (direction: number) => {
    if (problems.length === 0) return;
    const index = problems.findIndex(problem => problem.id === selectedProblemRef.current);
    navigateProblem(problems[index < 0 ? (direction > 0 ? 0 : problems.length - 1) : (index + direction + problems.length) % problems.length]);
  };
  const debugStartDisabled = !workspacePath || !isGoFile(activeFilePath) || isDebugSessionBusy || debugStopInFlightRef.current || runStatus === "running" || commandBusy;
  const runDisabled = !workspacePath || !isGoFile(activeFilePath) || runStatus === "running" || isDebugSessionBusy || commandBusy;
  const commands: Command[] = [
    { id: "workbench.commands", title: "Show Command Palette", shortcut: "Mod+Shift+p", run: () => setIsCommandPaletteOpen(true) },
    { id: "workspace.open", title: "Open Workspace Folder", shortcut: "Mod+o", disabled: commandBusy ? "A document operation is in progress." : undefined, run: handleOpenWorkspace },
    { id: "file.quickOpen", title: "Quick Open File", shortcut: "Mod+p", disabled: !workspacePath ? "Open a workspace first." : undefined, run: () => { setQuickOpenQuery(""); setQuickOpenSelectedIndex(0); setIsQuickOpenOpen(true); } },
    { id: "file.save", title: "Save Active File", shortcut: "Mod+s", disabled: !activeFilePath || documents.active?.readOnly || commandBusy || isSavingRef.current ? "Open an editable file and wait for document operations." : undefined, run: () => handleSaveFile(latestEditorContentRef.current ?? "") },
    { id: "file.saveAll", title: "Save All Files", shortcut: "Ctrl+Alt+s", disabled: !workspacePath || commandBusy || isSavingRef.current ? "Open a workspace and wait for document operations." : undefined, run: preserveAllDocuments },
    { id: "file.close", title: "Close Active Editor Tab", shortcut: "Mod+w", disabled: documentSnapshot.activeId === null || commandBusy || isSavingRef.current ? "Open a file and wait for document operations." : undefined, run: () => documentSnapshot.activeId !== null ? closeDocument(documentSnapshot.activeId) : undefined },
    { id: "workspace.search", title: "Search Workspace", shortcut: "Mod+Shift+f", run: () => { setActiveTab("search"); setSearchFocusTrigger(value => value + 1); } },
    { id: "workbench.problems", title: "Show Problems", shortcut: "Mod+Shift+m", run: () => { setIsBottomPanelOpen(true); setBottomPanelTab("problems"); } },
    ...(["definition", "references", "hover"] as const).map(kind => ({ id: `language.${kind}`, title: kind === "definition" ? "Go to Definition" : kind === "references" ? "Find References" : "Show Symbol Information", shortcut: kind === "definition" ? "F12" : kind === "references" ? "Shift+F12" : undefined, disabled: !workspacePath || !isGoFile(activeFilePath) || cursorOffset === null || commandBusy ? "Place the cursor in a Go document and wait for document operations." : undefined, run: () => language.query(kind) })),
    { id: "language.format", title: "Format Document", shortcut: "Shift+Alt+f", disabled: !workspacePath || !isGoFile(activeFilePath) || documents.active?.readOnly || documents.saving || commandBusy ? "Open a writable Go document and wait for document operations." : undefined, run: languageEdits.format },
    { id: "language.imports", title: "Organize Imports", disabled: !workspacePath || !isGoFile(activeFilePath) || documents.active?.readOnly || documents.saving || commandBusy ? "Open a writable Go document and wait for document operations." : undefined, run: languageEdits.organizeImports },
    { id: "language.rename", title: "Rename Symbol", shortcut: "F2", disabled: !workspacePath || !isGoFile(activeFilePath) || documents.active?.readOnly || documents.saving || cursorOffset === null || commandBusy ? "Place the cursor in a writable Go document and wait for document operations." : undefined, run: languageEdits.beginRename },
    { id: "problems.next", title: "Next Problem", shortcut: "Alt+F8", disabled: problems.length === 0 ? "No current problems." : undefined, run: () => navigateAdjacentProblem(1) },
    { id: "problems.previous", title: "Previous Problem", shortcut: "Alt+Shift+F8", disabled: problems.length === 0 ? "No current problems." : undefined, run: () => navigateAdjacentProblem(-1) },
    { id: "workbench.panel", title: "Toggle Terminal Panel", shortcut: "Mod+j", run: () => setIsBottomPanelOpen(value => !value) },
    { id: "go.run", title: "Run Active Go File", shortcut: "Ctrl+F5", disabled: runDisabled ? "Open a Go file and stop active Run/Debug operations." : undefined, run: handleRunFileStandard },
    { id: "go.race", title: "Run Active Go File with Race Detector", disabled: runDisabled || runtimeAvailability === "unavailable" ? "A Go file and available Go toolchain are required." : undefined, run: handleRunFileWithRace },
    { id: "go.stop", title: "Stop Run", disabled: runStatus !== "running" ? "No active run." : undefined, run: handleStopRun },
    { id: "debug.startOrContinue", title: isDebugSessionRunning ? "Continue / Pause Debugging" : "Start Debugging", shortcut: "F5", disabled: !isDebugSessionRunning && debugStartDisabled ? "Open a Go file and wait for active operations." : undefined, run: () => isDebugSessionRunning ? handleToggleDebugPause() : handleStartDebug() },
    { id: "debug.stop", title: "Stop Debugging", shortcut: "Shift+F5", disabled: !isDebugSessionRunning ? "No active debug session." : undefined, run: handleStopDebug },
    { id: "debug.breakpoint", title: "Toggle Breakpoint", shortcut: "F9", disabled: !activeFilePath || !selectedLine ? "Place the cursor on a source line." : undefined, run: () => selectedLine ? handleToggleBreakpoint(selectedLine) : undefined },
    { id: "debug.stepOver", title: "Debug: Step Over", shortcut: "F10", disabled: !isDebugPaused ? "Pause debugging first." : undefined, run: debuggerStepOver },
    { id: "debug.stepInto", title: "Debug: Step Into", shortcut: "F11", disabled: !isDebugPaused ? "Pause debugging first." : undefined, run: debuggerStepInto },
    { id: "debug.stepOut", title: "Debug: Step Out", shortcut: "Shift+F11", disabled: !isDebugPaused ? "Pause debugging first." : undefined, run: debuggerStepOut },
    { id: "navigation.nextSymbol", title: "Next Document Symbol", shortcut: "F8", disabled: !activeFilePath ? "Open a file first." : undefined, run: () => navigateDocumentSymbol("next") },
    { id: "navigation.previousSymbol", title: "Previous Document Symbol", shortcut: "Shift+F8", disabled: !activeFilePath ? "Open a file first." : undefined, run: () => navigateDocumentSymbol("previous") },
  ];
  const executeCommand = useCommandRegistry(commands, setFileError);

  return (
    <div
      className="ide-shell relative flex h-full w-full flex-col bg-[var(--base)] text-[var(--text)]"
    >
      <div className="workspace-titlebar">
        <LanguageEditReview state={languageEdits.state} onApply={languageEdits.apply} onClose={languageEdits.close} onRenameNameChange={languageEdits.setRenameName} onPreviewRename={languageEdits.previewRename} />
        <LanguageResults state={language.state} onClose={language.close} onNavigate={location => {
          const root = workspacePath;
          language.close();
          void handleOpenFile(location.path).then(() => { if (workspacePathRef.current === root && activeFilePathRef.current === location.path) requestJump(location.line, location.column); });
        }} />
        <span className="workspace-brand"><img src="/brand/icon-small.svg" alt="" width="20" height="20" />GoIDE</span>
        <button
          type="button"
          className="workspace-search"
          aria-label="Find workspace files"
          title="Find a file (Ctrl+P)"
          disabled={!workspacePath}
          onClick={() => void executeCommand("file.quickOpen")}
        >
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <span>{workspacePath ? workspacePath.split(/[\\/]/).pop() : "Your next workspace"}</span>
          <kbd>Ctrl P</kbd>
        </button>
        <button type="button" aria-label="Commands" title="Command Palette (Ctrl+Shift+P / Cmd+Shift+P)" className="rounded px-2 py-1 text-xs text-(--subtext0) hover:bg-(--bg-hover)" onClick={() => void executeCommand("workbench.commands")}>Commands</button>
        <ThemeSwitcher />
      </div>
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
          minSize={120}
          maxSize={2000}
          onResize={handleLeftPaneResize}
          primary={
            <aside inert={branchSwitchLoading} className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-(--mantle)">
              {activeTab === "explorer" && (
                <Explorer
                  workspacePath={workspacePath}
                  activeFilePath={activeFilePath}
                  onOpenFile={handleOpenFile}
                  fileDecorations={fileDecorations}
                  explorerRevision={explorerRevision}
                  transaction={explorerTransaction}
                  onEntryPathChanged={(previous, next) => {
                    const previousPath = previous.replace(/\\/g, "/");
                    for (const file of Object.keys(knownDiagnostics)) if (file === previousPath || file.startsWith(`${previousPath}/`)) forgetDiagnostics(file);
                    const active = activeFilePathRef.current?.replace(/\\/g, "/");
                    const old = previous.replace(/\\/g, "/");
                    documents.remap(old, next.replace(/\\/g, "/"));
                    if (active && (active === old || active.startsWith(`${old}/`))) {
                      clearActiveDiagnostics(); invalidateCompletionRequests(); setAnalysisRevision((revision) => revision + 1);
                      if (documents.active && workspacePathRef.current) void refreshDiagnosticsForFile(workspacePathRef.current, documents.active.path);
                    }
                  }}
                  onEntryDeleted={(deleted) => {
                    const deletedPath = deleted.replace(/\\/g, "/");
                    for (const file of Object.keys(knownDiagnostics)) if (file === deletedPath || file.startsWith(`${deletedPath}/`)) forgetDiagnostics(file);
                    const active = activeFilePathRef.current?.replace(/\\/g, "/");
                    const path = deleted.replace(/\\/g, "/");
                    for (const document of documents.snapshot().documents) {
                      if (document.path === path || document.path.startsWith(`${path}/`)) documents.close(document.id);
                    }
                    if (active && (active === path || active.startsWith(`${path}/`))) {
                      clearActiveDiagnostics(); invalidateCompletionRequests(); setSelectedLine(null); setFileError(null);
                      if (documents.active && workspacePathRef.current) void refreshDiagnosticsForFile(workspacePathRef.current, documents.active.path);
                    }
                  }}
                />
              )}
              {activeTab === "search" && (
                <SearchPanel
                  results={workspaceSearchResults}
                  loading={searchLoading}
                  error={searchError}
                  warning={searchWarning}
                  onCancel={() => void cancelSearch()}
                  onSearch={handleWorkspaceSearch}
                  onOpenResult={(file, line, query) => {
                    setEditorHighlightQuery(query);
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
                  key={workspacePath}
                  workspacePath={workspacePath}
                  revision={explorerRevision + analysisRevision}
                  transaction={gitDocumentTransaction}
                  onChanged={() => { setExplorerRevision((current) => current + 1); if (workspacePath) void reloadGitState(workspacePath); }}
                  onOpenFile={handleOpenFile}
                  onOpenTerminal={() => { setBottomPanelTab("shell"); setIsBottomPanelOpen(true); }}
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
                  onClick={() => void executeCommand("debug.startOrContinue")}
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
                      onClick={() => void executeCommand("debug.startOrContinue")}
                    >
                      {isDebugPaused ? "Continue" : "Pause"}
                    </button>
                    <button
                      type="button"
                      aria-label="Stop debugging"
                      className="rounded-md border border-[rgba(231,130,132,0.3)] px-3 py-2 text-[11px] font-semibold text-[var(--red)] hover:bg-[rgba(231,130,132,0.12)]"
                      onClick={() => void executeCommand("debug.stop")}
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
                        onClick={() => void executeCommand("debug.stepOver")}
                      >
                        Over
                      </button>
                      <button
                        type="button"
                        aria-label="Step into"
                        className="rounded-md border border-[rgba(229,200,144,0.3)] px-3 py-2 text-[11px] font-semibold text-[var(--yellow)] hover:bg-[rgba(229,200,144,0.12)]"
                        onClick={() => void executeCommand("debug.stepInto")}
                      >
                        Into
                      </button>
                      <button
                        type="button"
                        aria-label="Step out"
                        className="rounded-md border border-[rgba(239,159,118,0.3)] px-3 py-2 text-[11px] font-semibold text-[var(--peach)] hover:bg-[rgba(239,159,118,0.12)]"
                        onClick={() => void executeCommand("debug.stepOut")}
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
            minSize={isBottomPanelOpen ? 120 : 0}
            maxSize={2000}
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
                      problems={problems}
                      onNavigateProblem={navigateProblem}
                      activeTab={bottomPanelTab}
                      onActiveTabChange={setBottomPanelTab}
                      logEntries={runOutput}
                      surfaceKey={surfaceKey}
                      workspacePath={workspacePath}
                      onClose={() => setIsBottomPanelOpen(false)}
                      isRunning={runStatus === "running"}
                      onClear={handleClearOutput}
                      onRun={() => void executeCommand("go.run")}
                      onRunWithRace={() => void executeCommand("go.race")}
                      onStop={() => void executeCommand("go.stop")}
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
              className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-(--border-subtle) bg-(--crust)"
            >
              {documentSnapshot.documents.length > 0 && <DocumentTabs snapshot={documentSnapshot} busy={isReading || explorerOperationBusy || gitOperationBusy || isBranchMutationInProgress} activate={path => void handleOpenFile(path)} close={id => void closeDocument(id)} />}
              <header className="editor-toolbar flex flex-wrap items-center justify-between gap-2 border-b border-(--border-subtle) bg-(--mantle) px-3 py-1.5 md:px-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="editor-file-tab text-[12px] font-medium text-[var(--subtext1)] truncate">{editorTitle}</span>
                </div>

                <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-x-auto pb-0.5 md:gap-2">
                  <button
                    className={`flex size-7 cursor-pointer items-center justify-center rounded border border-[var(--border-subtle)] bg-[var(--surface0)] text-[var(--subtext1)] transition-colors duration-100 ease-out hover:bg-[var(--bg-hover)] ${
                      isOpening ? "cursor-not-allowed opacity-60" : ""
                    }`}
                    onClick={() => void executeCommand("workspace.open")}
                    type="button"
                    aria-label="Open workspace folder"
                    title="Choose a Go workspace folder."
                    disabled={isOpening}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  </button>

                  {activeFilePath && (
                    <button
                      className={`flex size-7 cursor-pointer items-center justify-center rounded border transition-colors duration-100 ease-out ${
                        runStatus === "running" || debugUiState === "starting"
                          ? "border-[var(--border-subtle)] bg-[var(--surface0)] text-[var(--overlay2)] cursor-not-allowed"
                          : "border-[var(--border-subtle)] bg-[var(--surface0)] text-[var(--subtext1)] hover:bg-[var(--bg-hover)]"
                      }`}
                      onClick={() => void executeCommand("go.run")}
                      type="button"
                      aria-label="Run active Go file"
                      title="Run the active Go file and show output in the terminal panel."
                      disabled={runStatus === "running" || debugUiState === "starting"}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </button>
                  )}
                  {isGoFile(activeFilePath) && runMode !== "debug" && (
                    <button
                      className={`flex size-7 cursor-pointer items-center justify-center rounded border transition-colors duration-100 ease-out ${
                        runStatus === "running" ||
                        debugUiState === "starting" ||
                        runtimeAvailability === "unavailable"
                          ? "border-[var(--border-subtle)] text-[var(--overlay2)] cursor-not-allowed"
                          : "border-[var(--border-subtle)] text-[var(--subtext1)] hover:bg-[var(--bg-hover)]"
                      }`}
                      onClick={() => void executeCommand("go.race")}
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
                    </button>
                  )}
                  {isGoFile(activeFilePath) && (
                    <button
                      className={`flex size-7 cursor-pointer items-center justify-center rounded border transition-colors duration-100 ease-out ${
                        isDebugSessionBusy || runStatus === "running"
                          ? "border-[var(--border-subtle)] text-[var(--overlay2)] cursor-not-allowed"
                          : "border-[var(--border-subtle)] text-[var(--subtext1)] hover:bg-[var(--bg-hover)]"
                      }`}
                      onClick={() => void executeCommand("debug.startOrContinue")}
                      type="button"
                      aria-label="Debug active Go file"
                      title="Start a debug session for the active Go file."
                      disabled={isDebugSessionBusy || runStatus === "running"}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    </button>
                  )}
                </div>
              </header>

              <div
                data-testid="editor-content-region"
                className="flex min-h-0 flex-1 flex-col overflow-hidden bg-(--crust)"
              >
                {workspacePath && fsSyncError && (
                  <p role="status" className="px-3 py-2 text-xs text-[var(--yellow)]">{fsSyncError}</p>
                )}
                {inactiveDiskConflicts.length > 0 && <div role="status" aria-label="External changes in open tabs" className="flex flex-wrap gap-2 border-b border-(--border) px-3 py-2 text-xs text-(--yellow)">
                  <span>Open tabs changed on disk:</span>
                  {inactiveDiskConflicts.map(conflict => <button key={conflict.id} type="button" disabled={gitOperationBusy || explorerOperationBusy || isReading || documents.saving} onClick={() => void handleOpenFile(conflict.path)} className="underline">Review {conflict.path}{conflict.exists ? "" : " (deleted)"}</button>)}
                </div>}
                {(!workspacePath || !activeFilePath) && (
                  <WelcomeScreen
                    workspacePath={workspacePath}
                    isOpening={isOpening}
                    onOpenWorkspace={handleOpenWorkspace}
                    onQuickOpen={() => { setQuickOpenQuery(""); setQuickOpenSelectedIndex(0); setIsQuickOpenOpen(true); }}
                    onSearch={() => { setActiveTab("search"); setSearchFocusTrigger((n) => n + 1); }}
                    onTerminal={() => { setBottomPanelTab("shell"); setIsBottomPanelOpen(true); }}
                    error={fileError}
                  />
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
                    {externalFile.conflict && <ExternalFileConflict exists={externalFile.conflict.exists} disk={externalFile.conflict.content} editor={latestEditorContentRef.current ?? ""}
                      onReload={() => {
                        if (!window.confirm("Discard your editor edits and reload the reviewed disk version?")) return;
                        const content = externalFile.conflict?.content;
                        if (content == null || documentTransitionRef.current || isSavingRef.current) return;
                        if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
                        savedContentRef.current = content; latestEditorContentRef.current = content;
                        setActiveFileContent(content);  externalFile.clear(); setFileError(null);
                        void externalFile.check();
                      }}
                      onKeep={() => {
                        if (!window.confirm("Replace the reviewed disk version with your editor text?")) return;
                        const disk = externalFile.conflict?.content;
                        const editor = latestEditorContentRef.current;
                        if (disk == null || editor == null || documentTransitionRef.current || isSavingRef.current) return;
                        savedContentRef.current = disk;
                        void persistActiveFileContent(editor).then((saved) => { if (saved) externalFile.clear(); });
                      }}
                      onCopy={() => void navigator.clipboard.writeText(latestEditorContentRef.current ?? "").catch(() => setFileError("Unable to copy editor text."))} />}
                    <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--crust)]">
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                      <div className="flex items-center gap-2 border-b border-(--border-subtle) bg-(--mantle) px-3 py-1">
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
                          ) : null}
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
                            key={documentSnapshot.activeId}
                            sessionState={documentSnapshot.activeId !== null ? documents.editor(documentSnapshot.activeId) : undefined}
                            onSessionDispose={state => { if (documentSnapshot.activeId !== null) documents.retainEditor(documentSnapshot.activeId, state); }}
                            editable={!documents.active?.readOnly && !isBranchMutationInProgress && !gitOperationBusy && !explorerOperationBusy}
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
                            onSave={(content) => { latestEditorContentRef.current = content; void executeCommand("file.save"); }}
                            onChange={handleEditorChange}
                            onRequestCompletions={handleRequestCompletions}
                            externalSearchQuery={editorHighlightQuery}
                            onDocumentSymbolsChange={(symbols) => {
                              setDocumentSymbols(symbols);
                              setIsSymbolsPending(false);
                            }}
                            suppressFindWidget={activeTab === "search"}
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
                      {(isSymbolsPending || documentSymbols.length > 0) ? (
                        <DocumentOutline
                          activeItemFrom={activeDocumentSymbol?.from ?? null}
                          items={documentSymbols}
                          isPending={isSymbolsPending}
                          onJumpToLine={(line) => requestJump(line)}
                        />
                      ) : null}
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

      {isCommandPaletteOpen && <CommandPalette commands={commands} execute={executeCommand} onClose={() => setIsCommandPaletteOpen(false)} />}
      {documentDecision.dialog}
      {isQuickOpenOpen && (
        <Dialog open={true} onOpenChange={setIsQuickOpenOpen} ariaLabel="Quick Open" className="fixed inset-0 z-50 m-0 flex h-dvh w-full justify-center bg-black/40 pt-20" panelClassName="w-full max-w-2xl">
          <div className="pointer-events-auto w-full max-w-2xl px-4">
            <div className="overflow-hidden rounded-lg border border-[var(--border-muted)] bg-[var(--mantle)] shadow-[var(--panel-shadow)]">
              <input
                ref={quickOpenInputRef}
                type="text"
                maxLength={256}
                placeholder="Find file..."
                value={quickOpenQuery}
                onChange={(event) => {
                  setQuickOpenQuery(event.target.value);
                  setQuickOpenSelectedIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setIsQuickOpenOpen(false);
                    return;
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setQuickOpenSelectedIndex((current) =>
                      Math.min(current + 1, Math.max(0, quickOpenFilteredFiles.length - 1))
                    );
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setQuickOpenSelectedIndex((current) => Math.max(0, current - 1));
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const selected = quickOpenFilteredFiles[quickOpenSelectedIndex];
                    if (selected) {
                      handleQuickOpenSelect(selected);
                    }
                  }
                }}
                className="w-full border-b border-[var(--border-subtle)] bg-[var(--crust)] px-3 py-2 text-sm text-[var(--text)] outline-none"
                aria-label="Quick open file"
              />
              <div className="max-h-72 overflow-auto py-1">
                {quickOpenError && <p role="alert" className="px-3 py-2 text-xs text-(--red)">{quickOpenError}</p>}
                {quickOpenNotice && <p role="status" className="px-3 py-2 text-xs text-(--yellow)">{quickOpenNotice}</p>}
                {quickOpenLoading && (
                  <p className="px-3 py-2 text-xs text-[var(--overlay1)]">Indexing files...</p>
                )}
                {!quickOpenLoading && !quickOpenError && quickOpenFilteredFiles.length === 0 && (
                  <p className="px-3 py-2 text-xs text-[var(--overlay1)]">No files found.</p>
                )}
                {!quickOpenLoading &&
                  quickOpenFilteredFiles.map((path, index) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => handleQuickOpenSelect(path)}
                      className={`block w-full px-3 py-1.5 text-left text-xs ${
                        index === quickOpenSelectedIndex
                          ? "bg-[var(--selection-bg)] text-[var(--text)]"
                          : "text-[var(--subtext1)] hover:bg-[var(--bg-hover)]"
                      }`}
                      title={path}
                    >
                      {path}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </Dialog>
      )}

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
              onCancel={cancelBranchSwitch}
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
        <div role="alert" className="absolute bottom-10 left-1/2 z-50 -translate-x-1/2 rounded border border-[var(--red)] bg-[var(--mantle)] px-4 py-2 text-xs text-[var(--red)]">
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
      {safeCloseDialog}
      {replacementReview.dialog}
    </div>
  );
}

export default EditorShell;
