import { useEffect, useRef } from "react";

type CommandPaletteProps = {
  onClose: () => void;
  canRun: boolean;
  canRunWithRace: boolean;
  isRunning: boolean;
  onRun: () => void;
  onRunWithRace: () => void;
};

function CommandPalette({
  onClose,
  canRun,
  canRunWithRace,
  isRunning,
  onRun,
  onRunWithRace,
}: CommandPaletteProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Basic focus trap: focus the default action on mount
    closeButtonRef.current?.focus();
  }, []);

  return (
    <div
      id="command-palette"
      data-testid="command-palette"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="absolute inset-0 z-50 flex items-start justify-center backdrop-blur-md bg-[rgba(17,17,27,0.4)] px-4 pt-24 animate-fade-in"
    >
      <section className="glass-morphism utilitarian-noise w-full max-w-xl rounded-lg border border-[var(--surface0)] shadow-2xl overflow-hidden" style={{ backgroundColor: 'rgba(30, 30, 46, 0.85)' }}>
        <div className="flex items-center justify-between border-b border-[#313244] px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#a6adc8]">
            Command Palette
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            className="rounded border border-[#313244] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#cdd6f4] transition hover:border-[#45475a] hover:text-white"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
            title="Close the command palette."
          >
            Close
          </button>
        </div>
        <div className="px-4 py-4 text-xs text-[#9399b2]">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="rounded border border-[#313244] px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-[#cdd6f4] transition hover:border-[#45475a] hover:bg-[rgba(49,50,68,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canRun || isRunning}
              onClick={() => {
                onRun();
                onClose();
              }}
              title="Run the active Go file."
            >
              Run File
            </button>
            <button
              type="button"
              className="rounded border border-[#313244] px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-[#cdd6f4] transition hover:border-[#45475a] hover:bg-[rgba(49,50,68,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canRunWithRace || isRunning}
              onClick={() => {
                onRunWithRace();
                onClose();
              }}
              title="Run the active Go file with the Go race detector."
            >
              Run With Race Detector
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export default CommandPalette;
