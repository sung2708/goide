import { type ConcurrencyConfidence } from "../../lib/ipc/types";

export type SummaryItem = {
  line: number;
  label: string;
  confidence: ConcurrencyConfidence;
  symbol?: string | null;
};

type SummaryPeekProps = {
  items?: SummaryItem[];
  onJumpToLine?: (line: number) => void;
  onClose?: () => void;
};

function SummaryPeek({ items = [], onJumpToLine, onClose }: SummaryPeekProps) {
  const hasItems = items.length > 0;

  return (
    <aside
      id="summary-panel"
      aria-label="Summary panel"
      className="glass-morphism utilitarian-noise flex h-full w-[260px] max-w-[320px] flex-col border-l border-[var(--surface0)] animate-reveal-right z-10"
      style={{ backgroundColor: 'rgba(24, 24, 37, 0.65)' }}
      data-testid="summary-panel"
    >
      <div className="flex items-center justify-between border-b border-[var(--surface0)] px-4 py-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--overlay1)]">
            Summary
          </p>
          <p className="mt-1 text-[10px] text-[var(--overlay2)] uppercase tracking-wider">Quick Insight peek</p>
        </div>
        {onClose && (
          <button
            type="button"
            className="rounded border border-[var(--surface1)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--subtext1)] transition hover:bg-[var(--surface0)]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
          >
            Hide
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-2 scrollbar-hide">
        {hasItems ? (
          <div className="space-y-1">
            {items.map((item, index) => {
              const symbolText =
                typeof item.symbol === "string" && item.symbol.trim().length > 0
                  ? item.symbol.trim()
                  : null;

              return (
                <button
                  key={`${item.line}-${item.label}-${item.symbol ?? ""}`}
                  type="button"
                  className="group w-full rounded p-2 text-left transition-colors hover:bg-[var(--surface0)] animate-fade-in"
                  style={{ animationDelay: `${index * 0.05}s` }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onJumpToLine?.(item.line)}
                  aria-label={`Line ${item.line} ${item.label} ${item.confidence}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[var(--overlay1)] uppercase tracking-widest">L{item.line}</span>
                    <span className={`text-[9px] uppercase tracking-tighter px-1 rounded ${
                      item.confidence === "confirmed" ? "bg-[var(--signal-confirmed-bg)] text-[var(--green)]" :
                      item.confidence === "likely" ? "bg-[var(--signal-likely-bg)] text-[var(--yellow)]" :
                      "bg-[var(--signal-predicted-bg)] text-[var(--overlay0)]"
                    }`}>
                      {item.confidence}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    <span className="text-[12px] font-medium text-[var(--text)] group-hover:text-[var(--blue)] transition-colors">
                      {item.label}
                    </span>
                    {symbolText && (
                      <span className="text-[11px] text-[var(--overlay0)] font-code">
                        {symbolText}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
            <p className="text-[11px] text-[var(--overlay0)] italic leading-relaxed">
              No concurrency signals detected in current scope.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

export default SummaryPeek;
