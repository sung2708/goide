import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils/cn";
import type { RunOutputPayload } from "../../lib/ipc/types";
import AlertDialog from "../primitives/AlertDialog";

type BottomPanelProps = {
  onClose?: () => void;
  output?: RunOutputPayload[];
  isRunning?: boolean;
  onClear?: () => void;
  onRun?: () => void;
  onRunWithRace?: () => void;
  canRunWithRace?: boolean;
};

function BottomPanel({
  onClose,
  output = [],
  isRunning = false,
  onClear,
  onRun,
  onRunWithRace,
  canRunWithRace = false,
}: BottomPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <section
      id="bottom-panel"
      aria-label="Bottom panel"
      className="utilitarian-noise relative z-40 flex max-h-[40vh] min-h-[11rem] flex-col border-t border-[rgba(113,125,144,0.25)] bg-[rgba(12,17,24,0.88)] shadow-lg"
      data-testid="bottom-panel"
    >
      <div className="relative z-50 flex items-center justify-between border-b border-[rgba(113,125,144,0.2)] bg-[var(--mantle)] px-4 py-2">
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-semibold uppercase text-[var(--overlay1)] text-balance">
            Terminal
          </p>
          {isRunning && (
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-[var(--green)]"></span>
              <span className="text-[10px] font-bold text-[var(--green)]">
                Running
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRun && !isRunning && (
            <button
              type="button"
              className="cursor-pointer rounded border border-[rgba(127,176,142,0.35)] bg-[rgba(127,176,142,0.16)] px-3 py-1 text-[10px] font-semibold text-[var(--green)] transition-colors duration-150 ease-out hover:bg-[rgba(127,176,142,0.26)]"
              onClick={onRun}
              title="Run the active Go file again."
            >
              Run Again
            </button>
          )}
          {onRunWithRace && !isRunning && (
            <button
              type="button"
              className="cursor-pointer rounded border border-[rgba(126,162,220,0.35)] px-3 py-1 text-[10px] font-semibold text-[var(--blue)] transition-colors duration-150 ease-out hover:bg-[rgba(126,162,220,0.12)] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onRunWithRace}
              disabled={!canRunWithRace}
              title="Run the active Go file with race detection."
            >
              Run Race
            </button>
          )}
          {onClear && (
            <button
              type="button"
              className="cursor-pointer rounded border border-[rgba(113,125,144,0.3)] px-3 py-1 text-[10px] text-[var(--subtext1)] transition-colors duration-150 ease-out hover:bg-[rgba(126,162,220,0.1)]"
              onClick={() => setIsClearConfirmOpen(true)}
              title="Clear terminal output."
            >
              Clear
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="cursor-pointer rounded border border-[rgba(113,125,144,0.3)] px-3 py-1 text-[10px] text-[var(--subtext1)] transition-colors duration-150 ease-out hover:bg-[rgba(126,162,220,0.1)]"
              onClick={onClose}
              title="Hide the terminal panel."
            >
              Hide
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative z-40 flex-1 overflow-auto bg-[rgba(12,17,24,0.55)] p-5 font-code text-[12px] leading-relaxed selection:bg-[rgba(126,162,220,0.28)]"
        style={{ scrollbarWidth: "thin" }}
      >
        {output.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[10px] italic text-[var(--overlay0)] opacity-50 text-pretty">
            Unit idle. Standby for output.
          </div>
        ) : (
          <div className="space-y-1">
            {output.map((entry, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-all",
                  entry.stream === "stderr"
                    ? "text-[var(--red)] opacity-90"
                    : entry.stream === "exit"
                      ? "mt-4 flex justify-between border-t border-[var(--surface0)] pt-3 font-bold text-[var(--blue)]"
                      : "text-[var(--green)] opacity-80"
                )}
              >
                <span>{entry.line}</span>
                {entry.stream === "exit" && (
                  <span className="text-[10px] opacity-60">Process Terminated</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={isClearConfirmOpen}
        onOpenChange={setIsClearConfirmOpen}
        title="Clear output?"
        description="This will remove all current terminal lines."
        onConfirm={() => onClear?.()}
        confirmLabel="Clear"
        cancelLabel="Cancel"
      />
    </section>
  );
}

export default BottomPanel;
