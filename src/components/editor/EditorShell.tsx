import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLensSignals } from "../../features/concurrency/useLensSignals";
import { useHoverHint } from "../../hooks/useHoverHint";
import { readWorkspaceFile } from "../../lib/ipc/client";
import CommandPalette from "../command-palette/CommandPalette";
import HintUnderline from "../overlays/HintUnderline";
import BottomPanel from "../panels/BottomPanel";
import SummaryPeek from "../panels/SummaryPeek";
import SourceTree from "../sidebar/SourceTree";
import StatusBar from "../statusbar/StatusBar";
import CodeEditor from "./CodeEditor";

const EDITOR_BG = "bg-[#1e1e2e]";
const PANEL_BG = "bg-[#181825]";
const BORDER = "border-[#313244]";
const TEXT_MUTED = "text-[#a6adc8]";

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
  const [paletteReturnFocusEl, setPaletteReturnFocusEl] =
    useState<HTMLElement | null>(null);
  const workspacePathRef = useRef(workspacePath);
  workspacePathRef.current = workspacePath;
  const { detectedConstructs } = useLensSignals({
    workspacePath,
    activeFilePath,
    workspacePathRef,
  });
  const { activeHint, activeHintLine, setHoveredLine } = useHoverHint({
    workspacePath,
    activeFilePath,
    detectedConstructs,
  });

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
    return segments[segments.length - 1] ?? activeFilePath;
  }, [activeFilePath]);

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
                        {activeFileContent !== null ? (
                          <CodeEditor
                            value={activeFileContent}
                            hintLine={activeHintLine}
                            onHoverLineChange={setHoveredLine}
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
              <SummaryPeek onClose={() => setIsSummaryOpen(false)} />
            )}
          </div>

          {isBottomPanelOpen && (
            <BottomPanel onClose={() => setIsBottomPanelOpen(false)} />
          )}
        </div>
      </div>

      <StatusBar
        workspacePath={workspacePath}
        activeFilePath={activeFilePath}
        mode={mode}
        runtimeAvailability={runtimeAvailability}
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
