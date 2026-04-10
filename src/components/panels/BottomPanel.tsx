type BottomPanelProps = {
  onClose?: () => void;
};

function BottomPanel({ onClose }: BottomPanelProps) {
  return (
    <section
      id="bottom-panel"
      aria-label="Bottom panel"
      className="premium-border-t glass-panel shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.5)]"
      data-testid="bottom-panel"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--mocha-crust)]/20">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--mocha-subtext0)]">
            Bottom Panel
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[var(--mocha-overlay1)] font-medium">Logs and trace notes</p>
        </div>
        {onClose && (
          <button
            type="button"
            className="rounded border border-[var(--mocha-surface1)] px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-[var(--mocha-text)] transition hover:border-[var(--mocha-mauve)] hover:bg-[var(--mocha-mauve)]/10 hover:text-[var(--mocha-mauve)]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
          >
            Hide
          </button>
        )}
      </div>
      <div className="px-4 py-4 text-xs text-[var(--mocha-overlay1)] font-medium bg-[var(--mocha-mantle)]/10">
        Hidden by default. Open when you need deeper inspection of logs or trace data.
      </div>
    </section>
  );
}

export default BottomPanel;
