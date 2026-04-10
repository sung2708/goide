type InlineActionsProps = {
  visible: boolean;
  runtimeAvailability: "available" | "unavailable";
  hasCounterpart?: boolean;
  anchorTop?: number | null;
  anchorLeft?: number | null;
  onJump?: () => void;
  onDeepTrace?: () => void;
};

function InlineActions({
  visible,
  runtimeAvailability,
  hasCounterpart = false,
  anchorTop = null,
  anchorLeft = null,
  onJump,
  onDeepTrace,
}: InlineActionsProps) {
  if (!visible) {
    return null;
  }

  const canJump = hasCounterpart;
  const canDeepTrace = runtimeAvailability === "available";

  return (
    <div
      className="absolute z-10 flex items-center gap-1 rounded border border-[#313244] bg-[#11111b] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#cdd6f4]"
      data-testid="inline-actions"
      aria-label="Inline quick actions"
      style={{
        top: anchorTop ?? 48,
        left: anchorLeft ?? 12,
      }}
    >
      <button
        type="button"
        className="rounded border border-[#313244] px-2 py-1 transition disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canJump}
        onClick={() => onJump?.()}
      >
        Jump
      </button>
      <button
        type="button"
        className="rounded border border-[#313244] px-2 py-1 transition disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canDeepTrace}
        onClick={() => onDeepTrace?.()}
      >
        Deep Trace
      </button>
    </div>
  );
}

export default InlineActions;
