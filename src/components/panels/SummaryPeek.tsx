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
        {hasItems ? (
          <ul className="space-y-2">
            {items.map((item) => {
              const symbolText =
                typeof item.symbol === "string" && item.symbol.trim().length > 0
                  ? ` • ${item.symbol.trim()}`
                  : "";

              return (
                <li key={`${item.line}-${item.label}-${item.symbol ?? ""}`}>
                  <button
                    type="button"
                    className="w-full rounded border border-[#313244] px-2 py-2 text-left text-[#cdd6f4] transition hover:border-[#45475a] hover:text-white"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onJumpToLine?.(item.line)}
                    aria-label={`Line ${item.line} ${item.label} ${item.confidence}${symbolText ? ` ${item.symbol}` : ""}`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#a6adc8]">
                      Line {item.line}
                    </p>
                    <p className="mt-1 text-xs">
                      {item.label}
                      <span className="text-[#9399b2]"> • {item.confidence}</span>
                      {symbolText && (
                        <span className="text-[#9399b2]">{symbolText}</span>
                      )}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            <p>No signals yet.</p>
            <p>Hover a concurrency line to reveal inline context.</p>
          </>
        )}
      </div>
    </aside>
  );
}

export default SummaryPeek;
