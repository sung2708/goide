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
      className="relative z-40 flex max-h-[40vh] min-h-[11rem] flex-col border-t border-[var(--border-muted)] bg-[var(--mantle)]"
      data-testid="bottom-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--mantle)] px-3 py-2.5">
        <div className="flex items-center gap-3">
          <p className="text-[12px] font-semibold uppercase text-[var(--overlay1)] text-balance">
            Terminal
          </p>
          {isRunning && (
            <span className="flex items-center gap-2">
              <span className="size-[6px] rounded-full bg-[var(--green)]"></span>
              <span className="text-[12px] font-semibold text-[var(--green)]">
                Running
              </span>
            </span>
          )}
        </div>
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-0.5">
          {onRun && !isRunning && (
            <button
              type="button"
              className="cursor-pointer rounded border border-[rgba(166,209,137,0.3)] bg-[rgba(166,209,137,0.08)] px-3 py-1 text-[12px] font-semibold text-[var(--green)] transition-colors duration-100 hover:bg-[rgba(166,209,137,0.16)]"
              onClick={onRun}
              title="Run the active Go file again."
            >
              Run Again
            </button>
          )}
          {onRunWithRace && !isRunning && (
            <button
              type="button"
              className="cursor-pointer rounded border border-[rgba(140,170,238,0.3)] bg-[rgba(140,170,238,0.06)] px-3 py-1 text-[12px] font-semibold text-[var(--blue)] transition-colors duration-100 hover:bg-[rgba(140,170,238,0.12)] disabled:cursor-not-allowed disabled:opacity-40"
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
              className="cursor-pointer rounded border border-[var(--border-subtle)] px-3 py-1 text-[12px] text-[var(--subtext0)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
              onClick={() => setIsClearConfirmOpen(true)}
              title="Clear terminal output."
            >
              Clear
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="cursor-pointer rounded border border-[var(--border-subtle)] px-3 py-1 text-[12px] text-[var(--subtext0)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
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
        className="flex-1 overflow-auto bg-[var(--crust)] p-4 font-code text-[13px] leading-relaxed selection:bg-[var(--selection-bg-strong)]"
        style={{ scrollbarWidth: "thin" }}
      >
        {output.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] italic text-[var(--overlay0)]">
            No run output yet.
          </div>
        ) : (
          <div className="space-y-0.5">
            {output.map((entry, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-all",
                  entry.stream === "stderr"
                    ? "text-[var(--red)]"
                    : entry.stream === "exit"
                      ? "mt-3 flex justify-between border-t border-[var(--surface0)] pt-3 font-semibold text-[var(--blue)]"
                      : "text-[var(--green)]"
                )}
              >
                <span>{entry.line}</span>
                {entry.stream === "exit" && (
                  <span className="text-[12px] text-[var(--overlay1)]">Process Terminated</span>
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
