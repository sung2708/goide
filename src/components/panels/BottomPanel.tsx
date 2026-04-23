import { useState } from "react";
import { cn } from "../../lib/utils/cn";
import type { BottomPanelTab, RunOutputPayload } from "../../lib/ipc/types";
import AlertDialog from "../primitives/AlertDialog";
import LogsTerminalView from "./LogsTerminalView";
import ShellTerminalView from "./ShellTerminalView";

export type { BottomPanelTab };

type BottomPanelProps = {
  activeTab: BottomPanelTab;
  onActiveTabChange: (tab: BottomPanelTab) => void;
  logEntries: RunOutputPayload[];
  shellSessionKey: string | null;
  workspacePath: string | null;
  shellCwdRelativePath?: string | null;
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
  shellSessionKey,
  workspacePath,
  shellCwdRelativePath,
  onClose,
  isRunning = false,
  onClear,
  onRun,
  onRunWithRace,
  onStop,
  canRunWithRace = false,
}: BottomPanelProps) {
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const tabBase =
    "rounded-sm px-3 py-1 text-[12px] font-semibold transition-colors duration-100";
  const tabActive = "bg-[var(--bg-active)] text-[var(--lavender)]";
  const tabInactive =
    "text-[var(--overlay1)] hover:text-[var(--subtext1)] hover:bg-[var(--bg-hover)]";

  return (
    <section
      id="bottom-panel"
      aria-label="Bottom panel"
      className="relative z-40 flex max-h-[40vh] min-h-[11rem] flex-col border-t border-[var(--border-muted)] bg-[var(--mantle)]"
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

        {/* Action buttons — only shown on the Logs tab */}
        {activeTab === "logs" && (
          <div className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-0.5">
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
            {onRunWithRace && !isRunning && (
              <button
                type="button"
                className="cursor-pointer rounded border border-[rgba(140,170,238,0.3)] bg-[rgba(140,170,238,0.06)] px-3 py-1 text-[12px] font-semibold text-[var(--blue)] transition-colors duration-100 hover:bg-[rgba(140,170,238,0.12)] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={onRunWithRace}
                disabled={!canRunWithRace}
                title="Run the active Go file with race detection."
              >
                Run Race
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
            {onClear && (
              <button
                type="button"
                className="cursor-pointer rounded border border-[var(--border-subtle)] px-3 py-1 text-[12px] text-[var(--subtext0)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
                onClick={() => setIsClearConfirmOpen(true)}
                title="Clear terminal output."
              >
                Clear
              </button>
            )}
            {onClose && (
              <button
                type="button"
                className="cursor-pointer rounded border border-[var(--border-subtle)] px-3 py-1 text-[12px] text-[var(--subtext0)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
                onClick={onClose}
                title="Hide the terminal panel."
              >
                Hide
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tab content — both panels stay mounted so ShellTerminalView keeps its PTY
          session alive across tab switches. Visibility is toggled via the HTML
          `hidden` attribute rather than conditional rendering. */}
      <div className="flex-1 overflow-hidden">
        <div hidden={activeTab !== "logs"} className="h-full">
          <LogsTerminalView entries={logEntries} className="h-full" />
        </div>
        <div hidden={activeTab !== "shell"} className="h-full">
          <ShellTerminalView
            workspacePath={workspacePath}
            editorSessionKey={shellSessionKey}
            cwdRelativePath={shellCwdRelativePath}
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
