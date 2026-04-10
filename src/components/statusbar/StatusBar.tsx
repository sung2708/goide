type StatusBarProps = {
  workspacePath: string | null;
  activeFilePath: string | null;
  mode: "quick-insight" | "deep-trace";
  runtimeAvailability: "available" | "unavailable";
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
    <div className="flex h-8 items-center justify-between premium-border-t glass-panel px-4 text-[10px] text-[var(--mocha-subtext0)] font-medium">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-[0.2em] text-[var(--mocha-overlay1)]">
            Workspace
          </span>
          <span className="truncate text-[var(--mocha-text)] max-w-[200px]">
            {workspacePath ?? "None selected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-[0.2em] text-[var(--mocha-overlay1)]">File</span>
          <span className="truncate text-[var(--mocha-text)] max-w-[200px]">
            {activeFilePath ?? "None"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-[0.15em] text-[var(--mocha-overlay1)]">
            Mode <span className="text-[var(--mocha-blue)] ml-1">{modeLabel}</span>
          </span>
          <span className="uppercase tracking-[0.15em] text-[var(--mocha-overlay1)]">
            Runtime <span className="text-[var(--mocha-green)] ml-1">{runtimeLabel}</span>
          </span>
        </div>

        <div className="h-4 w-[1px] bg-[var(--mocha-surface1)]" />

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-[var(--mocha-surface1)] px-2 py-0.5 uppercase tracking-[0.15em] text-[var(--mocha-text)] transition hover:border-[var(--mocha-blue)] hover:bg-[var(--mocha-blue)]/10 hover:text-[var(--mocha-blue)]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onToggleCommandPalette}
            aria-expanded={isCommandPaletteOpen}
            aria-controls="command-palette"
            aria-label="Toggle command palette"
          >
            Palette
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-0.5 uppercase tracking-[0.15em] transition ${
              isSummaryOpen
                ? "border-[var(--mocha-rosewater)] bg-[var(--mocha-rosewater)]/10 text-[var(--mocha-rosewater)]"
                : "border-[var(--mocha-surface1)] text-[var(--mocha-text)] hover:border-[var(--mocha-rosewater)] hover:text-[var(--mocha-rosewater)]"
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onToggleSummary}
            aria-expanded={isSummaryOpen}
          >
            Summary
          </button>
          <button
            type="button"
            className={`rounded border px-2 py-0.5 uppercase tracking-[0.15em] transition ${
              isBottomPanelOpen
                ? "border-[var(--mocha-mauve)] bg-[var(--mocha-mauve)]/10 text-[var(--mocha-mauve)]"
                : "border-[var(--mocha-surface1)] text-[var(--mocha-text)] hover:border-[var(--mocha-mauve)] hover:text-[var(--mocha-mauve)]"
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onToggleBottomPanel}
            aria-expanded={isBottomPanelOpen}
          >
            Bottom
          </button>
        </div>

        <div className="h-4 w-[1px] bg-[var(--mocha-surface1)]" />

        <span className="uppercase tracking-[0.2em] text-[var(--mocha-green)] font-semibold">
          Ready
        </span>
      </div>
    </div>
  );
}

export default StatusBar;
