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
      className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-start justify-center bg-[rgba(35,38,52,0.7)] px-4 pt-24"
      style={{
        paddingTop: "max(6rem, env(safe-area-inset-top))",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      panelClassName="w-full max-w-xl overflow-hidden rounded-lg border border-[var(--border-muted)] bg-[var(--mantle)] shadow-[var(--panel-shadow)]"
      closeOnBackdrop={true}
    >
      <div>
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3.5">
          <p className="text-[13px] font-semibold text-[var(--lavender)]">
            Command Palette
          </p>
          <button
            type="button"
            className="cursor-pointer rounded border border-[var(--border-subtle)] px-2.5 py-1 text-[12px] text-[var(--subtext0)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
            title="Close the command palette."
          >
            Close
          </button>
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="cursor-pointer rounded border border-[var(--border-subtle)] px-4 py-2.5 text-left text-[13px] font-medium text-[var(--subtext1)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
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
              className="cursor-pointer rounded border border-[var(--border-subtle)] px-4 py-2.5 text-left text-[13px] font-medium text-[var(--subtext1)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
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
