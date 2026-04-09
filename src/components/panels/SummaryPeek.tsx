type SummaryPeekProps = {
  onClose?: () => void;
};

function SummaryPeek({ onClose }: SummaryPeekProps) {
  return (
    <aside
      aria-label="Summary panel"
      className="flex h-full w-[260px] max-w-[320px] flex-col border-l border-[#313244] bg-[#181825]"
      data-testid="summary-panel"
    >
      <div className="flex items-center justify-between border-b border-[#313244] px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#a6adc8]">
            Summary
          </p>
          <p className="mt-1 text-xs text-[#cdd6f4]">Quick Insight peek</p>
        </div>
        {onClose && (
          <button
            type="button"
            className="rounded border border-[#313244] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#cdd6f4] transition hover:border-[#45475a] hover:text-white"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
          >
            Close
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 px-4 py-4 text-xs text-[#9399b2]">
        <p>No signals yet.</p>
        <p>Hover a concurrency line to reveal inline context.</p>
      </div>
    </aside>
  );
}

export default SummaryPeek;
