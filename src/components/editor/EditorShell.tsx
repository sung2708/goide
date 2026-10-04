import { useGoToLine } from "../../features/navigation/goToLine";
import type { EditorFindCommands } from "../../features/navigation/editorCommands";
import { useWorkspaceHistory } from "../../features/workspaces/useWorkspaceHistory";
import { DebuggerStartup } from "../../features/debugger/startup";
import { RunOwnership } from "./runOwnership";
import type { SemanticEntryAction } from "../../features/semantics/types";
import { useExecutionPreparation } from "../../features/goProject/useExecutionPreparation";
import { ownsDebuggerWorkspace } from "../../features/debugger/workspace";
import { useInspectionGate } from "../../features/debugger/useInspectionGate";
import DebuggerInspector from "../../features/debugger/DebuggerInspector";
import { open } from "@tauri-apps/plugin-dialog";
import WelcomeScreen from "./WelcomeScreen";
import QuickOpenPicker from "../../features/navigation/QuickOpenPicker";
import { useQuickOpenIndex } from "../../features/navigation/useQuickOpenIndex";
import CommandPalette from "../command-palette/CommandPalette";
import { useCommandRegistry } from "../../features/commands/useCommandRegistry";
import type { Command } from "../../features/commands/registry";
import { useDocumentSession } from "../../features/documents/useDocumentSession";
import { LocationHistory, type SourceLocation } from "../../features/navigation/LocationHistory";
import { useDraftRecovery } from "../../features/documents/useDraftRecovery";
import { exportDocumentCopy } from "../../features/documents/exportCopy";
import { useOpenDocumentDiskSync } from "../../features/documents/useOpenDocumentDiskSync";
import DocumentTabs from "../../features/documents/DocumentTabs";
import { useSaveDecision } from "../../features/documents/useSaveDecision";
import { buildProblems, diagnosticProblems, type Problem } from "../../features/problems/model";
import { useLanguageQueries } from "../../features/language/useLanguageQueries";
import LanguageResults from "../../features/language/LanguageResults";
import { useEditorHover } from "../../features/language/useEditorHover";
import { useEditorSignature } from "../../features/language/useEditorSignature";
import { useLanguageEditReview } from "../../features/language/useLanguageEditReview";
import { useCodeActions } from "../../features/language/useCodeActions";
import LanguageEditReview from "../../features/language/LanguageEditReview";
import { useSavePreparation } from "../../features/language/useSavePreparation";
import { useSettings } from "../../features/settings/useSettings";
import SettingsDialog from "../../features/settings/SettingsDialog";
import { updateService } from "../../features/updates/service";
import { UpdateNotice } from "../../features/updates/UpdatePanel";
import { useStartupUpdates } from "../../features/updates/useStartupUpdates";
import ToolchainDialog from "../../features/settings/ToolchainDialog";
import GoProjectDialog from "../../features/goProject/GoProjectDialog";
import NewGoProjectDialog from "../../features/goProject/NewGoProjectDialog";
import GoTestsDialog from "../../features/goTests/GoTestsDialog";
import { useGoTests } from "../../features/goTests/useGoTests";
import ThemeSwitcher from "../layout/ThemeSwitcher";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLensSignals } from "../../features/concurrency/useLensSignals";
import type { VisibleLineRange } from "../../features/concurrency/signalDensity";
import { useHoverHint } from "../../hooks/useHoverHint";
import {
  activateScopedDeepTrace,
  deactivateDeepTrace,
  cancelDebuggerStartup,
  getRuntimeAvailability,
  getRuntimeSignals,
  listWorkspaceEntries,
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
  const settings = useSettings();
  useStartupUpdates();
  const settingsRef = useRef(settings.values); settingsRef.current = settings.values;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isToolchainOpen, setIsToolchainOpen] = useState(false);
  const [isGoProjectOpen, setIsGoProjectOpen] = useState(false);
  const [isNewGoProjectOpen, setIsNewGoProjectOpen] = useState(false);
  const [newProjectToOpen, setNewProjectToOpen] = useState<string | null>(null);
  const runtimeSignalTimeoutMs = resolveRuntimeSignalTimeoutMs();
  const { session: documents, snapshot: documentSnapshot, workspacePath, setWorkspacePath, activeFilePath, setActiveFilePath, activeFileContent, setActiveFileContent, isDirty, activeFilePathRef, savedContentRef, latestEditorContentRef } = useDocumentSession();
  const navigationHistory = useMemo(() => new LocationHistory(), [workspacePath]);
  const sourceNavigationRef = useRef(0);
  useEffect(() => { sourceNavigationRef.current++; }, [workspacePath]);
  const [isOpening, setIsOpening] = useState(false);
  const documentDecision = useSaveDecision(workspacePath);
  const [fileError, setFileError] = useState<string | null>(null);
  const draftRecovery = useDraftRecovery(documents, documentSnapshot, setFileError, settings.values["files.draftRecovery"]);
  const [isExportingDraft, setIsExportingDraft] = useState(false);
  const [fsSyncError, setFsSyncError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [hasLoadedBottomPanel, setHasLoadedBottomPanel] = useState(false);
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>("logs");
  const [mode, setMode] = useState<"quick-insight" | "deep-trace">(
    "quick-insight"
  );
  const previousModeRef = useRef<"quick-insight" | "deep-trace">("quick-insight");
  const [runtimeAvailability, setRuntimeAvailability] = useState<
    "available" | "unavailable" | "degraded"
  >("unavailable");
  const toolchain = useToolchainStatus();
  const toolchainStatus = toolchain.status;
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
  const executionPreparationRef = useRef<ReturnType<typeof useExecutionPreparation>["prepare"] | null>(null);
  const ownedDebuggerSessionRef = useRef<string | null>(null);
  const debuggerStartupRef = useRef<DebuggerStartup | null>(null);
  if (!debuggerStartupRef.current) debuggerStartupRef.current = new DebuggerStartup(cancelDebuggerStartup);
  const debuggerStateRef = useRef(debuggerState); debuggerStateRef.current = debuggerState;
  const debuggerInspectionGate = useInspectionGate(debuggerState?.stopToken);
  const debuggerStopTokenRef = useRef<string | null>(null);
  debuggerStopTokenRef.current = debuggerInspectionGate.token;
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
  const [requestedGitView, setRequestedGitView] = useState<{ view: "changes" | "graph" | "stashes"; id: number }>();
  const openGitView = (view: "changes" | "graph" | "stashes") => {
    setActiveTab("git");
    setRequestedGitView(current => ({ view, id: (current?.id ?? 0) + 1 }));
  };
  const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);
  const editorFindCommands = useRef<EditorFindCommands | null>(null);
  const onEditorCommands = useCallback((commands: EditorFindCommands | null) => { editorFindCommands.current = commands; }, []);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
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
    transaction: (operation) => gitDocumentTransaction(operation, false, true),
    isDirty: (path) => documents.snapshot().documents.some(document => pathsReferToSameFile(document.path, path) && document.text !== document.baseline),
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
  const [editorSearchTarget, setEditorSearchTarget] = useState<{ file: string; line: number; from: number; to: number; preview: string } | null>(null);
  const searchNavigation = useRef(0);
  useEffect(() => { searchNavigation.current++; setEditorSearchTarget(null); setEditorHighlightQuery(null); }, [workspacePath]);
  const submitWorkspaceSearch = useCallback((query: string, options: import("../../lib/ipc/types").WorkspaceSearchOptions) => {
    searchNavigation.current++; setEditorSearchTarget(null); setEditorHighlightQuery(null); return handleWorkspaceSearch(query, options);
  }, [handleWorkspaceSearch]);
  const [documentSymbols, setDocumentSymbols] = useState<DocumentOutlineItem[]>([]);
  const [isSymbolsPending, setIsSymbolsPending] = useState(false);
  const [cursorOffset, setCursorOffset] = useState<number | null>(null);
  const cursorOffsetRef = useRef(cursorOffset); cursorOffsetRef.current = cursorOffset;
  const navigationOrigin = useCallback((): SourceLocation | null => {
    const doc = documents.active;
    if (!doc) return null;
    const offset = Math.max(0, Math.min(cursorOffsetRef.current ?? doc.view.head, doc.text.length));
    const preceding = doc.text.slice(0, offset);
    return { file: doc.path, line: preceding.split("\n").length, column: offset - preceding.lastIndexOf("\n") };
  }, [documents]);
  const savePreparation = useSavePreparation(documents, documentSnapshot, settings.values, setFileError);
  const language = useLanguageQueries(documentSnapshot, cursorOffset, setFileError);
  const requestEditorHover = useEditorHover(documentSnapshot, setFileError);
  const requestEditorSignature = useEditorSignature(documentSnapshot, setFileError);
  const [signatureRequestTrigger, setSignatureRequestTrigger] = useState(0);
  const codeActions = useCodeActions(documents, documentSnapshot, cursorOffset, () => {
    if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
    setProblemRun(null); resetDiagnosticsState(); invalidateCompletionRequests(); resetCompletionAvailability(); setSaveStatus("idle"); setAnalysisRevision(value => value + 1);
  }, setFileError, () => diagnostics);
  const languageEdits = useLanguageEditReview(documents, documentSnapshot, () => {
    if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
    setProblemRun(null);
    resetDiagnosticsState();
    invalidateCompletionRequests();
    resetCompletionAvailability();
    setSaveStatus("idle");
    setAnalysisRevision(revision => revision + 1);
  }, cursorOffset, setFileError);
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
    onError: setFileError,
  });
  const deepTraceRequestIdRef = useRef(0);
  const runtimeCheckRequestIdRef = useRef(0);
  const runtimeSignalRequestIdRef = useRef(0);
  const runtimeSignalInFlightRef = useRef(false);
  const runtimeSignalPendingRequestCountRef = useRef(0);
  const debugStopInFlightRef = useRef(false);
  const runStopInFlightRef = useRef(false);
  const runOwnershipRef = useRef<RunOwnership | null>(null);
  if (!runOwnershipRef.current) runOwnershipRef.current = new RunOwnership(stopCurrentRun);
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
      if (ownedDebuggerSessionRef.current) void deactivateDeepTrace({ sessionId: ownedDebuggerSessionRef.current });
      setDeepTraceScope(null);
      setActiveBlockedSignal(null);
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      void debuggerStartupRef.current?.cancel().catch(() => { /* native retains teardown for retry */ });
      if (ownedDebuggerSessionRef.current) void deactivateDeepTrace({ sessionId: ownedDebuggerSessionRef.current });
    };
  }, []);

  // Clear editor timers on unmount to prevent setState on unmounted component
  useEffect(() => {
    editorMountedRef.current = true;
    return () => {
      editorMountedRef.current = false;
      void runOwnershipRef.current?.stop().catch(() => { /* native retains failed cleanup for shutdown retry */ });
      if (saveStatusTimerRef.current !== null) {
        clearTimeout(saveStatusTimerRef.current);
      }
      if (autoSaveDebounceRef.current !== null) {
        clearTimeout(autoSaveDebounceRef.current);
      }
    };
  }, []);

  const { files: quickOpenFilteredFiles, loading: quickOpenLoading, error: quickOpenError, notice: quickOpenNotice, remember: rememberOpenedFile } = useQuickOpenIndex(workspacePath, explorerRevision, isQuickOpenOpen, quickOpenQuery);

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


  const requestJump = useCallback((targetLine: number | null, column = 1, record = true) => {
    if (targetLine === null || targetLine < 1 || !Number.isInteger(targetLine) || latestEditorContentRef.current === null) return false;
    const maxLine = latestEditorContentRef.current.split("\n").length;
    if (targetLine > maxLine) return false;
    jumpRequestIdRef.current += 1;
    if (record) sourceNavigationRef.current++;
    if (record && activeFilePathRef.current) navigationHistory.visit(navigationOrigin(), { file: activeFilePathRef.current, line: targetLine, column });
    setJumpRequest({
      line: targetLine,
      column,
      requestId: jumpRequestIdRef.current,
    });
    return true;
  }, [latestEditorContentRef, activeFilePathRef, navigationHistory, navigationOrigin]);

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
    const startupId = crypto.randomUUID();

    try {
      const response = await executionPreparationRef.current!(() => debuggerStartupRef.current!.start({ workspaceRoot: requestWorkspacePath, requestId: startupId }, () => activateScopedDeepTrace({
        requestId: startupId,
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
      }), message => { if (editorMountedRef.current && workspacePathRef.current === requestWorkspacePath) setFileError(message); }), ["go", "delve"]);
      if (
        !editorMountedRef.current ||
        requestId !== deepTraceRequestIdRef.current ||
        workspacePathRef.current !== requestWorkspacePath ||
        activeFilePathRef.current !== requestFilePath
      ) {
        if (response.data?.debuggerState?.sessionId) void deactivateDeepTrace({ sessionId: response.data.debuggerState.sessionId });
        return;
      }

      if (response.error?.code === "debug_startup_cancelled") { setFileError(null); return; }
      if (response.ok && response.data?.mode === "deep-trace") {
        debuggerStartupRef.current!.adopt(startupId);
        if (response.data.debuggerState) {
          ownedDebuggerSessionRef.current = response.data.debuggerState.sessionId ?? null;
          debuggerStateRef.current = response.data.debuggerState;
          setDebuggerState(response.data.debuggerState);
        }
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

    if (!editorMountedRef.current || workspacePathRef.current !== requestWorkspacePath || activeFilePathRef.current !== requestFilePath || requestId !== deepTraceRequestIdRef.current) return;
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
        const document = documents.active;
        if (!document || document.path !== currentPath || document.text !== content) throw new Error("Editor changed before save. Save again.");
        await documents.save(document.id, writeWorkspaceFile, savePreparation.prepare);
        if (!editorMountedRef.current || workspacePathRef.current !== saveWorkspacePath || activeFilePathRef.current !== saveFilePath) return false;
        didWrite = true;
        const writtenContent = documents.active?.baseline ?? content;
        setFileError(null);
        const hasNewerEdits = latestEditorContentRef.current !== writtenContent;
        setSaveStatus(hasNewerEdits ? "idle" : "saved");
        if (!hasNewerEdits) saveStatusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
        await refreshDiagnosticsForFile(saveWorkspacePath, saveFilePath);
        if (editorMountedRef.current && workspacePathRef.current === saveWorkspacePath && activeFilePathRef.current === saveFilePath) setAnalysisRevision(current => current + 1);
        return true;
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
        if (error instanceof Error && "code" in error && error.code === "external_file_conflict") setTimeout(() => void externalFile.check(), 0);
        console.error("Failed to save file:", error);
        return false;
      } finally {
        isSavingRef.current = false;
        const newerContent = latestEditorContentRef.current;
        if (
          settingsRef.current["files.autoSave"] === "afterDelay" && editorMountedRef.current && didWrite && newerContent !== null && newerContent !== savedContentRef.current &&
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
          }, settingsRef.current["files.autoSaveDelay"]);
        }
      }
    },
    [workspacePath, activeFilePath, refreshDiagnosticsForFile, externalFile.check, documents, savePreparation.prepare]
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
      await documents.saveAll(writeWorkspaceFile, savePreparation.prepare);
      setSaveStatus("saved"); setFileError(null);
      if (workspacePathRef.current && activeFilePathRef.current) void refreshDiagnosticsForFile(workspacePathRef.current, activeFilePathRef.current);
      return true;
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Cannot save all documents.");
      setSaveStatus("error"); setTimeout(() => void externalFile.check(), 0); return false;
    } finally { isSavingRef.current = false; }
  }, [documents, refreshDiagnosticsForFile, externalFile.check, activeFilePathRef, savePreparation.prepare]);

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
    busy: () => isNewGoProjectOpen || documentTransitionRef.current || isSavingRef.current || gitOperationBusy,
    registerInstall: updateService.registerInstall,
    install: updateService.install,
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

  const executionDocumentTransaction = useGitDocumentTransaction({
    root: workspacePathRef, lock: documentTransitionRef, mutation: branchMutationRef,
    preserve: preserveAllDocuments,
    isPreserved: () => !documents.dirty && !isSavingRef.current && !hasConflictDrafts(workspacePathRef.current),
    setBusy: setExplorerOperationBusy,
    canChangeFiles: () => runStatus !== "running" && debugUiState !== "running" && debugUiState !== "paused" && debugUiState !== "stopping",
  });
  const executionPreparation = useExecutionPreparation({
    root: workspacePath,
    paths: { go: settings.values["go.executablePath"], gopls: settings.values["go.goplsPath"], dlv: settings.values["debug.delvePath"] },
    transaction: executionDocumentTransaction, cancelSave: savePreparation.cancel,
  });
  executionPreparationRef.current = executionPreparation.prepare;

  const handleRunFile = useCallback(async (modeToRun: RunMode = "standard") => {
    if (documentTransitionRef.current || runStopInFlightRef.current || debugUiState === "starting") {
      return;
    }
    if (!workspacePath || !activeFilePath) return;
    const isRaceRun = modeToRun === "race";
    const runId = globalThis.crypto.randomUUID();
    activeRunIdRef.current = runId;
    activeRunModeRef.current = modeToRun;
    activeRunTargetFilePathRef.current = activeFilePath;
    clearPendingRunOutputBuffer();

    try {
      const resp = await executionPreparation.prepare(async () => {
        setRunOutput([]);
        setRunStatus("running");
        setProblemRun({ root: workspacePath, id: runId });
        setRunMode(modeToRun);
        setIsBottomPanelOpen(true);
        setBottomPanelTab("logs");
        raceRunCaptureRef.current = { isRaceRun, sawWarning: false, matchedLines: new Set<number>() };
        setRaceSignals([]);
        return runOwnershipRef.current!.start({ workspaceRoot: workspacePath, runId }, () => modeToRun === "race"
          ? runWorkspaceFileWithRace(workspacePath, activeFilePath, runId)
          : runWorkspaceFile(workspacePath, activeFilePath, runId), message => {
            if (editorMountedRef.current && activeRunIdRef.current === runId) {
              setRunStatus("running"); setRunOutput([{ runId, line: message, stream: "stderr" }]);
            }
          });
      }, ["go"]);
      if (!resp.ok) {
        if (resp.error?.code === "run_start_cancelled") {
          if (editorMountedRef.current && workspacePathRef.current === workspacePath && activeRunIdRef.current === runId) setRunStatus("done");
          return;
        }
        if (!editorMountedRef.current || workspacePathRef.current !== workspacePath || activeRunIdRef.current !== runId) {
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
      if (!editorMountedRef.current || workspacePathRef.current !== workspacePath || activeRunIdRef.current !== runId) {
        return;
      }
      setRunStatus("error");
      setIsBottomPanelOpen(true); setBottomPanelTab("logs");
      setRunOutput([{
        runId,
        line: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
        stream: "stderr"
      }]);
    }
  }, [workspacePath, activeFilePath, executionPreparation.prepare, debugUiState]);

  const handleRunFileStandard = useCallback(() => {
    void handleRunFile("standard");
  }, [handleRunFile]);

  const handleStartDebug = useCallback(async (testName: string | null = null) => {
    if (documentTransitionRef.current || runStopInFlightRef.current || debugStopInFlightRef.current || (runStatus === "running" && runMode !== "debug")) {
      return;
    }
    if (!workspacePath || !activeFilePath || !isGoFile(activeFilePath)) return;
    setDebugUiState("starting");
    setDebugFailure(null);

    const startupId = crypto.randomUUID();
    let response: Awaited<ReturnType<typeof startDebugSession>>;
    try {
      response = await executionPreparation.prepare(() => debuggerStartupRef.current!.start({ workspaceRoot: workspacePath, requestId: startupId }, () => startDebugSession({
        requestId: startupId,
        workspaceRoot: workspacePath,
        relativePath: activeFilePath,
        ...(testName ? { testName } : {}),
      }), message => { if (editorMountedRef.current && workspacePathRef.current === workspacePath) setFileError(message); }), ["go", "delve"]);
    } catch (error) {
      if (!editorMountedRef.current || workspacePathRef.current !== workspacePath) return;
      setDebugUiState("failed");
      setDebugFailure({
        code: "debug_session_start_failed",
        title: "Unable to start debug session",
        message: error instanceof Error ? error.message : "Unknown debug startup failure.",
        details: null,
      });
      return;
    }

    if (!editorMountedRef.current || workspacePathRef.current !== workspacePath) {
      if (response.data?.debuggerState?.sessionId) void deactivateDeepTrace({ sessionId: response.data.debuggerState.sessionId });
      return;
    }
    if (!response.ok) {
      if (response.error?.code === "debug_startup_cancelled") { setFileError(null); setDebugUiState("idle"); return; }
      setDebugUiState("failed");
      setDebugFailure({
        code: response.error?.code ?? "debug_session_start_failed",
        title: "Unable to start debug session",
        message: response.error?.message ?? "Unknown debug startup failure.",
        details: null,
      });
      return;
    }

    debuggerStartupRef.current!.adopt(startupId);
    if (response.data?.debuggerState) {
      ownedDebuggerSessionRef.current = response.data.debuggerState.sessionId ?? null;
      debuggerStateRef.current = response.data.debuggerState;
      setDebuggerState(response.data.debuggerState);
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
  }, [workspacePath, activeFilePath, runStatus, runMode, executionPreparation.prepare]);

  const handleStopDebug = useCallback(async () => {
    if (debugStopInFlightRef.current) {
      return;
    }
    debugStopInFlightRef.current = true;
    setDebugUiState("stopping");
    try {
      const deactivateResponse = await deactivateDeepTrace({ sessionId: ownsDebuggerWorkspace(workspacePathRef.current, debuggerStateRef.current) ? debuggerStateRef.current?.sessionId ?? null : null });
      if (!deactivateResponse.ok) {
        throw new Error(deactivateResponse.error?.message ?? "Failed to stop debug session.");
      }
      ownedDebuggerSessionRef.current = null;
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
              activeFilePath && ownsDebuggerWorkspace(workspacePath, state.data)
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
  }, [activeFilePath, runStatus, runMode, workspacePath]);

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
        ownsDebuggerWorkspace(workspacePath, state.data) ? state.data.breakpoints
          .filter((breakpoint) => breakpoint.relativePath === activeFilePath)
          .map((breakpoint) => breakpoint.line) : [],
      );
    });

    return () => {
      isCancelled = true;
    };
  }, [activeFilePath, workspacePath]);

  const handleToggleBreakpoint = useCallback(async (line: number) => {
    if (!workspacePath || !activeFilePath) return;
    const sessionId = debuggerStateRef.current?.sessionActive ? debuggerStateRef.current.sessionId ?? null : null;
    try {
      const resp = await debuggerToggleBreakpoint({
        workspaceRoot: workspacePath, sessionId,
        relativePath: activeFilePath,
        line,
      });
      if (workspacePathRef.current !== workspacePath || activeFilePathRef.current !== activeFilePath || (debuggerStateRef.current?.sessionActive ? debuggerStateRef.current.sessionId ?? null : null) !== sessionId) return;
      if (!resp.ok) { setFileError(resp.error?.message ?? "Unable to register breakpoint."); return; }
      if (resp.data && ownsDebuggerWorkspace(workspacePath, resp.data)) {
        setDebuggerState(resp.data);
        setBreakpoints(
          resp.data.breakpoints
            .filter((breakpoint) => breakpoint.relativePath === activeFilePath)
            .map((breakpoint) => breakpoint.line),
        );
      }
    } catch (err) {
      if (workspacePathRef.current === workspacePath && activeFilePathRef.current === activeFilePath) setFileError(err instanceof Error ? err.message : "Unable to register breakpoint.");
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
  const runObservedDebugControl = async (operation: typeof debuggerContinue) => {
    try {
      const result = await debuggerInspectionGate.control(() => ownsDebuggerWorkspace(workspacePath, debuggerState) && debuggerState?.sessionId ? operation({
        workspaceRoot: workspacePath!, sessionId: debuggerState.sessionId, stopToken: debuggerState.stopToken ?? null,
      }) : Promise.resolve({ ok: false, error: { code: "debugger_context_changed", message: "Refresh the debugger's observed workspace/session before controlling execution." } }), (result, captured) => captured !== null && result.data?.sessionId === debuggerState?.sessionId && result.data?.stopToken === captured);
      if (!result.ok && workspacePathRef.current === workspacePath) setFileError(result.error?.message ?? "Debugger control failed.");
      return result;
    } catch (error) {
      if (workspacePathRef.current === workspacePath) setFileError(error instanceof Error ? error.message : "Debugger control failed.");
      return { ok: false };
    }
  };
  const debuggerControlsUnavailable = debuggerInspectionGate.pending || !ownsDebuggerWorkspace(workspacePath, debuggerState) || !debuggerState?.sessionId;
  const handleToggleDebugPause = () => runObservedDebugControl(isDebugPaused ? debuggerContinue : debuggerPause);

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
      await runOwnershipRef.current!.stop();
      if (activeRunIdRef.current === stoppedId) {
        activeRunIdRef.current = null;
        clearPendingRunOutputBuffer();
        setRunStatus("done");
      }
    } finally { runStopInFlightRef.current = false; }
  }, [clearPendingRunOutputBuffer]);

  useEffect(() => {
    if (runStatus === "done" || runStatus === "error") {
      if (runOwnershipRef.current?.cleanupPending()) setRunStatus("running");
      else runOwnershipRef.current?.retire(activeRunIdRef.current);
    }
  }, [runStatus]);

  const handleEditorChange = useCallback((value: string) => {
    if (branchMutationRef.current || documents.active?.readOnly || value === latestEditorContentRef.current) return;
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
    if (settingsRef.current["files.autoSave"] !== "afterDelay") { autoSaveDebounceRef.current = null; return; }
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
    }, settingsRef.current["files.autoSaveDelay"]);
  }, [documents, forgetDiagnostics, clearDiagnostics, invalidateDiagnosticsRequests, persistActiveFileContent, workspacePath, activeFilePath]);

  useEffect(() => {
    if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
  }, [settings.values["files.autoSave"], settings.values["files.autoSaveDelay"]]);
  useEffect(() => {
    const saveOnBlur = () => {
      if (settingsRef.current["files.autoSave"] !== "onFocusChange" || documentTransitionRef.current || branchMutationRef.current || isSavingRef.current) return;
      const content = latestEditorContentRef.current;
      if (content !== null && content !== savedContentRef.current && !documents.active?.readOnly) void persistActiveFileContent(content);
    };
    const focusOut = (event: FocusEvent) => {
      const editor = event.target instanceof HTMLElement ? event.target.closest(".cm-editor") : null;
      if (editor && (!(event.relatedTarget instanceof HTMLElement) || !editor.contains(event.relatedTarget))) saveOnBlur();
    };
    window.addEventListener("blur", saveOnBlur); window.addEventListener("focusout", focusOut);
    return () => { window.removeEventListener("blur", saveOnBlur); window.removeEventListener("focusout", focusOut); };
  }, [documents, latestEditorContentRef, savedContentRef, persistActiveFileContent]);

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

  const handleOpenWorkspace = useCallback(async (requestedPath?: string | null): Promise<boolean> => {
    if (isOpening || documentTransitionRef.current) {
      return false;
    }

    documentTransitionRef.current = true;
    setIsOpening(true);
    try {
      const selected = requestedPath === null || typeof requestedPath === "string" ? requestedPath : await open({
        directory: true,
        multiple: false,
        title: "Open Workspace",
      });

      if (!selected && requestedPath !== null) {
        return false;
      }

      const resolvedPath = Array.isArray(selected) ? selected[0] : selected;
      if (typeof resolvedPath === "string" || resolvedPath === null) {
        if (resolvedPath !== null) {
          const validation = await listWorkspaceEntries(resolvedPath);
          if (!validation.ok) throw new Error(validation.error?.message ?? "Workspace is unavailable. Choose its new location with Open Workspace.");
        }
        if (autoSaveDebounceRef.current !== null) { clearTimeout(autoSaveDebounceRef.current); autoSaveDebounceRef.current = null; }
        branchMutationRef.current = true; setExplorerOperationBusy(true);
        const choice = documents.dirty || hasConflictDrafts(workspacePathRef.current)
          ? await documentDecision.ask("Save all editor and conflict-result changes before changing workspace?") : "save";
        if (choice === "cancel") return false;
        if (choice === "save" && !(await preserveAllDocuments())) return false;
        await runOwnershipRef.current!.stop();
        if (ownedDebuggerSessionRef.current) {
          const stopped = await deactivateDeepTrace({ sessionId: ownedDebuggerSessionRef.current });
          if (!stopped.ok) throw new Error(stopped.error?.message ?? "Unable to confirm debugger cleanup before changing workspace.");
          ownedDebuggerSessionRef.current = null;
          setDebuggerState(null); setDebugUiState("idle");
        }
        activeRunIdRef.current = null; clearPendingRunOutputBuffer(); setRunStatus("idle");
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
        return true;
      }
      return false;
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Unable to change workspace safely.");
      console.error("Failed to open workspace dialog:", error);
      return false;
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

  useEffect(() => {
    if (!newProjectToOpen || isOpening || isNewGoProjectOpen) return;
    setNewProjectToOpen(null);
    if (workspacePath === newProjectToOpen) void handleOpenFile("main.go");
  }, [newProjectToOpen, workspacePath, isOpening, isNewGoProjectOpen, handleOpenFile]);
  const workspaceHistory = useWorkspaceHistory(documents, documentSnapshot, handleOpenWorkspace, setFileError);
  const navigateSourceLocation = async (location: SourceLocation) => {
    const generation = ++sourceNavigationRef.current;
    const root = workspacePathRef.current, origin = navigationOrigin();
    await handleOpenFile(location.file);
    if (generation !== sourceNavigationRef.current || workspacePathRef.current !== root || activeFilePathRef.current !== location.file) return;
    if (requestJump(location.line, location.column, false)) {
      navigationHistory.visit(origin, location);
      setEditorSearchTarget(null); setEditorHighlightQuery(null);
    }
  };
  const navigateHistory = async (direction: -1 | 1) => {
    const generation = ++sourceNavigationRef.current;
    const target = navigationHistory.peek(direction), root = workspacePathRef.current;
    if (!target) return;
    await handleOpenFile(target.file);
    if (generation !== sourceNavigationRef.current || workspacePathRef.current !== root || activeFilePathRef.current !== target.file || navigationHistory.peek(direction) !== target) return;
    const lines = latestEditorContentRef.current?.split("\n") ?? [];
    const line = Math.min(target.line, lines.length), column = Math.min(target.column, (lines[line - 1]?.length ?? 0) + 1);
    if (requestJump(line, column, false)) {
      navigationHistory.move(direction); setEditorSearchTarget(null); setEditorHighlightQuery(null);
    }
  };

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
      if (choice === "save") await documents.save(id, writeWorkspaceFile, savePreparation.prepare);
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
  const moduleDocumentTransaction = useGitDocumentTransaction({
    root: workspacePathRef, lock: documentTransitionRef, mutation: branchMutationRef,
    preserve: preserveAllDocuments,
    isPreserved: () => !isSavingRef.current && !documents.dirty && !hasConflictDrafts(workspacePathRef.current),
    setBusy: setGitOperationBusy,
    canChangeFiles: () => runStatus !== "running" && !isDebugSessionBusy,
  });

  const [isGoTestsOpen, setIsGoTestsOpen] = useState(false);
  const testDirectory = activeFilePath?.replace(/\\/g, "/").includes("/") ? activeFilePath.replace(/\\/g, "/").split("/").slice(0, -1).join("/") : ".";
  const goTests = useGoTests({ root: workspacePath, transaction: moduleDocumentTransaction, cancelPreparation: savePreparation.cancel, onChanged: root => { if (workspacePathRef.current === root) { setExplorerRevision(current => current + 1); void reloadGitState(root); } } });
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

  const commandBusy = isNewGoProjectOpen || documentTransitionRef.current || branchMutationRef.current || runStopInFlightRef.current;
  const goToLine = useGoToLine(`${workspacePath}\u0000${activeFilePath}`, activeFileContent ?? "", selectedLine ?? 1, !!activeFilePath && !commandBusy, requestJump);
  const problems = useMemo(() => [
    ...Object.entries(knownDiagnostics)
      .filter(([file]) => !documentSnapshot.documents.some(document => document.path === file && document.text !== document.baseline))
      .flatMap(([file, values]) => diagnosticProblems(file, values)),
    ...(documents.dirty || problemRun?.root !== workspacePath ? [] : buildProblems(workspacePath, runOutput.filter(entry => entry.runId === problemRun?.id))),
  ], [documents, documentSnapshot, knownDiagnostics, workspacePath, runOutput, problemRun]);
  const selectedProblemRef = useRef<string | null>(null);
  const navigateProblem = (problem: Problem) => {
    selectedProblemRef.current = problem.id;
    void navigateSourceLocation({ file: problem.file, line: problem.line, column: problem.column });
  };
  const navigateAdjacentProblem = (direction: number) => {
    if (problems.length === 0) return;
    const index = problems.findIndex(problem => problem.id === selectedProblemRef.current);
    navigateProblem(problems[index < 0 ? (direction > 0 ? 0 : problems.length - 1) : (index + direction + problems.length) % problems.length]);
  };
  const debugStartDisabled = !workspacePath || !isGoFile(activeFilePath) || isDebugSessionBusy || debugStopInFlightRef.current || runStatus === "running" || commandBusy;
  const runDisabled = !workspacePath || !isGoFile(activeFilePath) || runStatus === "running" || isDebugSessionBusy || commandBusy;
  const handleEntryAction = useCallback((action: SemanticEntryAction, intent: "run" | "debug", source: string) => {
    if (!workspacePath || workspacePathRef.current !== workspacePath || activeFilePathRef.current !== activeFilePath || source !== latestEditorContentRef.current || commandBusy || runStatus === "running" || isDebugSessionBusy) return;
    if (action.kind === "test") {
      if (!activeFilePath?.endsWith("_test.go")) return;
      if (intent === "debug") void handleStartDebug(action.name);
      else { setIsGoTestsOpen(true); void goTests.run("package", testDirectory, action.name); }
    } else if (!activeFilePath?.endsWith("_test.go")) {
      if (intent === "debug") void handleStartDebug(); else handleRunFileStandard();
    }
  }, [workspacePath, activeFilePath, commandBusy, runStatus, isDebugSessionBusy, goTests.run, testDirectory, handleStartDebug, handleRunFileStandard]);
  const commands: Command[] = [
    { id: "editor.navigateBack", title: "Navigate Back", category: "Editor", shortcut: "Alt+ArrowLeft", allowInInput: true, disabled: commandBusy || !navigationHistory.peek(-1) ? "No previous source location." : undefined, run: () => navigateHistory(-1) },
    { id: "editor.navigateForward", title: "Navigate Forward", category: "Editor", shortcut: "Alt+ArrowRight", allowInInput: true, disabled: commandBusy || !navigationHistory.peek(1) ? "No next source location." : undefined, run: () => navigateHistory(1) },
    { id: "view.focusMode", title: "Toggle Focus Mode", category: "View", shortcut: "Mod+Shift+Enter", run: () => setIsFocusMode(value => !value) },
    { id: "editor.goToLine", title: "Go to Line", category: "Editor", shortcut: "Mod+g", disabled: !activeFilePath || commandBusy ? "Open a document and wait for document operations." : undefined, run: goToLine.open },
    ...(["find", "replace", "next", "previous"] as const).map(kind => ({ id: `editor.${kind}`, title: kind === "find" ? "Find in File" : kind === "replace" ? "Replace in File" : kind === "next" ? "Find Next" : "Find Previous", category: "Editor", shortcut: kind === "find" ? "Mod+f" : kind === "replace" ? "Mod+h" : kind === "next" ? "F3" : "Shift+F3", disabled: !activeFilePath || commandBusy ? "Open a document and wait for document operations." : undefined, run: () => { if (!editorFindCommands.current) throw new Error("Editor is not ready."); if (kind === "find" || kind === "replace") { setActiveTab("explorer"); setEditorSearchTarget(null); setEditorHighlightQuery(null); } editorFindCommands.current[kind](); } })),
    { id: "workspace.replace", allowInInput: true, title: "Replace in Files", category: "Search", shortcut: "Mod+Shift+h", run: () => { setIsFocusMode(false); setActiveTab("search"); setSearchFocusTrigger(value => value + 1); } },
    { id: "workbench.commands", allowInInput: true, title: "Show Command Palette", shortcut: "Mod+Shift+p", run: () => setIsCommandPaletteOpen(true) },
    { id: "preferences.open", allowInInput: true, title: "Open Settings", shortcut: "Mod+,", run: () => setIsSettingsOpen(true) },
    { id: "go.toolchain", title: "Go: Inspect Toolchain", run: () => setIsToolchainOpen(true) },
    { id: "app.checkUpdates", title: "Goro: Check for Updates", run: () => { setIsSettingsOpen(true); void updateService.check(settings.values["updates.channel"] === "default" ? undefined : settings.values["updates.channel"]); } },
    { id: "app.about", title: "Goro: About", run: () => setIsSettingsOpen(true) },
    { id: "go.project", title: "Go: Inspect Project and Environment", disabled: !workspacePath ? "Open a workspace first." : undefined, run: () => setIsGoProjectOpen(true) },
    { id: "git.openSourceControl", title: "Git: Open Source Control", shortcut: "Mod+Shift+g", run: () => openGitView("changes") },
    { id: "git.openGraph", title: "Git: Open Git Graph", disabled: !workspacePath ? "Open a repository workspace first." : undefined, run: () => openGitView("graph") },
    { id: "git.stash", title: "Git: Open Stashes", disabled: !workspacePath ? "Open a repository workspace first." : undefined, run: () => openGitView("stashes") },
    { id: "workspace.open", title: "Open Workspace Folder", shortcut: "Mod+o", disabled: commandBusy ? "A document operation is in progress." : undefined, run: () => handleOpenWorkspace() },
    { id: "workspace.newGoProject", title: "New Go Project", category: "Workspace", disabled: commandBusy || runStatus === "running" || isDebugSessionBusy ? "Finish document operations and stop Run/Debug first." : undefined, run: () => setIsNewGoProjectOpen(true) },
    { id: "workspace.close", title: "Close Workspace", shortcut: "Mod+Shift+w", disabled: !workspacePath || commandBusy ? "Open a workspace and finish document operations." : undefined, run: () => handleOpenWorkspace(null) },
    { id: "file.quickOpen", allowInInput: true, title: "Quick Open File", shortcut: "Mod+p", disabled: !workspacePath ? "Open a workspace first." : undefined, run: () => { setQuickOpenQuery(""); setIsQuickOpenOpen(true); } },
    { id: "file.save", title: "Save Active File", shortcut: "Mod+s", disabled: !activeFilePath || documents.active?.readOnly || commandBusy || isSavingRef.current ? "Open an editable file and wait for document operations." : undefined, run: () => handleSaveFile(latestEditorContentRef.current ?? "") },
    { id: "file.cancelSavePreparation", title: "Cancel Save Preparation", disabled: !savePreparation.isPreparing ? "No Go save preparation is running." : undefined, run: savePreparation.cancel },
    { id: "file.saveAll", title: "Save All Files", shortcut: "Ctrl+Alt+s", disabled: !workspacePath || commandBusy || isSavingRef.current ? "Open a workspace and wait for document operations." : undefined, run: preserveAllDocuments },
    { id: "file.exportCopy", title: "Save Copy of Active Document…", category: "File", shortcut: "Mod+Shift+s", disabled: !documents.active || commandBusy || isExportingDraft ? "Open a document and wait for document operations." : undefined, run: async () => {
      const draft = documents.active;
      if (!draft) return;
      setIsExportingDraft(true);
      try { await exportDocumentCopy(draft.path, draft.text); }
      finally { setIsExportingDraft(false); }
    } },
    { id: "file.recoverDrafts", title: "Review Stored Drafts", category: "File", run: draftRecovery.open },
    { id: "file.close", title: "Close Active Editor Tab", shortcut: "Mod+w", disabled: documentSnapshot.activeId === null || commandBusy || isSavingRef.current ? "Open a file and wait for document operations." : undefined, run: () => documentSnapshot.activeId !== null ? closeDocument(documentSnapshot.activeId) : undefined },
    { id: "workspace.search", allowInInput: true, title: "Search Workspace", shortcut: "Mod+Shift+f", run: () => { setIsFocusMode(false); setActiveTab("search"); setSearchFocusTrigger(value => value + 1); } },
    { id: "workbench.problems", title: "Show Problems", shortcut: "Mod+Shift+m", run: () => { setIsFocusMode(false); setIsBottomPanelOpen(true); setBottomPanelTab("problems"); } },
    ...(["definition", "references", "hover"] as const).map(kind => ({ id: `language.${kind}`, title: kind === "definition" ? "Go to Definition" : kind === "references" ? "Find References" : "Show Symbol Information", shortcut: kind === "definition" ? "F12" : kind === "references" ? "Shift+F12" : undefined, disabled: !workspacePath || !isGoFile(activeFilePath) || cursorOffset === null || commandBusy ? "Place the cursor in a Go document and wait for document operations." : undefined, run: () => language.query(kind) })),
    { id: "language.signature", title: "Show Signature Help", shortcut: "Mod+Shift+Space", disabled: !workspacePath || !isGoFile(activeFilePath) || cursorOffset === null || commandBusy ? "Place the cursor in a Go document and wait for document operations." : undefined, run: () => setSignatureRequestTrigger(value => value + 1) },
    { id: "language.format", title: "Format Document", shortcut: "Shift+Alt+f", disabled: !workspacePath || !isGoFile(activeFilePath) || documents.active?.readOnly || documents.saving || commandBusy ? "Open a writable Go document and wait for document operations." : undefined, run: languageEdits.format },
    { id: "language.imports", title: "Organize Imports", disabled: !workspacePath || !isGoFile(activeFilePath) || documents.active?.readOnly || documents.saving || commandBusy ? "Open a writable Go document and wait for document operations." : undefined, run: languageEdits.organizeImports },
    { id: "language.quickFix", title: "Quick Fix / Code Actions", shortcut: "Mod+.", disabled: !workspacePath || !isGoFile(activeFilePath) || documents.active?.readOnly || documents.saving || cursorOffset === null || commandBusy ? "Place the cursor in a writable Go document and wait for document operations." : undefined, run: codeActions.open },
    { id: "language.rename", title: "Rename Symbol", shortcut: "F2", disabled: !workspacePath || !isGoFile(activeFilePath) || documents.active?.readOnly || documents.saving || cursorOffset === null || commandBusy ? "Place the cursor in a writable Go document and wait for document operations." : undefined, run: languageEdits.beginRename },
    { id: "go.tests", title: "Go: Open Test Runner", disabled: !workspacePath ? "Open a Go workspace first." : undefined, run: () => setIsGoTestsOpen(true) },
    { id: "go.testPackage", title: "Go: Test Current Package", disabled: !workspacePath || !isGoFile(activeFilePath) || commandBusy || runStatus === "running" || isDebugSessionBusy ? "Open a Go file and finish document/Run/Debug operations." : undefined, run: () => { setIsGoTestsOpen(true); void goTests.run("package", testDirectory); } },
    { id: "go.testWorkspace", title: "Go: Test Workspace", disabled: !workspacePath || commandBusy || runStatus === "running" || isDebugSessionBusy ? "Open a workspace and finish document/Run/Debug operations." : undefined, run: () => { setIsGoTestsOpen(true); void goTests.run("workspace", testDirectory); } },
    { id: "problems.next", title: "Next Problem", shortcut: "Alt+F8", disabled: problems.length === 0 ? "No current problems." : undefined, run: () => navigateAdjacentProblem(1) },
    { id: "problems.previous", title: "Previous Problem", shortcut: "Alt+Shift+F8", disabled: problems.length === 0 ? "No current problems." : undefined, run: () => navigateAdjacentProblem(-1) },
    { id: "workbench.panel", title: "Toggle Terminal Panel", shortcut: "Mod+j", run: () => { setIsFocusMode(false); setHasLoadedBottomPanel(true); setIsBottomPanelOpen(value => isFocusMode || !value); } },
    { id: "go.run", title: "Run Active Go File", shortcut: "Ctrl+F5", disabled: runDisabled ? "Open a Go file and stop active Run/Debug operations." : undefined, run: handleRunFileStandard },
    { id: "go.race", title: "Run Active Go File with Race Detector", disabled: runDisabled || runtimeAvailability === "unavailable" ? "A Go file and available Go toolchain are required." : undefined, run: handleRunFileWithRace },
    { id: "go.stop", title: "Stop Run", disabled: runStatus !== "running" ? "No active run." : undefined, run: handleStopRun },
    { id: "debug.startOrContinue", title: isDebugSessionRunning ? "Continue / Pause Debugging" : "Start Debugging", shortcut: "F5", disabled: debuggerState?.cleanupPending ? "Retry Stop to finish debugger cleanup." : isDebugSessionRunning && debuggerControlsUnavailable ? "Wait for the debugger's observed workspace/session state." : !isDebugSessionRunning && debugStartDisabled ? "Open a Go file and wait for active operations." : undefined, run: () => isDebugSessionRunning ? handleToggleDebugPause() : handleStartDebug() },
    { id: "debug.stop", title: "Stop Debugging", shortcut: "Shift+F5", disabled: !isDebugSessionRunning && !debuggerState?.cleanupPending ? "No active debug session." : undefined, run: handleStopDebug },
    { id: "debug.breakpoint", title: "Toggle Breakpoint", shortcut: "F9", disabled: !activeFilePath || !selectedLine ? "Place the cursor on a source line." : undefined, run: () => selectedLine ? handleToggleBreakpoint(selectedLine) : undefined },
    { id: "debug.stepOver", title: "Debug: Step Over", shortcut: "F10", disabled: !isDebugPaused || debuggerControlsUnavailable ? "Pause debugging and wait for observed state." : undefined, run: () => runObservedDebugControl(debuggerStepOver) },
    { id: "debug.stepInto", title: "Debug: Step Into", shortcut: "F11", disabled: !isDebugPaused || debuggerControlsUnavailable ? "Pause debugging and wait for observed state." : undefined, run: () => runObservedDebugControl(debuggerStepInto) },
    { id: "debug.stepOut", title: "Debug: Step Out", shortcut: "Shift+F11", disabled: !isDebugPaused || debuggerControlsUnavailable ? "Pause debugging and wait for observed state." : undefined, run: () => runObservedDebugControl(debuggerStepOut) },
    { id: "navigation.nextSymbol", title: "Next Document Symbol", shortcut: "F8", disabled: !activeFilePath ? "Open a file first." : undefined, run: () => navigateDocumentSymbol("next") },
    { id: "navigation.previousSymbol", title: "Previous Document Symbol", shortcut: "Shift+F8", disabled: !activeFilePath ? "Open a file first." : undefined, run: () => navigateDocumentSymbol("previous") },
  ];
  const executeCommand = useCommandRegistry(commands, setFileError);

  return (
    <div
      className="ide-shell relative flex h-full w-full flex-col bg-[var(--base)] text-[var(--text)]"
    >
      <div className="workspace-titlebar">
        {executionPreparation.phase !== "idle" && <span role="status" className="px-2 text-xs">{executionPreparation.phase === "preparing" ? "Saving project and checking tools..." : "Starting execution..."}{executionPreparation.phase === "preparing" && <button type="button" onClick={executionPreparation.cancel}>Cancel execution preparation</button>}{executionPreparation.phase === "starting" && runOwnershipRef.current?.current() && <button type="button" onClick={() => void executeCommand("go.stop")}>{runOwnershipRef.current.cleanupPending() ? "Retry Stop" : "Stop Run startup"}</button>}{executionPreparation.phase === "starting" && debuggerStartupRef.current?.current() && <button type="button" onClick={() => void debuggerStartupRef.current!.cancel().catch(error => setFileError(error instanceof Error ? error.message : String(error)))}>{debuggerStartupRef.current.cleanupPending() ? "Retry Debug startup cleanup" : "Cancel Debug startup"}</button>}</span>}
        {savePreparation.isPreparing && <button type="button" onClick={savePreparation.cancel} className="px-2 text-xs">Cancel save preparation</button>}
        <SettingsDialog open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} toolchainError={[settings.values["go.executablePath"], settings.values["go.goplsPath"], settings.values["debug.delvePath"]].some(Boolean) ? toolchain.error : null} />
        <ToolchainDialog open={isToolchainOpen} onClose={() => setIsToolchainOpen(false)} {...toolchain} />
        <GoTestsDialog open={isGoTestsOpen} close={() => setIsGoTestsOpen(false)} runner={goTests} directory={testDirectory} navigate={(path, line, column) => { const root = workspacePathRef.current; void handleOpenFile(path).then(() => { if (workspacePathRef.current === root && activeFilePathRef.current === path) requestJump(line, column); }); }} />
        <GoProjectDialog open={isGoProjectOpen} onClose={() => setIsGoProjectOpen(false)} root={workspacePath} activePath={activeFilePath} transaction={moduleDocumentTransaction} cancelPreparation={savePreparation.cancel} onChanged={root => { if (workspacePathRef.current === root) { setExplorerRevision(current => current + 1); void reloadGitState(root); } }} />
        {isNewGoProjectOpen && <NewGoProjectDialog paths={{ go: settings.values["go.executablePath"], gopls: settings.values["go.goplsPath"], dlv: settings.values["debug.delvePath"] }} onClose={() => setIsNewGoProjectOpen(false)} onCreated={async path => { const opened = await handleOpenWorkspace(path); if (opened) setNewProjectToOpen(path); return opened; }} />}
        <LanguageEditReview state={codeActions.state} onApply={codeActions.apply} onClose={codeActions.close} onPreviewAction={codeActions.preview} />
        <LanguageEditReview state={languageEdits.state} onApply={languageEdits.apply} onClose={languageEdits.close} onRenameNameChange={languageEdits.setRenameName} onPreviewRename={languageEdits.previewRename} />
        <LanguageResults state={language.state} onClose={language.close} onNavigate={location => {
          language.close();
          void navigateSourceLocation({ file: location.path, line: location.line, column: location.column });
        }} />
        <div className="flex items-center gap-2">
          <img src="/brand/icon.svg" alt="" className="size-4 shrink-0" aria-hidden="true" />
          <span className="workspace-brand text-[15px] font-bold tracking-tight">Goro</span>
        </div>
        <button
          type="button"
          className="workspace-search"
          aria-label="Find workspace files"
          title="Search files or commands (Ctrl+P)"
          onClick={() => void executeCommand(workspacePath ? "file.quickOpen" : "workbench.commands")}
          tabIndex={0}
        >
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <span>{workspacePath ? workspacePath.split(/[\\/]/).pop() : "Search or run command…"}</span>
          <kbd>Ctrl P</kbd>
        </button>
        <div className="flex items-center gap-1.5">
          {activeFilePath && isGoFile(activeFilePath) && (
            runStatus === "running" ? (
              <button
                type="button"
                aria-label="Stop Go run"
                title="Stop current Go run (Shift+F5)"
                onClick={() => void executeCommand("go.stop")}
                className="flex items-center gap-1 h-6 px-2 rounded bg-[var(--red)]/15 border border-[var(--red)]/30 text-[var(--red)] text-[11px] font-semibold transition-all hover:bg-[var(--red)]/25"
              >
                <span className="size-1.5 rounded-full bg-[var(--red)] animate-pulse" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                aria-label="Run Go file"
                title="Run active Go file (Ctrl+F5)"
                onClick={() => void executeCommand("go.run")}
                className="flex items-center gap-1 h-6 px-2 rounded bg-[var(--green)]/15 border border-[var(--green)]/30 text-[var(--green)] text-[11px] font-semibold transition-all hover:bg-[var(--green)]/25"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Run</span>
              </button>
            )
          )}
          <button
            type="button"
            aria-label="Toggle terminal dock"
            title="Toggle Terminal Panel (Ctrl+J)"
            className={`flex size-7 items-center justify-center rounded text-[var(--subtext0)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)] ${
              isBottomPanelOpen ? "text-[var(--text)] bg-[var(--surface0)]" : ""
            }`}
            onClick={() => {
              setIsFocusMode(false);
              setHasLoadedBottomPanel(true);
              setIsBottomPanelOpen((prev) => isFocusMode || !prev);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <line x1="3" y1="15" x2="21" y2="15" />
            </svg>
          </button>
          <button type="button" aria-label="Commands" title="Command Palette (Ctrl+Shift+P)" className="flex size-7 items-center justify-center rounded text-[var(--subtext0)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]" onClick={() => void executeCommand("workbench.commands")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg><span className="sr-only">Commands</span></button>
          <button type="button" aria-label="Open Settings" title="Settings (Ctrl+,)" className="flex size-7 items-center justify-center rounded text-[var(--subtext0)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]" onClick={() => setIsSettingsOpen(true)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span className="sr-only">Open Settings</span></button>
          <ThemeSwitcher />
          <button type="button" aria-label="Toggle Focus Mode" aria-pressed={isFocusMode} title="Focus Mode (Ctrl+Shift+Enter)" className="workspace-focus-button" onClick={() => setIsFocusMode(value => !value)}>{isFocusMode ? "Exit Focus" : "Focus"}</button>
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <ActivityBar
          activeTab={activeTab}
          onTabChange={tab => { setIsFocusMode(false); setActiveTab(tab); }}
          signalCount={raceSignals.length}
          showDebugTab={showDebugTab}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onToggleBottomPanel={() => { setIsFocusMode(false); setIsBottomPanelOpen(prev => isFocusMode || !prev); }}
          isBottomPanelOpen={isBottomPanelOpen}
        />
        <ResizableSplit
          orientation="horizontal"
          className="flex-1"
          collapsed={isFocusMode}
          size={workspaceLayout.splitSizes.left}
          defaultSize={DEFAULT_WORKSPACE_LAYOUT.splitSizes.left}
          minSize={120}
          maxSize={2000}
          onResize={handleLeftPaneResize}
          primary={
            <aside inert={branchSwitchLoading || isFocusMode} className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-(--mantle)">
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
                  onSearch={submitWorkspaceSearch}
                  onOpenResult={(file, line, query, column, target) => {
                    const root = workspacePathRef.current;
                    const generation = ++sourceNavigationRef.current;
                    const origin = navigationOrigin();
                    const navigation = ++searchNavigation.current;
                    void handleOpenFile(file).then(() => {
                      if (generation !== sourceNavigationRef.current || navigation !== searchNavigation.current || workspacePathRef.current !== root || activeFilePathRef.current !== file) return;
                      if (target && latestEditorContentRef.current?.split("\n")[line - 1]?.replace(/\r$/, "") !== target.preview) { setFileError("Search result changed in the editor or on disk. Search again before navigating."); return; }
                      setEditorHighlightQuery(target ? null : query);
                      setEditorSearchTarget(target ? { file, line, ...target } : null);
                      if (requestJump(line, column ?? 1, false)) navigationHistory.visit(origin, { file, line, column: column ?? 1 });
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
                  requestedView={requestedGitView}
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
                  {debuggerState?.cleanupPending
                    ? "Cleanup pending; retry Stop"
                    : debugUiState === "stopping"
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

              {debuggerState?.cleanupPending && (
                <button type="button" aria-label="Retry debugger cleanup"
                  disabled={debugUiState === "stopping"}
                  className="border border-[var(--red)] px-3 py-2 text-[11px] text-[var(--red)]"
                  onClick={() => void executeCommand("debug.stop")}>
                  Retry Stop
                </button>
              )}

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

              {isDebugSessionRunning && !debuggerState?.cleanupPending && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-label={isDebugPaused ? "Continue debugging" : "Pause debugging"}
                      disabled={debuggerState?.cleanupPending === true || debuggerControlsUnavailable}
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
                        disabled={debuggerControlsUnavailable}
                        className="rounded-md border border-[rgba(129,200,190,0.3)] px-3 py-2 text-[11px] font-semibold text-[var(--teal)] hover:bg-[rgba(129,200,190,0.12)]"
                        onClick={() => void executeCommand("debug.stepOver")}
                      >
                        Over
                      </button>
                      <button
                        type="button"
                        aria-label="Step into"
                        disabled={debuggerControlsUnavailable}
                        className="rounded-md border border-[rgba(229,200,144,0.3)] px-3 py-2 text-[11px] font-semibold text-[var(--yellow)] hover:bg-[rgba(229,200,144,0.12)]"
                        onClick={() => void executeCommand("debug.stepInto")}
                      >
                        Into
                      </button>
                      <button
                        type="button"
                        aria-label="Step out"
                        disabled={debuggerControlsUnavailable}
                        className="rounded-md border border-[rgba(239,159,118,0.3)] px-3 py-2 text-[11px] font-semibold text-[var(--peach)] hover:bg-[rgba(239,159,118,0.12)]"
                        onClick={() => void executeCommand("debug.stepOut")}
                      >
                        Out
                      </button>
                    </div>
                  )}
                </div>
              )}

              <DebuggerInspector root={workspacePath} state={debuggerState ? { ...debuggerState, stopToken: debuggerInspectionGate.token } : null} navigate={frame => {
                const root = workspacePath;
                if (workspacePathRef.current !== root) return;
                const token = debuggerStopTokenRef.current;
                const generation = debuggerInspectionGate.generation.current;
                if (!frame.relativePath || !frame.line || !root || !token) return;
                const path = frame.relativePath;
                void handleOpenFile(path).then(() => {
                  if (workspacePathRef.current === root && activeFilePathRef.current === path && debuggerStopTokenRef.current === token && debuggerInspectionGate.generation.current === generation) requestJump(frame.line!, frame.column ?? 1);
                });
              }} />

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
            size={isBottomPanelOpen && !isFocusMode ? workspaceLayout.terminalSize : 0}
            resizeAnchor="end"
            defaultSize={DEFAULT_WORKSPACE_LAYOUT.splitSizes.terminalBottom}
            minSize={isBottomPanelOpen ? 120 : 0}
            maxSize={2000}
            collapsed={!isBottomPanelOpen || isFocusMode}
            onResize={handleTerminalPaneResize}
            primary={
              <div
                hidden={!isBottomPanelOpen || isFocusMode}
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
              className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-(--crust)"
            >
              {draftRecovery.banner}
              {documentSnapshot.documents.length > 0 && (
                <>
                  <DocumentTabs snapshot={documentSnapshot} busy={isReading || explorerOperationBusy || gitOperationBusy || isBranchMutationInProgress} activate={path => void handleOpenFile(path)} close={id => void closeDocument(id)} />
                  <header className="editor-toolbar flex flex-wrap items-center justify-between gap-2 border-b border-(--border-subtle) bg-(--mantle) px-3 py-1 text-[12px] md:px-4">
                    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--overlay1)]" data-testid="editor-scope-breadcrumb">
                      <span className="font-mono text-[11px] font-medium text-[var(--subtext1)] truncate">{editorTitle}</span>
                      {isReading && <span className="shrink-0 text-[10px] text-[var(--overlay0)]">Loading…</span>}
                      {activeDocumentSymbol && (
                        <>
                          <span className="shrink-0 text-[var(--overlay0)] opacity-40">/</span>
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-1.5 rounded-none px-1.5 py-0.5 text-left transition-colors duration-100 hover:bg-[var(--bg-hover)]"
                            onClick={() => requestJump(activeDocumentSymbol.line)}
                            title={`Jump to ${activeDocumentSymbol.name} on line ${activeDocumentSymbol.line}.`}
                          >
                            <span className="rounded-none bg-[var(--surface0)] px-1 py-0.5 text-[9px] uppercase tracking-[0.04em]">
                              {activeDocumentSymbol.kind}
                            </span>
                            <span className="truncate text-[var(--subtext1)] font-mono">
                              {activeDocumentSymbol.name}
                            </span>
                            <span className="text-[var(--overlay0)]">
                              L{activeDocumentSymbol.line}
                            </span>
                          </button>
                        </>
                      )}
                    </div>

                    <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-x-auto pb-0.5 md:gap-2">
                      <button
                        className={`flex size-6.5 cursor-pointer items-center justify-center rounded-none text-[var(--subtext1)] transition-colors duration-100 ease-out hover:bg-[var(--bg-hover)] hover:text-[var(--text)] ${
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
                          className={`flex size-6.5 cursor-pointer items-center justify-center rounded-none transition-colors duration-100 ease-out ${
                            runStatus === "running" || debugUiState === "starting"
                              ? "cursor-not-allowed opacity-40 text-[var(--overlay2)]"
                              : "text-[var(--subtext1)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
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
                          className={`flex size-6.5 cursor-pointer items-center justify-center rounded-none transition-colors duration-100 ease-out ${
                            runStatus === "running" ||
                            debugUiState === "starting" ||
                            runtimeAvailability === "unavailable"
                              ? "cursor-not-allowed opacity-40 text-[var(--overlay2)]"
                              : "text-[var(--subtext1)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
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
                          className={`flex size-6.5 cursor-pointer items-center justify-center rounded-none transition-colors duration-100 ease-out ${
                            isDebugSessionBusy || runStatus === "running"
                              ? "cursor-not-allowed opacity-40 text-[var(--overlay2)]"
                              : "text-[var(--subtext1)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
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
                </>
              )}

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
                {(!workspacePath || !activeFilePath) && !isBranchMutationInProgress && (
                  <WelcomeScreen
                    workspacePath={workspacePath}
                    isOpening={isOpening}
                    onOpenWorkspace={() => void handleOpenWorkspace()}
                    onNewProject={() => void executeCommand("workspace.newGoProject")}
                    recentWorkspaces={workspaceHistory.recent}
                    onReopenWorkspace={workspaceHistory.reopen}
                    onForgetWorkspace={workspaceHistory.forget}
                    onQuickOpen={() => { setQuickOpenQuery(""); setIsQuickOpenOpen(true); }}
                    onSearch={() => { setActiveTab("search"); setSearchFocusTrigger((n) => n + 1); }}
                    onTerminal={() => { setBottomPanelTab("shell"); setIsBottomPanelOpen(true); }}
                    error={fileError}
                  />
                )}
                {workspacePath && activeFilePath && (
                  <div
                    data-testid="editor-active-file-region"
                    className="relative flex min-h-0 flex-1 overflow-hidden"
                  >
                    {isBranchMutationInProgress && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--base)]/60 backdrop-blur-[2px]" aria-hidden="true">
                        <span className="text-xs text-[var(--overlay1)]">Switching branch...</span>
                      </div>
                    )}
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
                            onCommandsChange={onEditorCommands}
                            onSessionDispose={state => { if (documentSnapshot.activeId !== null) documents.retainEditor(documentSnapshot.activeId, state); }}
                            editable={!documents.active?.readOnly && !isBranchMutationInProgress && !gitOperationBusy && !explorerOperationBusy}
                            value={activeFileContent}
                            filePath={activeFilePath}
                            executionLine={ownsDebuggerWorkspace(workspacePath, debuggerState) && !debuggerInspectionGate.pending && debuggerState?.activeRelativePath === activeFilePath ? debuggerState.activeLine ?? null : null}
                            breakpoints={breakpoints}
                            onToggleBreakpoint={handleToggleBreakpoint}
                            diagnostics={diagnostics}
                            selectionContextKey={`${workspacePath}\u0000${activeFilePath}`}
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
                            onRequestHover={requestEditorHover}
                            onRequestSignature={requestEditorSignature}
                            signatureRequestTrigger={signatureRequestTrigger}
                            externalSearchQuery={activeTab === "search" ? editorHighlightQuery : null}
                            externalSearchTarget={activeTab === "search" && editorSearchTarget?.file === activeFilePath ? editorSearchTarget : null}
                            executionActionsEnabled={!documents.active?.readOnly && !commandBusy && runStatus !== "running" && !isDebugSessionBusy}
                            onEntryAction={handleEntryAction}
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
      {goToLine.dialog}
      {documentDecision.dialog}
      {draftRecovery.dialog}
      {isQuickOpenOpen && <QuickOpenPicker query={quickOpenQuery} onQuery={setQuickOpenQuery} files={quickOpenFilteredFiles}
        loading={quickOpenLoading} error={quickOpenError} notice={quickOpenNotice} onClose={() => setIsQuickOpenOpen(false)} onChoose={handleQuickOpenSelect} />}

      {isBranchPickerOpen && branchSnapshot && (
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
        toolchainError={toolchain.error}
        toolchainChecking={toolchain.checking}
        onOpenToolchain={() => setIsToolchainOpen(true)}
        saveStatus={saveStatus}
        runStatus={runStatus}
        branchName={branchSnapshot?.currentBranch ?? null}
        onToggleBranchPicker={() => setIsBranchPickerOpen((prev) => !prev)}
        isBottomPanelOpen={isBottomPanelOpen}
        onToggleBottomPanel={() => setIsBottomPanelOpen((prev) => !prev)}
        selectedLine={selectedLine}
        tabSize={settings.values["editor.tabSize"]}
      />

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
      <UpdateNotice />
      {safeCloseDialog}
      {replacementReview.dialog}
    </div>
  );
}

export default EditorShell;
