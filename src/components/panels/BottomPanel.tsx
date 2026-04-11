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
      className="flex flex-col border-t border-[#313244] bg-[#181825] h-64"
      data-testid="bottom-panel"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#313244]/50">
        <div className="flex items-center gap-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#a6adc8]">
            Output
          </p>
          {isRunning && (
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#a6e3a1]"></span>
              <span className="text-[10px] text-[#a6e3a1] uppercase tracking-wider">Running...</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRun && !isRunning && (
            <button
              type="button"
              className="rounded border border-[#313244] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#cdd6f4] transition hover:border-[#a6e3a1] hover:text-[#a6e3a1]"
              onClick={onRun}
            >
              Run Again
            </button>
          )}
          {onClear && (
            <button
              type="button"
              className="rounded border border-[#313244] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#cdd6f4] transition hover:border-[#45475a] hover:text-white"
              onClick={onClear}
            >
              Clear
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="rounded border border-[#313244] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#cdd6f4] transition hover:border-[#45475a] hover:text-white"
              onClick={onClose}
            >
              Hide
            </button>
          )}
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed selection:bg-[#45475a]"
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
      >
        {output.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[#9399b2] opacity-50 italic">
            No output to display. Click "Run" to execute the program.
          </div>
        ) : (
          <div className="space-y-0.5">
            {output.map((entry, i) => (
              <div 
                key={i} 
                className={`whitespace-pre-wrap break-all ${
                  entry.stream === "stderr" 
                    ? "text-[#f38ba8]" 
                    : entry.stream === "exit"
                    ? "text-[#89b4fa] font-bold border-t border-[#313244] mt-2 pt-2"
                    : "text-[#cdd6f4]"
                }`}
              >
                {entry.line}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default BottomPanel;
