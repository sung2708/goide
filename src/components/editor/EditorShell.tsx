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
  runWorkspaceFileWithRace,
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
import Explorer from "../sidebar/Explorer";
import StatusBar from "../statusbar/StatusBar";
import CodeEditor, {
  type EditorCompletionRequest,
  type JumpRequest,
} from "./CodeEditor";

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
type RunMode = "standard" | "race";

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

function pathsReferToSameFile(pathA: string, pathB: string): boolean {
  const normalizedA = normalizeRelativePath(pathA).toLowerCase();
  const normalizedB = normalizeRelativePath(pathB).toLowerCase();
  if (normalizedA === normalizedB) {
    return true;
  }

  const segmentsA = normalizedA.split("/").filter(Boolean);
  const segmentsB = normalizedB.split("/").filter(Boolean);
  const shorter = segmentsA.length <= segmentsB.length ? segmentsA : segmentsB;
  const longer = segmentsA.length <= segmentsB.length ? segmentsB : segmentsA;

  // Avoid basename-only matches (e.g. "main.go" vs "/repo/pkg/main.go").
  if (shorter.length < 2) {
    return false;
  }

  for (let index = 1; index <= shorter.length; index += 1) {
    if (shorter[shorter.length - index] !== longer[longer.length - index]) {
      return false;
    }
  }
  return true;
}

