type StatusBarProps = {
  workspacePath: string | null;
  activeFilePath: string | null;
  mode: "quick-insight" | "deep-trace";
  runtimeAvailability: "available" | "unavailable" | "degraded";
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

  return (
    <footer className="beveled-edge glass-morphism flex h-7 items-center justify-between border-t border-[var(--surface0)] bg-[rgba(17,17,27,0.7)] px-3 text-[10px] uppercase tracking-[0.08em] font-medium text-[var(--overlay1)] relative z-50">
      <div className="flex items-center gap-4 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-1.5 w-1.5 rounded-full bg-[var(--green)] shadow-[0_0_4px_var(--green)]"></span>
          <span className="truncate max-w-[120px] font-bold text-[var(--subtext1)] tracking-widest">{workspacePath ? workspacePath.split(/[\\/]/).pop() : "OFFLINE"}</span>
        </div>
        <div className="flex items-center gap-2 opacity-60">
          <span className="text-[var(--surface2)]">/</span>
          <span className="truncate max-w-[180px]">{activeFilePath ?? "IDLE"}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-[var(--surface0)] text-[var(--subtext0)] font-bold">
            <span className={`h-1.5 w-1.5 rounded-full ${mode === "deep-trace" ? "bg-[var(--mauve)] animate-pulse" : "bg-[var(--overlay2)]"}`}></span>
            {modeLabel}
            <span className="sr-only">Mode: {modeLabel}</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded-sm font-bold ${
              runtimeAvailability === "available"
                ? "text-[var(--green)] bg-[var(--signal-confirmed-bg)] phosphor-text"
                : runtimeAvailability === "degraded"
                  ? "text-[var(--peach)] bg-[var(--signal-blocked-bg)]"
                  : "text-[var(--overlay1)] bg-[var(--surface0)]"
            }`}
          >
            {runtimeLabel}
            <span className="sr-only">Runtime: {runtimeLabel}</span>
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
            title="Open the command palette. Command execution is planned for a later story."
            className={`px-2 py-0.5 rounded-sm transition-all font-bold tracking-[0.12em] ${isCommandPaletteOpen ? "bg-[var(--mauve)] text-[var(--crust)] shadow-[0_0_8px_var(--mauve)]" : "hover:bg-[var(--surface0)]"}`}
            onClick={onToggleCommandPalette}
          >
            COMMANDS
          </button>
          <button
            type="button"
            aria-label={isSummaryOpen ? "Hide summary panel" : "Show summary panel"}
            title="Show or hide the concurrency signal summary."
            className={`px-2 py-0.5 rounded-sm transition-all font-bold tracking-[0.12em] ${isSummaryOpen ? "bg-[var(--blue)] text-[var(--crust)] shadow-[0_0_8px_var(--blue)]" : "hover:bg-[var(--surface0)]"}`}
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
            className={`px-2 py-0.5 rounded-sm transition-all font-bold tracking-[0.12em] ${isBottomPanelOpen ? "bg-[var(--blue)] text-[var(--crust)] shadow-[0_0_8px_var(--blue)]" : "hover:bg-[var(--surface0)]"}`}
            onClick={onToggleBottomPanel}
          >
            TERMINAL
          </button>
        </div>

        <div className="h-3 w-[1px] bg-[var(--surface0)] opacity-50"></div>

        <div className="flex items-center gap-3 min-w-[80px] justify-end">
          <span className="font-bold text-[var(--mauve)]">{saveStatus === "saving" ? "SYNCING..." : saveStatus === "saved" ? "READY" : saveStatus === "error" ? "FAULT" : ""}</span>
          <span className={`font-bold ${runStatus === "running" ? "text-[var(--green)] animate-phosphor" : ""}`}>
            {runStatus === "running" ? "LIVE" : ""}
          </span>
        </div>
      </div>
    </footer>
  );
}

export default StatusBar;
