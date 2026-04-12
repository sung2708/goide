import { useEffect, useRef } from "react";
import type { RunOutputPayload } from "../../lib/ipc/types";

type BottomPanelProps = {
  onClose?: () => void;
  output?: RunOutputPayload[];
  isRunning?: boolean;
  onClear?: () => void;
  onRun?: () => void;
};

function BottomPanel({
  onClose,
  output = [],
  isRunning = false,
  onClear,
  onRun,
}: BottomPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when output changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <section
      id="bottom-panel"
      aria-label="Bottom panel"
      className="glass-morphism utilitarian-noise scanline-effect flex flex-col border-t border-[var(--surface0)] animate-reveal-up shadow-2xl relative z-40"
      style={{ backgroundColor: 'rgba(17, 17, 27, 0.6)' }}
      data-testid="bottom-panel"
    >
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--mantle)] border-b border-[var(--surface0)] relative z-50">
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--overlay1)]">
            Terminal
          </p>
          {isRunning && (
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--green)] shadow-[0_0_8px_var(--green)]"></span>
              <span className="text-[10px] text-[var(--green)] font-bold uppercase tracking-widest phosphor-text">Running</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRun && !isRunning && (
            <button
              type="button"
              className="beveled-edge rounded bg-[var(--green)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--crust)] transition-opacity hover:opacity-90"
              onClick={onRun}
            >
              Run Again
            </button>
          )}
          {onClear && (
            <button
              type="button"
              className="beveled-edge rounded border border-[var(--surface1)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--subtext1)] transition hover:bg-[var(--surface0)]"
              onClick={onClear}
            >
              Clear
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="beveled-edge rounded border border-[var(--surface1)] px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--subtext1)] transition hover:bg-[var(--surface0)]"
              onClick={onClose}
            >
              Hide
            </button>
          )}
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-auto p-5 font-code text-[12px] leading-relaxed selection:bg-[var(--surface1)] relative z-40 bg-[rgba(17,17,27,0.4)]"
        style={{ scrollbarWidth: "thin" }}
      >
        {output.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[var(--overlay0)] italic opacity-50 tracking-wide uppercase text-[10px]">
            Unit idle. Standby for output.
          </div>
        ) : (
          <div className="space-y-1">
            {output.map((entry, i) => (
              <div 
                key={i} 
                className={`whitespace-pre-wrap break-all transition-all animate-fade-in ${
                  entry.stream === "stderr" 
                    ? "text-[var(--red)] opacity-90" 
                    : entry.stream === "exit"
                    ? "text-[var(--blue)] font-bold border-t border-[var(--surface0)] mt-4 pt-3 flex justify-between phosphor-text"
                    : "text-[var(--green)] opacity-80 phosphor-text"
                }`}
                style={{ "--green-glow": entry.stream === "stderr" ? "var(--red)" : "var(--green)" } as any}
              >
                <span>{entry.line}</span>
                {entry.stream === "exit" && (
                  <span className="text-[10px] uppercase tracking-[0.2em] opacity-60">Process Terminated</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default BottomPanel;