function pathsReferToSameRunTarget(pathFromOutput: string, runTargetPath: string): boolean {
  if (pathsReferToSameFile(pathFromOutput, runTargetPath)) {
    return true;
  }

  // Race detector often reports absolute paths, while run targets may be a
  // root-level relative path (e.g. "main.go"). Allow basename fallback only
  // for that root-level run-target case.
  const normalizedTarget = normalizeRelativePath(runTargetPath).toLowerCase();
  const targetSegments = normalizedTarget.split("/").filter(Boolean);
  if (targetSegments.length !== 1) {
    return false;
  }

  const normalizedOutput = normalizeRelativePath(pathFromOutput).toLowerCase();
  const outputSegments = normalizedOutput.split("/").filter(Boolean);
  const outputBasename = outputSegments[outputSegments.length - 1] ?? "";
  return outputBasename === targetSegments[0];
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
  const matchLine = signal.scopeLine ?? signal.line;
  const matchColumn = signal.scopeColumn ?? signal.column;

  return (
    normalizeRelativePath(signal.scopeRelativePath ?? signal.relativePath) ===
      normalizeRelativePath(scope.filePath) &&
    matchLine === scope.line &&
    matchColumn === scope.column
  );
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

function confidenceRank(confidence?: ConcurrencyConfidence | null): number {
  switch ((confidence ?? "").toLowerCase()) {
    case "confirmed":
      return 3;
    case "likely":
      return 2;
    case "predicted":
      return 1;
    default:
      return 0;
  }
}

function isUsableRuntimeCounterpart(
  signal: RuntimeSignal,
  activeFilePath: string
): boolean {
  const line = signal.counterpartLine ?? null;
  const hasValidLine = Number.isInteger(line) && line !== null && line >= 1;
  if (!hasValidLine) {
    return false;
  }
  const counterpartPath = signal.counterpartRelativePath ?? null;
  return (
    counterpartPath === null || pathsReferToSameFile(counterpartPath, activeFilePath)
  );
}

function selectActiveBlockedSignal(
  blockedCandidates: RuntimeSignal[],
  activeFilePath: string
): RuntimeSignal | null {
  if (blockedCandidates.length === 0) {
    return null;
  }

  const sorted = [...blockedCandidates].sort((left, right) => {
    const leftUsable = isUsableRuntimeCounterpart(left, activeFilePath) ? 1 : 0;
    const rightUsable = isUsableRuntimeCounterpart(right, activeFilePath) ? 1 : 0;
    if (leftUsable !== rightUsable) {
      return rightUsable - leftUsable;
    }

    const leftConfidence = confidenceRank(left.counterpartConfidence ?? left.confidence);
    const rightConfidence = confidenceRank(right.counterpartConfidence ?? right.confidence);
    if (leftConfidence !== rightConfidence) {
      return rightConfidence - leftConfidence;
    }

    const leftHasCounterpartLine =
      Number.isInteger(left.counterpartLine) && (left.counterpartLine ?? 0) >= 1 ? 1 : 0;
    const rightHasCounterpartLine =
      Number.isInteger(right.counterpartLine) && (right.counterpartLine ?? 0) >= 1 ? 1 : 0;
    if (leftHasCounterpartLine !== rightHasCounterpartLine) {
      return rightHasCounterpartLine - leftHasCounterpartLine;
    }

    const leftHasCorrelationId = left.correlationId ? 1 : 0;
    const rightHasCorrelationId = right.correlationId ? 1 : 0;
    if (leftHasCorrelationId !== rightHasCorrelationId) {
      return rightHasCorrelationId - leftHasCorrelationId;
    }

    if (left.threadId !== right.threadId) {
      return left.threadId - right.threadId;
    }
    return left.waitReason.localeCompare(right.waitReason);
  });
  return sorted[0] ?? null;
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

function extractGoFileLineReferences(text: string): Array<{
  path: string;
  line: number;
}> {
  const matches = text.matchAll(/((?:[A-Za-z]:)?[^:\r\n]+?\.go):(\d+)/g);
  const refs: Array<{ path: string; line: number }> = [];
  for (const match of matches) {
    const filePath = match[1] ?? "";
    const line = Number(match[2]);
    if (!filePath || !Number.isInteger(line) || line < 1) {
      continue;
    }
    refs.push({ path: filePath, line });
  }
  return refs;
}

function toRaceRuntimeSignals(relativePath: string, lines: number[]): RuntimeSignal[] {
  return lines.map((line, index) => ({
    threadId: index + 1,
    status: "data race",
    waitReason: "data race",
    confidence: ConcurrencyConfidence.Confirmed,
    scopeKey: `race:${relativePath}:${line}`,
    scopeRelativePath: relativePath,
    scopeLine: line,
    scopeColumn: 1,
    relativePath,
    line,
    column: 1,
  }));
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
    "available" | "unavailable" | "degraded"
  >("unavailable");
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [runOutput, setRunOutput] = useState<RunOutputPayload[]>([]);
  const [runMode, setRunMode] = useState<RunMode>("standard");
  const [raceSignals, setRaceSignals] = useState<RuntimeSignal[]>([]);
  const [diagnostics, setDiagnostics] = useState<EditorDiagnostic[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [analysisRevision, setAnalysisRevision] = useState(0);
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
  const activeRunModeRef = useRef<RunMode>("standard");
  const activeRunTargetFilePathRef = useRef<string | null>(null);
  const raceRunCaptureRef = useRef<{
    isRaceRun: boolean;
    sawWarning: boolean;
    matchedLines: Set<number>;
  }>({
    isRaceRun: false,
    sawWarning: false,
    matchedLines: new Set<number>(),
  });
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
    symbol: string | null;
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

  const refreshDiagnosticsForFile = useCallback(
    async (diagnosticWorkspacePath: string, diagnosticFilePath: string) => {
      if (!isGoFile(diagnosticFilePath)) {
        setDiagnostics([]);
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

        if (diagnosticsResponse.ok && diagnosticsResponse.data) {
          setDiagnostics(diagnosticsResponse.data);
        } else {
          setDiagnostics([]);
        }
      } catch (_error) {
        if (
          requestId === diagnosticsRequestIdRef.current &&
          workspacePathRef.current === diagnosticWorkspacePath &&
          activeFilePathRef.current === diagnosticFilePath
        ) {
          setDiagnostics([]);
        }
      }
    },
    []
  );

  const hasCounterpart = useMemo(() => {
    const resolution = resolveCounterpartFromActiveHint();
    return resolution !== null && resolution.line !== null;
  }, [resolveCounterpartFromActiveHint]);

  const counterpartResolution = resolveCounterpartFromActiveHint();
  const activeRaceSignal = useMemo(() => {
    if (!activeFilePath || interactionLine === null) {
      return null;
    }
    return (
      raceSignals.find(
        (signal) =>
          signal.line === interactionLine &&
          pathsReferToSameFile(signal.relativePath, activeFilePath)
      ) ?? null
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

        if (!response.ok || !response.data) {
          markRuntimeDegraded();
          return;
        }

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
          markRuntimeDegraded();
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
  
  const handleRunFile = useCallback(async (modeToRun: RunMode = "standard") => {
    if (!workspacePath || !activeFilePath) return;
    const isRaceRun = modeToRun === "race";
    const runId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    activeRunIdRef.current = runId;
    activeRunModeRef.current = modeToRun;
    activeRunTargetFilePathRef.current = activeFilePath;

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
  }, [workspacePath, activeFilePath, activeFileContent, isDirty, persistActiveFileContent]);

  const handleRunFileStandard = useCallback(() => {
    void handleRunFile("standard");
  }, [handleRunFile]);

  const handleRunFileWithRace = useCallback(() => {
    if (runtimeAvailability === "unavailable") {
      return;
    }
    void handleRunFile("race");
  }, [handleRunFile, runtimeAvailability]);

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
        const runTargetPath = activeRunTargetFilePathRef.current;
        if (activeRunModeRef.current === "race" && runTargetPath) {
          if (
            event.payload.stream === "stderr" &&
            event.payload.line.includes("WARNING: DATA RACE")
          ) {
            raceRunCaptureRef.current.sawWarning = true;
          }

          if (event.payload.stream === "stderr") {
            const refs = extractGoFileLineReferences(event.payload.line);
            for (const ref of refs) {
              if (pathsReferToSameRunTarget(ref.path, runTargetPath)) {
                raceRunCaptureRef.current.matchedLines.add(ref.line);
              }
            }
          }

          if (event.payload.stream === "exit") {
            if (
              raceRunCaptureRef.current.sawWarning &&
              raceRunCaptureRef.current.matchedLines.size > 0
            ) {
              const lines = Array.from(raceRunCaptureRef.current.matchedLines).sort(
                (left, right) => left - right
              );
              setRaceSignals(toRaceRuntimeSignals(runTargetPath, lines));
            } else {
              setRaceSignals([]);
            }
          }
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
    setActiveFileContent(value);
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
        setRaceSignals([]);
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
        setRaceSignals([]);
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
    [isReading, refreshDiagnosticsForFile, workspacePath]
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
      className="relative flex h-full w-full flex-col bg-[var(--base)] text-[var(--text)]"
    >
      <div className="flex flex-1 overflow-hidden">
        <aside
          className="utilitarian-noise animate-reveal-right flex min-w-[240px] basis-[20%] flex-col border-r border-[var(--surface0)] bg-[var(--mantle)]"
        >
          <Explorer
            workspacePath={workspacePath}
            activeFilePath={activeFilePath}
            onOpenFile={handleOpenFile}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <section className="animate-reveal-up flex min-w-0 flex-1 flex-col bg-[var(--crust)] shadow-2xl" style={{ animationDelay: '0.1s' }}>
              <header
                className="beveled-edge flex items-center justify-between border-b border-[var(--surface0)] bg-[var(--base)] px-4 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--overlay1)]">Editor</span>
                  <span className="text-[#a6adc8] opacity-40">/</span>
                  <span className="text-[12px] font-semibold tracking-tight text-[var(--text)]">{editorTitle}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    className={`flex items-center gap-2 rounded bg-[var(--surface0)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text)] transition-all hover:bg-[var(--surface1)] ${
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
                      className={`flex items-center gap-2 rounded px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-all ${
                        runStatus === "running"
                          ? "bg-[var(--surface0)] text-[var(--overlay2)] cursor-not-allowed"
                          : "bg-[var(--green)] text-[var(--crust)] hover:opacity-90"
                      }`}
                      onClick={handleRunFileStandard}
                      type="button"
                      aria-label="Run active Go file"
                      title="Run the active Go file and show output in the terminal panel."
                      disabled={runStatus === "running"}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      {runStatus === "running" ? "Running..." : "Run"}
                    </button>
                  )}
                  {isGoFile(activeFilePath) && (
                    <button
                      className={`flex items-center gap-2 rounded border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-all ${
                        runStatus === "running" || runtimeAvailability === "unavailable"
                          ? "border-[var(--surface1)] text-[var(--overlay2)] cursor-not-allowed"
                          : "border-[var(--mauve)] text-[var(--mauve)] hover:bg-[var(--surface0)]"
                      }`}
                      onClick={handleRunFileWithRace}
                      type="button"
                      aria-label="Run active Go file with race detector"
                      title="Run the active Go file with the Go race detector and surface confirmed race findings."
                      disabled={runStatus === "running" || runtimeAvailability === "unavailable"}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7z"/></svg>
                      {runStatus === "running" && runMode === "race" ? "Race..." : "Run Race"}
                    </button>
                  )}
                </div>
              </header>

              <div className="flex flex-1 flex-col p-6">
                {!workspacePath && (
                  <div className="flex flex-1 flex-col items-center justify-center animate-fade-in">
                    <div className="max-w-md text-center">
                      <div className="mb-6 flex justify-center">
                        <div className="rounded-full bg-[var(--surface0)] p-4 text-[var(--blue)]">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        </div>
                      </div>
                      <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--text)]">GoIDE</h2>
                      <p className="mt-4 text-sm text-[var(--subtext0)] leading-relaxed">
                        Open a workspace folder to begin concurrency-first development. 
                        Your code will stay responsive and fluid.
                      </p>
                      <button
                        className="mt-8 rounded bg-[var(--blue)] px-6 py-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--crust)] transition-opacity hover:opacity-90"
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
                  <div className="flex flex-1 flex-col items-center justify-center animate-fade-in">
                    <div className="max-w-md text-center">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--overlay1)]">Workspace Active</p>
                      <p className="mt-4 text-sm text-[var(--subtext0)] leading-relaxed">
                        Select a target file from the explorer to activate the concurrency lens.
                      </p>
                    </div>
                  </div>
                )}
                {workspacePath && activeFilePath && (
                  <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
                    <div className="flex items-center justify-between text-xs text-[#9399b2]">
                      <span className="uppercase tracking-[0.16em]">Active File</span>
                      {isReading && <span>Loading.</span>}
                    </div>
                    {fileError && (
                      <div className="rounded border border-[var(--red)] bg-[var(--crust)] px-3 py-2 text-xs text-[var(--red)]">
                        {fileError}
                      </div>
                    )}
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-[var(--surface0)] bg-[var(--crust)]">
                      <div className="border-b border-[var(--surface0)] px-3 py-2 text-xs text-[var(--text)]">
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
                          confidence={
                            isBlockedConfirmedVisible ? "confirmed" : traceBubbleConfidence
                          }
                          label={activeRaceSignal ? "Data Race" : isBlockedConfirmedVisible ? "Blocked Op" : traceBubbleLabel}
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
              onRun={handleRunFileStandard}
              onRunWithRace={handleRunFileWithRace}
              canRunWithRace={runtimeAvailability !== "unavailable"}
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

      {isCommandPaletteOpen && (
        <CommandPalette
          onClose={closeCommandPalette}
          canRun={Boolean(workspacePath && isGoFile(activeFilePath))}
          canRunWithRace={
            Boolean(workspacePath && isGoFile(activeFilePath)) &&
            runtimeAvailability !== "unavailable"
          }
          isRunning={runStatus === "running"}
          onRun={handleRunFileStandard}
          onRunWithRace={handleRunFileWithRace}
        />
      )}
    </div>
  );
}

export default EditorShell;
