type StatusBarProps = {
  workspacePath: string | null;
  activeFilePath: string | null;
  mode: "quick-insight" | "deep-trace";
  runtimeAvailability: "available" | "unavailable";
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
    runtimeAvailability === "available" ? "Available" : "Unavailable";

  return (
    <div className="flex h-8 items-center justify-between border-t border-[#313244] bg-[#11111b] px-4 text-[11px] text-[#a6adc8]">
      <div className="flex items-center gap-3">
        <span className="uppercase tracking-[0.16em] text-[#9399b2]">
          Workspace
        </span>
        <span className="truncate text-[#cdd6f4]">
          {workspacePath ?? "None selected"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="uppercase tracking-[0.16em] text-[#9399b2]">File</span>
        <span className="truncate text-[#cdd6f4]">
          {activeFilePath ?? "None"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="uppercase tracking-[0.16em] text-[#9399b2]">
          Mode: {modeLabel}
        </span>
        <span className="uppercase tracking-[0.16em] text-[#9399b2]">
          Runtime: {runtimeLabel}
        </span>
        <button
          type="button"
          className="rounded border border-[#313244] px-2 py-1 uppercase tracking-[0.16em] text-[#cdd6f4] transition hover:border-[#45475a] hover:text-white"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleCommandPalette}
          aria-expanded={isCommandPaletteOpen}
          aria-controls="command-palette"
          aria-label="Toggle command palette"
          aria-keyshortcuts="Control+K Meta+K"
        >
          Command Palette
        </button>
        <button
          type="button"
          className="rounded border border-[#313244] px-2 py-1 uppercase tracking-[0.16em] text-[#cdd6f4] transition hover:border-[#45475a] hover:text-white"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleSummary}
          aria-expanded={isSummaryOpen}
          aria-controls="summary-panel"
          aria-label="Toggle summary panel"
        >
          Summary
        </button>
        <button
          type="button"
          className="rounded border border-[#313244] px-2 py-1 uppercase tracking-[0.16em] text-[#cdd6f4] transition hover:border-[#45475a] hover:text-white"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleBottomPanel}
          aria-expanded={isBottomPanelOpen}
          aria-controls="bottom-panel"
          aria-label="Toggle bottom panel"
        >
          Bottom
        </button>
        <span className="uppercase tracking-[0.16em] text-[#9399b2]">
          Save: {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Error" : "Ready"}
        </span>
        <span className="uppercase tracking-[0.16em] text-[#9399b2]">
          Run: {runStatus === "running" ? "Running..." : runStatus === "done" ? "Done" : runStatus === "error" ? "Error" : "Ready"}
        </span>
      </div>
    </div>
  );
}

export default StatusBar;
