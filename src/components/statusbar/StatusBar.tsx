import { cn } from "../../lib/utils/cn";

type StatusBarProps = {
  workspacePath: string | null;
  activeFilePath: string | null;
  mode: "quick-insight" | "deep-trace";
  runtimeAvailability: "available" | "unavailable" | "degraded";
  diagnosticsAvailability: "available" | "unavailable" | "idle";
  completionAvailability: "available" | "degraded" | "idle";
  saveStatus?: "idle" | "saving" | "saved" | "error";
  runStatus?: "idle" | "running" | "done" | "error";
  isSummaryOpen: boolean;
  isBottomPanelOpen: boolean;
  isCommandPaletteOpen: boolean;
  onToggleSummary: () => void;
  onToggleBottomPanel: () => void;
  onToggleCommandPalette: () => void;
};

function StatusBar({
  workspacePath,
  activeFilePath,
  mode,
  runtimeAvailability,
  diagnosticsAvailability,
  completionAvailability,
  saveStatus = "idle",
  runStatus = "idle",
  isSummaryOpen,
  isBottomPanelOpen,
  isCommandPaletteOpen,
  onToggleSummary,
  onToggleBottomPanel,
  onToggleCommandPalette,
}: StatusBarProps) {
  const modeLabel = mode === "deep-trace" ? "Deep Trace" : "Quick Insight";
  const runtimeLabel =
    runtimeAvailability === "available"
      ? "Active"
      : runtimeAvailability === "degraded"
        ? "Degraded"
        : "Static";
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

  return (
    <footer className="glass-morphism relative z-50 flex h-8 items-center justify-between border-t border-[rgba(113,125,144,0.25)] bg-[rgba(12,17,24,0.86)] px-3 text-[10px] font-medium text-[var(--overlay1)]">
      <div className="flex items-center gap-4 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="flex size-1.5 rounded-full bg-[var(--green)]"></span>
          <span className="max-w-[120px] truncate font-semibold text-[var(--subtext1)] tabular-nums">
            {workspacePath ? workspacePath.split(/[\\/]/).pop() : "OFFLINE"}
          </span>
        </div>
        <div className="flex items-center gap-2 opacity-75">
          <span className="text-[var(--surface2)]">/</span>
          <span className="max-w-[180px] truncate">{activeFilePath ?? "IDLE"}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-sm border border-[rgba(113,125,144,0.25)] bg-[rgba(42,48,61,0.6)] px-2 py-0.5 font-semibold text-[var(--subtext0)]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${mode === "deep-trace" ? "bg-[var(--blue)]" : "bg-[var(--overlay2)]"}`}
            ></span>
            {modeLabel}
            <span className="sr-only">Mode: {modeLabel}</span>
          </span>
          <span
            className={cn(
              "rounded-sm border px-2 py-0.5 font-semibold",
              runtimeAvailability === "available"
                ? "border-[rgba(127,176,142,0.35)] bg-[var(--signal-confirmed-bg)] text-[var(--green)]"
                : runtimeAvailability === "degraded"
                  ? "border-[rgba(213,189,117,0.35)] bg-[var(--signal-likely-bg)] text-[var(--yellow)]"
                  : "border-[rgba(113,125,144,0.25)] bg-[rgba(42,48,61,0.45)] text-[var(--overlay1)]"
            )}
          >
            {runtimeLabel}
            <span className="sr-only">Runtime: {runtimeLabel}</span>
          </span>
          <span
            title={
              completionAvailability === "available"
                ? "Completion requests are healthy."
                : completionAvailability === "degraded"
                  ? "Completion backend is unavailable. Retry after a moment."
                  : "Completion has not been checked for the current context yet."
            }
            className={cn(
              "rounded-sm border px-2 py-0.5 font-semibold",
              completionAvailability === "available"
                ? "border-[rgba(127,176,142,0.35)] bg-[rgba(166,227,161,0.08)] text-[var(--green)]"
                : completionAvailability === "degraded"
                  ? "border-[rgba(213,189,117,0.35)] bg-[var(--signal-likely-bg)] text-[var(--yellow)]"
                  : "border-[rgba(113,125,144,0.25)] bg-[rgba(42,48,61,0.45)] text-[var(--overlay1)]"
            )}
          >
            {completionLabel}
            <span className="sr-only">Completion: {completionLabel}</span>
          </span>
          <span
            title={
              diagnosticsAvailability === "available"
                ? "Diagnostics are available."
                : diagnosticsAvailability === "unavailable"
                  ? "gopls is unavailable. Install gopls to restore diagnostics."
                  : "Diagnostics have not been checked for the current context yet."
            }
            className={cn(
              "rounded-sm border px-2 py-0.5 font-semibold",
              diagnosticsAvailability === "available"
                ? "border-[rgba(127,176,142,0.35)] bg-[rgba(166,227,161,0.08)] text-[var(--green)]"
                : diagnosticsAvailability === "unavailable"
                  ? "border-[rgba(213,189,117,0.35)] bg-[var(--signal-likely-bg)] text-[var(--yellow)]"
                  : "border-[rgba(113,125,144,0.25)] bg-[rgba(42,48,61,0.45)] text-[var(--overlay1)]"
            )}
          >
            {diagnosticsLabel}
            <span className="sr-only">Diagnostics: {diagnosticsLabel}</span>
          </span>
        </div>

        <div className="h-3 w-[1px] bg-[var(--surface0)] opacity-50"></div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={
              isCommandPaletteOpen
                ? "Hide commands palette"
                : "Show commands palette"
            }
            title="Open the command palette for quick run commands."
            className={cn(
              "rounded-sm px-2 py-0.5 font-semibold transition-colors duration-150 ease-out",
              isCommandPaletteOpen
                ? "bg-[rgba(126,162,220,0.2)] text-[var(--flamingo)]"
                : "text-[var(--subtext0)] hover:bg-[rgba(126,162,220,0.1)] hover:text-[var(--subtext1)]"
            )}
            onClick={onToggleCommandPalette}
          >
            COMMANDS
          </button>
          <button
            type="button"
            aria-label={isSummaryOpen ? "Hide summary panel" : "Show summary panel"}
            title="Show or hide the concurrency signal summary."
            className={cn(
              "rounded-sm px-2 py-0.5 font-semibold transition-colors duration-150 ease-out",
              isSummaryOpen
                ? "bg-[rgba(126,162,220,0.2)] text-[var(--flamingo)]"
                : "text-[var(--subtext0)] hover:bg-[rgba(126,162,220,0.1)] hover:text-[var(--subtext1)]"
            )}
            onClick={onToggleSummary}
          >
            SUMMARY
          </button>
          <button
            type="button"
            aria-label={
              isBottomPanelOpen ? "Hide terminal panel" : "Show terminal panel"
            }
            title="Show or hide run output for the active Go file."
            className={cn(
              "rounded-sm px-2 py-0.5 font-semibold transition-colors duration-150 ease-out",
              isBottomPanelOpen
                ? "bg-[rgba(126,162,220,0.2)] text-[var(--flamingo)]"
                : "text-[var(--subtext0)] hover:bg-[rgba(126,162,220,0.1)] hover:text-[var(--subtext1)]"
            )}
            onClick={onToggleBottomPanel}
          >
            TERMINAL
          </button>
        </div>

        <div className="h-3 w-[1px] bg-[var(--surface0)] opacity-50"></div>

        <div className="flex min-w-[80px] items-center justify-end gap-3 tabular-nums">
          <span className="font-semibold text-[var(--overlay2)]">
            {saveStatus === "saving"
              ? "SYNCING..."
              : saveStatus === "saved"
                ? "READY"
                : saveStatus === "error"
                  ? "FAULT"
                  : ""}
          </span>
          <span className={cn("font-semibold", runStatus === "running" && "text-[var(--green)]")}>
            {runStatus === "running" ? "LIVE" : ""}
          </span>
        </div>
      </div>
    </footer>
  );
}

export default StatusBar;
