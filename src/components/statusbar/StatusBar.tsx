import { cn } from "../../lib/utils/cn";
import type { ToolchainStatus } from "../../lib/ipc/types";

type StatusBarProps = {
  workspacePath: string | null;
  activeFilePath: string | null;
  activeSymbol?: {
    kind: string;
    name: string;
    line: number;
  } | null;
  onJumpToActiveSymbol?: () => void;
  mode: "quick-insight" | "deep-trace";
  runtimeAvailability: "available" | "unavailable" | "degraded";
  diagnosticsAvailability: "available" | "unavailable" | "idle";
  completionAvailability: "available" | "degraded" | "idle";
  toolchainStatus?: ToolchainStatus | null;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  runStatus?: "idle" | "running" | "done" | "error";
  branchName?: string | null;
  onToggleBranchPicker?: () => void;
  isBottomPanelOpen: boolean;
  onToggleBottomPanel: () => void;
};

function StatusBar({
  workspacePath,
  activeFilePath,
  activeSymbol = null,
  onJumpToActiveSymbol,
  mode,
  runtimeAvailability,
  diagnosticsAvailability,
  completionAvailability,
  toolchainStatus = null,
  saveStatus = "idle",
  runStatus = "idle",
  branchName,
  onToggleBranchPicker,
  isBottomPanelOpen,
  onToggleBottomPanel,
}: StatusBarProps) {
  const modeLabel = mode === "deep-trace" ? "Deep Trace" : "Quick Insight";
  const runtimeLabel =
    runtimeAvailability === "available"
      ? "Runtime OK"
      : runtimeAvailability === "degraded"
        ? "Runtime Retry"
        : "Runtime Off";
  const diagnosticsLabel =
    diagnosticsAvailability === "available"
      ? "Diag OK"
      : diagnosticsAvailability === "unavailable"
        ? "Diag Setup"
        : "Diag --";
  const completionLabel =
    completionAvailability === "available"
      ? "Comp OK"
      : completionAvailability === "degraded"
        ? "Comp Retry"
        : "Comp --";
  const missingTools = toolchainStatus
    ? ([
        ["go", toolchainStatus.go],
        ["gopls", toolchainStatus.gopls],
        ["dlv", toolchainStatus.delve],
      ] as const)
        .filter(([, status]) => !status.available)
        .map(([name]) => name)
    : [];
  const toolsLabel =
    toolchainStatus === null
      ? "Tools --"
      : missingTools.length === 0
        ? "Tools OK"
        : "Tools Setup";
  const pillOk = "bg-[rgba(166,209,137,0.08)] text-(--green)";
  const pillWarn = "bg-[rgba(229,200,144,0.08)] text-[var(--yellow)]";
  const pillIdle = "bg-[var(--surface0)] text-[var(--overlay1)]";
  const workspaceOpen = workspacePath !== null;

  const healthStates = [
    runtimeAvailability === "available",
    diagnosticsAvailability === "available" || diagnosticsAvailability === "idle",
    completionAvailability === "available" || completionAvailability === "idle",
    toolchainStatus !== null && missingTools.length === 0,
  ];
  const healthOkCount = healthStates.filter(Boolean).length;

  return (
    <footer className="relative z-50 flex h-8 items-center justify-between border-t border-(--border-subtle) bg-(--crust) px-2.5 text-[11px] font-medium text-(--subtext0)">
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className={cn("flex size-1.5 rounded-full", workspaceOpen ? "bg-(--green)" : "bg-(--overlay1)")}></span>
          <span className="max-w-[140px] truncate font-semibold text-[var(--subtext1)] tabular-nums">
            {workspacePath ? workspacePath.split(/[\\/]/).pop() : "OFFLINE"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[var(--overlay1)]">
          <span className="text-[var(--surface2)]">/</span>
          <span className="max-w-[200px] truncate">{activeFilePath ?? "IDLE"}</span>
        </div>
        {branchName && onToggleBranchPicker && (
          <button
            type="button"
            aria-label="Switch branch"
            className="rounded px-2 py-0.5 font-semibold bg-[var(--surface0)] text-[var(--subtext1)]"
            onClick={onToggleBranchPicker}
          >
            {branchName}
          </button>
        )}
        {activeSymbol && onJumpToActiveSymbol && (
          <div
            data-testid="status-bar-symbol-indicator"
            className="flex items-center gap-1.5 text-[var(--overlay1)]"
          >
            <span className="text-[var(--surface2)]">/</span>
            <button
              type="button"
              aria-label="Jump to active symbol"
              className="flex min-w-0 items-center gap-1.5 rounded bg-[var(--surface0)] px-1.5 py-0.5 text-left font-semibold text-[var(--subtext1)] transition-colors duration-100 hover:bg-[var(--bg-hover)]"
              onClick={onJumpToActiveSymbol}
              title={`Jump to ${activeSymbol.name} on line ${activeSymbol.line}.`}
            >
              <span className="rounded bg-[var(--surface1)] px-1.5 py-0.5 uppercase tracking-[0.04em] text-[var(--overlay1)]">
                {activeSymbol.kind}
              </span>
              <span className="max-w-[140px] truncate">{activeSymbol.name}</span>
              <span className="text-[rgba(113,125,144,0.6)]">L{activeSymbol.line}</span>
            </button>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5 pr-0.5">
        <div className="flex items-center gap-1">
          <span className="flex items-center gap-1.5 rounded bg-(--surface0) px-2 py-0.5 font-semibold text-(--subtext0)">
            <span
              className={cn("size-1 rounded-full", mode === "deep-trace" ? "bg-(--blue)" : "bg-(--overlay2)")}
            ></span>
            {modeLabel}
            <span className="sr-only">Mode: {modeLabel}</span>
          </span>
          {runtimeAvailability !== "unavailable" && (
            <span
              title={`Runtime: ${runtimeLabel}`}
              className={cn(
                "rounded px-1.5 py-0.5 font-semibold",
                runtimeAvailability === "available"
                  ? "bg-[rgba(166,209,137,0.08)] text-(--green)"
                  : "bg-[rgba(229,200,144,0.08)] text-(--yellow)"
              )}
            >
              Runtime: {runtimeLabel}
            </span>
          )}
          {diagnosticsAvailability !== "available" && (
            <span
              title={
                diagnosticsAvailability === "unavailable"
                  ? "gopls is unavailable. Install gopls to restore diagnostics."
                  : "Diagnostics have not been checked for the active file."
              }
              className={cn(
                "rounded px-1.5 py-0.5 font-semibold",
                diagnosticsAvailability === "unavailable"
                  ? "bg-[rgba(229,200,144,0.08)] text-(--yellow)"
                  : "bg-(--surface0) text-(--overlay1)"
              )}
            >
              {diagnosticsLabel}
            </span>
          )}
          {completionAvailability !== "idle" && (
            <span
              title={
                completionAvailability === "degraded"
                  ? "Completion backend is unavailable. Editing still works; retry completions after the language service recovers."
                  : "Completion backend is available."
              }
              className={cn(
                "rounded px-1.5 py-0.5 font-semibold",
                completionAvailability === "degraded"
                  ? "bg-[rgba(229,200,144,0.08)] text-(--yellow)"
                  : "bg-[rgba(166,209,137,0.08)] text-(--green)"
              )}
            >
              {completionLabel}
            </span>
          )}
          <span
            title={`Runtime: ${runtimeLabel}\nDiagnostics: ${diagnosticsLabel}\nCompletion: ${completionLabel}\nToolchain: ${toolsLabel}`}
            className={cn(
              "rounded px-1.5 py-0.5 font-semibold",
              healthOkCount >= 3 ? pillOk : healthOkCount >= 2 ? pillWarn : pillIdle
            )}
          >
            Health {healthOkCount}/4
          </span>
        </div>

        <div className="flex items-center">
          <button
            type="button"
            aria-label={isBottomPanelOpen ? "Hide terminal panel" : "Show terminal panel"}
            title="Show or hide the Logs and Shell terminal panel for the active editor session."
            className={cn(
              "rounded px-2 py-0.5 font-semibold transition-colors duration-100",
              isBottomPanelOpen
                ? "bg-(--bg-active) text-(--lavender)"
                : "text-(--subtext0) hover:bg-(--bg-hover) hover:text-(--subtext1)"
            )}
            onClick={onToggleBottomPanel}
          >
            TERM
          </button>
        </div>

        <div className="ml-1 flex min-w-0 items-center justify-end gap-2 tabular-nums">
          <span className="font-semibold text-(--overlay2)">
            {saveStatus === "saving"
              ? "SYNCING..."
              : saveStatus === "saved"
                ? "READY"
                : saveStatus === "error"
                  ? "FAULT"
                  : ""}
          </span>
          <span className={cn("font-semibold", runStatus === "running" && "text-(--green)")}>
            {runStatus === "running" ? "LIVE" : ""}
          </span>
        </div>
      </div>
    </footer>
  );
}

export default StatusBar;
