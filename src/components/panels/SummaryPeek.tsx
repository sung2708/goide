type SummaryPeekProps = {
  onClose?: () => void;
};

function SummaryPeek({ onClose }: SummaryPeekProps) {
  return (
    <aside
      id="summary-panel"
      aria-label="Summary panel"
      className="flex h-full w-[260px] max-w-[320px] flex-col premium-border-l glass-panel shadow-2xl shadow-black/40"
      data-testid="summary-panel"
    >
      <div className="flex items-center justify-between premium-border-b px-4 py-3 bg-[var(--mocha-crust)]/20">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--mocha-subtext0)]">
            Summary
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[var(--mocha-overlay1)] font-medium">Quick Insight peek</p>
        </div>
        {onClose && (
          <button
            type="button"
            className="rounded border border-[var(--mocha-surface1)] px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-[var(--mocha-text)] transition hover:border-[var(--mocha-blue)] hover:bg-[var(--mocha-blue)]/10 hover:text-[var(--mocha-blue)]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
          >
            Close
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-6 text-xs text-[var(--mocha-overlay1)] leading-relaxed">
        <p className="italic">No signals yet.</p>
        <p>Hover a concurrency line to reveal inline context and details.</p>
      </div>
    </aside>
  );
}

export default SummaryPeek;
