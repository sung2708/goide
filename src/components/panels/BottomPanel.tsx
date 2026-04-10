type BottomPanelProps = {
  onClose?: () => void;
};

function BottomPanel({ onClose }: BottomPanelProps) {
  return (
    <section
      id="bottom-panel"
      aria-label="Bottom panel"
      className="border-t border-[#313244] bg-[#181825]"
      data-testid="bottom-panel"
    >
      <div className="flex items-center justify-between px-4 py-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-[#a6adc8]">
            Bottom Panel
          </p>
          <p className="mt-1 text-xs text-[#cdd6f4]">Logs and trace notes</p>
        </div>
        {onClose && (
          <button
            type="button"
            className="rounded border border-[#313244] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#cdd6f4] transition hover:border-[#45475a] hover:text-white"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
          >
            Hide
          </button>
        )}
      </div>
      <div className="px-4 pb-3 text-xs text-[#9399b2]">
        Hidden by default. Open when you need deeper inspection.
      </div>
    </section>
  );
}

export default BottomPanel;
