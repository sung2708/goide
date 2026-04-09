type StatusBarProps = {
  workspacePath: string | null;
  activeFilePath: string | null;
  isSummaryOpen: boolean;
  isBottomPanelOpen: boolean;
  onToggleSummary: () => void;
  onToggleBottomPanel: () => void;
};

function StatusBar({
  workspacePath,
  activeFilePath,
  isSummaryOpen,
  isBottomPanelOpen,
  onToggleSummary,
  onToggleBottomPanel,
}: StatusBarProps) {
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
        <button
          type="button"
          className="rounded border border-[#313244] px-2 py-1 uppercase tracking-[0.16em] text-[#cdd6f4] transition hover:border-[#45475a] hover:text-white"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleSummary}
          aria-pressed={isSummaryOpen}
          aria-label="Toggle summary panel"
        >
          Summary
        </button>
        <button
          type="button"
          className="rounded border border-[#313244] px-2 py-1 uppercase tracking-[0.16em] text-[#cdd6f4] transition hover:border-[#45475a] hover:text-white"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleBottomPanel}
          aria-pressed={isBottomPanelOpen}
          aria-label="Toggle bottom panel"
        >
          Bottom
        </button>
        <span className="uppercase tracking-[0.16em] text-[#9399b2]">
          Status: Ready
        </span>
      </div>
    </div>
  );
}

export default StatusBar;
