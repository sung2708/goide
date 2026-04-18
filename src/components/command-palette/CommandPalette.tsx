import Dialog from "../primitives/Dialog";

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
  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      role="dialog"
      id="command-palette"
      dataTestId="command-palette"
      ariaLabel="Command palette"
      className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-start justify-center bg-[rgba(8,11,16,0.72)] px-4 pt-24"
      style={{
        paddingTop: "max(6rem, env(safe-area-inset-top))",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      panelClassName="utilitarian-noise w-full max-w-xl overflow-hidden rounded-lg border border-[rgba(113,125,144,0.25)] bg-[var(--mantle)] shadow-lg"
      closeOnBackdrop={true}
    >
      <div>
        <div className="flex items-center justify-between border-b border-[rgba(113,125,144,0.2)] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase text-[var(--subtext0)] text-balance">
            Command Palette
          </p>
          <button
            type="button"
            className="cursor-pointer rounded border border-[rgba(113,125,144,0.25)] px-2 py-1 text-[10px] text-[var(--subtext1)] transition-colors duration-150 ease-out hover:bg-[rgba(126,162,220,0.1)]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
            title="Close the command palette."
          >
            Close
          </button>
        </div>
        <div className="px-4 py-4 text-xs text-[var(--overlay2)]">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="cursor-pointer rounded border border-[rgba(113,125,144,0.28)] px-3 py-2 text-left text-[11px] text-[var(--subtext1)] transition-colors duration-150 ease-out hover:bg-[rgba(126,162,220,0.12)] disabled:cursor-not-allowed disabled:opacity-50"
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
              className="cursor-pointer rounded border border-[rgba(113,125,144,0.28)] px-3 py-2 text-left text-[11px] text-[var(--subtext1)] transition-colors duration-150 ease-out hover:bg-[rgba(126,162,220,0.12)] disabled:cursor-not-allowed disabled:opacity-50"
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
      </div>
    </Dialog>
  );
}

export default CommandPalette;
