import { useEffect, useState } from "react";
import { cn } from "../../lib/utils/cn";
import type { BottomPanelTab, RunOutputPayload } from "../../lib/ipc/types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEyeSlash, faTrashCan } from "@fortawesome/free-solid-svg-icons";
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
}: BottomPanelProps) {
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [shellFitRequestKey, setShellFitRequestKey] = useState(0);

  useEffect(() => {
    if (activeTab === "shell") {
      setShellFitRequestKey((current) => current + 1);
    }
  }, [activeTab]);

  const showRunAgain = activeTab === "logs" && !isRunning && onRun !== undefined;
  const showRunRace =
    activeTab === "logs" && !isRunning && onRunWithRace !== undefined;
  const showStop = activeTab === "logs" && isRunning && onStop !== undefined;
  const showClear = activeTab === "logs" && onClear !== undefined;
  const showHidePanel = activeTab === "logs" && onClose !== undefined;

  const tabBase =
    "rounded-sm px-3 py-1 text-[12px] font-semibold transition-colors duration-100";
  const tabActive = "bg-[var(--bg-active)] text-[var(--lavender)]";
  const tabInactive =
    "text-[var(--overlay1)] hover:text-[var(--subtext1)] hover:bg-[var(--bg-hover)]";
  return (
    <section
      id="bottom-panel"
      aria-label="Bottom panel"
      className="relative z-40 flex h-full min-h-44 flex-col border-t border-(--border-muted) bg-(--crust)"
      data-testid="bottom-panel"
    >
      {/* Header: tabs + logs-scoped action buttons */}
      <div className="flex items-center gap-2 border-b border-(--border-subtle) bg-(--crust) px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" role="tablist" aria-label="Terminal tabs">
          {/* Tab strip */}
          <div className="flex items-center gap-1 rounded bg-[var(--base)]/40 p-0.5">
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
          </div>

          {/* Logs-scoped run controls */}
          {activeTab === "logs" && (
            <div className="flex items-center gap-1 rounded bg-[var(--base)]/25 p-0.5">
              {showRunAgain && (
                <button
                  type="button"
                  className="cursor-pointer rounded px-2.5 py-1 text-[12px] font-semibold text-[var(--green)] transition-colors duration-100 hover:bg-[rgba(166,209,137,0.12)]"
                  onClick={onRun}
                  title="Run the active Go file again."
                >
                  Run Again
                </button>
              )}
              {showRunRace && (
                <button
                  type="button"
                  className="cursor-pointer rounded px-2.5 py-1 text-[12px] font-semibold text-[var(--blue)] transition-colors duration-100 hover:bg-[rgba(140,170,238,0.12)] disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={onRunWithRace}
                  disabled={!canRunWithRace}
                  title="Run the active Go file with race detection."
                >
                  Run Race
                </button>
              )}
              {showStop && (
                <button
                  type="button"
                  className="cursor-pointer rounded px-2.5 py-1 text-[12px] font-semibold text-[var(--red)] transition-colors duration-100 hover:bg-[rgba(231,130,132,0.12)]"
                  onClick={onStop}
                  title="Stop the current run."
                >
                  Stop
                </button>
              )}
            </div>
          )}

          {activeTab === "logs" && isRunning && (
            <span className="ml-1 flex items-center gap-1.5 text-[11px] text-[var(--green)]">
              <span className="size-[6px] rounded-full bg-[var(--green)]"></span>
              <span className="font-semibold">Running</span>
            </span>
          )}
        </div>

        {/* Utility actions */}
        {activeTab === "logs" && (
          <div className="ml-auto flex shrink-0 items-center gap-1 rounded bg-[var(--base)]/25 p-0.5">
            {showClear && (
              <button
                type="button"
                aria-label="Clear"
                className="cursor-pointer rounded px-2 py-1 text-[12px] font-semibold text-[var(--subtext0)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
                onClick={() => setIsClearConfirmOpen(true)}
                title="Clear terminal output."
              >
                <FontAwesomeIcon icon={faTrashCan} />
              </button>
            )}
            {showHidePanel && (
              <button
                type="button"
                aria-label="Hide Panel"
                className="cursor-pointer rounded px-2 py-1 text-[12px] font-semibold text-[var(--subtext0)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
                onClick={onClose}
                title="Hide the terminal panel."
              >
                <FontAwesomeIcon icon={faEyeSlash} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tab content — both panels stay mounted so ShellTerminalView keeps its PTY
          session alive across tab switches. Visibility is toggled via the HTML
          `hidden` attribute rather than conditional rendering. */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-(--crust)">
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
