import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLensSignals } from "../../features/concurrency/useLensSignals";
import type { VisibleLineRange } from "../../features/concurrency/signalDensity";
import { useHoverHint } from "../../hooks/useHoverHint";
import {
  readWorkspaceFile,
  writeWorkspaceFile,
  runWorkspaceFile,
  fetchWorkspaceDiagnostics,
} from "../../lib/ipc/client";
import type { EditorDiagnostic, RunOutputPayload } from "../../lib/ipc/types";
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
import CodeEditor, { type JumpRequest } from "./CodeEditor";

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

function isGoFile(path: string | null): path is string {
  return typeof path === "string" && path.toLowerCase().endsWith(".go");
}

function EditorShell() {
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [mode] = useState<"quick-insight" | "deep-trace">("quick-insight");
  const [runtimeAvailability] = useState<"available" | "unavailable">(
    "unavailable"
  );
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

  useEffect(() => {
    setJumpRequest(null);
  }, [workspacePath, activeFilePath]);

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

  const traceBubbleConfidence: TraceBubbleConfidence =
    (activeHint?.confidence?.toLowerCase() as TraceBubbleConfidence) ?? "predicted";

  const resolveCounterpartLine = useCallback(
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
        return candidates.length === 1 ? candidates[0].counterpartLine : null;
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
      return uniqueCounterpartLines.length === 1 ? uniqueCounterpartLines[0] : null;
    },
    [counterpartMappings]
  );

  const resolveCounterpartFromActiveHint = useCallback(() => {
    if (activeHintLine === null || activeHint?.kind !== "channel") {
      return null;
    }

    return resolveCounterpartLine(activeHintLine, activeHint.symbol);
  }, [activeHint, activeHintLine, resolveCounterpartLine]);

  const hasCounterpart = useMemo(
    () => resolveCounterpartFromActiveHint() !== null,
    [resolveCounterpartFromActiveHint]
  );

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
    requestJump(resolveCounterpartFromActiveHint());
  }, [requestJump, resolveCounterpartFromActiveHint]);

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

      const targetLine = resolveCounterpartLine(line, activeHint.symbol);
      if (targetLine === null) {
        return false;
      }

      requestJump(targetLine);
      return true;
    },
    [activeHint, activeHintLine, requestJump, resolveCounterpartLine]
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
        setWorkspacePath(resolvedPath);
        setActiveFilePath(null);
        setActiveFileContent(null);
        diagnosticsRequestIdRef.current += 1;
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
      setDiagnostics([]);

      try {
        const response = await readWorkspaceFile(workspacePath, relativePath);

        // If the workspace changed while we were reading, ignore the result
        if (workspacePathRef.current !== startingPath) {
          return;
        }

        if (!response.ok || response.data === undefined) {
          setActiveFilePath(relativePath);
          setActiveFileContent(null);
          setFileError(response.error?.message ?? "Unable to open file");
          return;
        }

        setActiveFilePath(relativePath);
        setActiveFileContent(response.data);
        savedContentRef.current = response.data;
        latestEditorContentRef.current = response.data;
        setIsDirty(false);
        setSaveStatus("idle");
        if (!isGoFile(relativePath)) {
          setDiagnostics([]);
        }
      } catch (error) {
        if (workspacePathRef.current === startingPath) {
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
                        <HintUnderline hint={activeHint} />
                        <ThreadLine 
                          visible={isInlineActionsVisible && hasCounterpart}
                          sourceAnchor={interactionAnchor}
                          targetAnchor={counterpartAnchor}
                        />
                        <TraceBubble
                          visible={isInlineActionsVisible}
                          confidence={traceBubbleConfidence}
                          label={traceBubbleLabel}
                          anchorTop={Math.max(4, (interactionAnchor?.top ?? 24) - 28)}
                          anchorLeft={interactionAnchor?.left ?? 12}
                        />
                        <InlineActions
                          visible={isInlineActionsVisible}
                          runtimeAvailability={runtimeAvailability}
                          hasCounterpart={hasCounterpart}
                          anchorTop={interactionAnchor?.top ?? null}
                          anchorLeft={interactionAnchor?.left ?? null}
                          onJump={handleJump}
                        />
                        {activeFileContent !== null ? (
                          <CodeEditor
                            value={activeFileContent}
                            selectionContextKey={activeFilePath}
                            hintLine={activeHintLine}
                            counterpartLine={resolveCounterpartFromActiveHint()}
                            jumpRequest={jumpRequest}
                            onHoverLineChange={setHoveredLine}
                            onSelectionLineChange={setSelectedLine}
                            onModifierClickLine={handleModifierClickLine}
                            onInteractionAnchorChange={setInteractionAnchor}
                            onCounterpartAnchorChange={setCounterpartAnchor}
                            onViewportRangeChange={setVisibleRange}
                            onSave={handleSaveFile}
                            onChange={handleEditorChange}
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
