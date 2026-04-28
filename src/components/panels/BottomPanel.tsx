import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils/cn";
import type { DockMode } from "../../features/layout/useWorkspaceLayout";
import type { BottomPanelTab, RunOutputPayload } from "../../lib/ipc/types";
import AlertDialog from "../primitives/AlertDialog";
import LogsTerminalView from "./LogsTerminalView";
import ShellTerminalView from "./ShellTerminalView";

export type { BottomPanelTab };

type BottomPanelProps = {
  activeTab: BottomPanelTab;
  onActiveTabChange: (tab: BottomPanelTab) => void;
  logEntries: RunOutputPayload[];
  surfaceKey: string | null;
  workspacePath: string | null;
  // Logs-scoped actions
  onClose?: () => void;
  isRunning?: boolean;
  onClear?: () => void;
  onRun?: () => void;
  onRunWithRace?: () => void;
  onStop?: () => void;
  canRunWithRace?: boolean;
  dockMode?: DockMode;
  onDockModeChange?: (mode: DockMode) => void;
};

function BottomPanel({
  activeTab,
  onActiveTabChange,
  logEntries,
  surfaceKey,
  workspacePath,
  onClose,
  isRunning = false,
  onClear,
  onRun,
  onRunWithRace,
  onStop,
  canRunWithRace = false,
  dockMode = "bottom",
  onDockModeChange,
}: BottomPanelProps) {
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [shellFitRequestKey, setShellFitRequestKey] = useState(0);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Close overflow menu when clicking outside
  useEffect(() => {
    if (!isOverflowOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setIsOverflowOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOverflowOpen]);

  // Close overflow menu on Escape
  useEffect(() => {
    if (!isOverflowOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOverflowOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOverflowOpen]);

  // Whether there are any overflow items to show
  const hasOverflowItems =
    activeTab === "logs" &&
    ((!isRunning && onRunWithRace !== undefined) ||
      onClear !== undefined ||
      onClose !== undefined);

  useEffect(() => {
    if (activeTab === "shell") {
      setShellFitRequestKey((current) => current + 1);
    }
  }, [activeTab]);

  const tabBase =
    "rounded-sm px-3 py-1 text-[12px] font-semibold transition-colors duration-100";
  const tabActive = "bg-[var(--bg-active)] text-[var(--lavender)]";
  const tabInactive =
    "text-[var(--overlay1)] hover:text-[var(--subtext1)] hover:bg-[var(--bg-hover)]";
  const dockButtonBase =
    "rounded-sm border px-2 py-1 text-[11px] font-semibold transition-colors duration-100";
  const dockButtonActive =
    "border-[rgba(140,170,238,0.45)] bg-[rgba(140,170,238,0.12)] text-[var(--blue)]";
  const dockButtonInactive =
    "border-[var(--border-subtle)] text-[var(--overlay1)] hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]";

  return (
    <section
      id="bottom-panel"
      aria-label="Bottom panel"
      className={cn(
        "relative z-40 flex flex-col bg-[var(--mantle)]",
        dockMode === "right"
          ? "h-full min-h-0 border-l border-[var(--border-muted)]"
          : "h-full min-h-[11rem] border-t border-[var(--border-muted)]"
      )}
      data-testid="bottom-panel"
    >
      {/* Header: tabs + logs-scoped action buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--mantle)] px-3 py-2.5">
        {/* Tab strip */}
        <div className="flex items-center gap-1" role="tablist" aria-label="Terminal tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "logs"}
            className={cn(tabBase, activeTab === "logs" ? tabActive : tabInactive)}
            onClick={() => onActiveTabChange("logs")}
          >
            Logs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "shell"}
            className={cn(tabBase, activeTab === "shell" ? tabActive : tabInactive)}
            onClick={() => onActiveTabChange("shell")}
          >
            Shell
          </button>
          {activeTab === "logs" && isRunning && (
            <span className="ml-2 flex items-center gap-2">
              <span className="size-[6px] rounded-full bg-[var(--green)]"></span>
              <span className="text-[12px] font-semibold text-[var(--green)]">Running</span>
            </span>
          )}
        </div>

        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-0.5">
          {onDockModeChange && (
            <div className="flex items-center gap-1" aria-label="Dock mode">
              <button
                type="button"
                aria-label="Dock bottom"
                aria-pressed={dockMode === "bottom"}
                className={cn(
                  dockButtonBase,
                  dockMode === "bottom" ? dockButtonActive : dockButtonInactive
                )}
                onClick={() => onDockModeChange("bottom")}
                title="Dock terminal at bottom."
              >
                Bottom
              </button>
              <button
                type="button"
                aria-label="Dock right"
                aria-pressed={dockMode === "right"}
                className={cn(
                  dockButtonBase,
                  dockMode === "right" ? dockButtonActive : dockButtonInactive
                )}
                onClick={() => onDockModeChange("right")}
                title="Dock terminal on right."
              >
                Right
              </button>
            </div>
          )}

          {/* Logs-scoped action buttons */}
          {activeTab === "logs" && (
            <>
              {/* Primary inline actions */}
              {onRun && !isRunning && (
                <button
                  type="button"
                  className="cursor-pointer rounded border border-[rgba(166,209,137,0.3)] bg-[rgba(166,209,137,0.08)] px-3 py-1 text-[12px] font-semibold text-[var(--green)] transition-colors duration-100 hover:bg-[rgba(166,209,137,0.16)]"
                  onClick={onRun}
                  title="Run the active Go file again."
                >
                  Run Again
                </button>
              )}
              {onStop && isRunning && (
                <button
                  type="button"
                  className="cursor-pointer rounded border border-[rgba(231,130,132,0.3)] bg-[rgba(231,130,132,0.08)] px-3 py-1 text-[12px] font-semibold text-[var(--red)] transition-colors duration-100 hover:bg-[rgba(231,130,132,0.16)]"
                  onClick={onStop}
                  title="Stop the current run."
                >
                  Stop
                </button>
              )}

              {/* Overflow / More button — secondary actions */}
              {hasOverflowItems && (
                <div ref={overflowRef} className="relative">
                  <button
                    type="button"
                    aria-label="More panel actions"
                    aria-haspopup="menu"
                    aria-expanded={isOverflowOpen}
                    className="cursor-pointer rounded border border-[var(--border-subtle)] px-2 py-1 text-[12px] text-[var(--subtext0)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
                    onClick={() => setIsOverflowOpen((o) => !o)}
                    title="More panel actions."
                  >
                    •••
                  </button>
                  {isOverflowOpen && (
                    <div
                      role="menu"
                      aria-label="Panel actions menu"
                      className="absolute right-0 top-full z-50 mt-1 min-w-[9rem] rounded border border-[var(--border-muted)] bg-[var(--mantle)] py-1 shadow-[var(--panel-shadow)]"
                    >
                      {onRunWithRace && !isRunning && (
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full cursor-pointer px-3 py-1.5 text-left text-[12px] text-[var(--subtext1)] transition-colors duration-100 hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() => {
                            setIsOverflowOpen(false);
                            onRunWithRace();
                          }}
                          disabled={!canRunWithRace}
                          title="Run the active Go file with race detection."
                        >
                          Run Race
                        </button>
                      )}
                      {onClear && (
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full cursor-pointer px-3 py-1.5 text-left text-[12px] text-[var(--subtext1)] transition-colors duration-100 hover:bg-[var(--bg-hover)]"
                          onClick={() => {
                            setIsOverflowOpen(false);
                            setIsClearConfirmOpen(true);
                          }}
                          title="Clear terminal output."
                        >
                          Clear
                        </button>
                      )}
                      {onClose && (
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full cursor-pointer px-3 py-1.5 text-left text-[12px] text-[var(--subtext1)] transition-colors duration-100 hover:bg-[var(--bg-hover)]"
                          onClick={() => {
                            setIsOverflowOpen(false);
                            onClose();
                          }}
                          title="Hide the terminal panel."
                        >
                          Hide Panel
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tab content — both panels stay mounted so ShellTerminalView keeps its PTY
          session alive across tab switches. Visibility is toggled via the HTML
          `hidden` attribute rather than conditional rendering. */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div
          aria-hidden={activeTab !== "logs"}
          className={cn(
            "absolute inset-0 h-full min-h-0",
            activeTab !== "logs" && "pointer-events-none opacity-0"
          )}
        >
          <LogsTerminalView entries={logEntries} className="h-full" />
        </div>
        <div
          aria-hidden={activeTab !== "shell"}
          className={cn(
            "absolute inset-0 h-full min-h-0",
            activeTab !== "shell" && "pointer-events-none opacity-0"
          )}
        >
          <ShellTerminalView
            workspacePath={workspacePath}
            surfaceKey={surfaceKey}
            fitRequestKey={shellFitRequestKey}
          />
        </div>
      </div>

      <AlertDialog
        open={isClearConfirmOpen}
        onOpenChange={setIsClearConfirmOpen}
        title="Clear output?"
        description="This will remove all current terminal lines."
        onConfirm={() => onClear?.()}
        confirmLabel="Clear"
        cancelLabel="Cancel"
      />
    </section>
  );
}

export default BottomPanel;
