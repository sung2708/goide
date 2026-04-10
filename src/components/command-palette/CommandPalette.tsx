import { useEffect, useRef } from "react";

type CommandPaletteProps = {
  onClose: () => void;
};

function CommandPalette({ onClose }: CommandPaletteProps) {
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
      className="absolute inset-0 z-20 flex items-start justify-center bg-[#11111b]/70 px-4 pt-20"
    >
      <section className="w-full max-w-xl rounded border border-[#313244] bg-[#181825] shadow-lg">
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
          >
            Close
          </button>
        </div>
        <div className="px-4 py-4 text-xs text-[#9399b2]">
          Command entry will be wired in a later story.
        </div>
      </section>
    </div>
  );
}

export default CommandPalette;
