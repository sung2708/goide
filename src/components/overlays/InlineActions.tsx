type InlineActionsProps = {
  visible: boolean;
  runtimeAvailability: "available" | "unavailable" | "degraded";
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
  const canDeepTrace = runtimeAvailability !== "unavailable";

  return (
    <div
      className="absolute z-10 flex items-center gap-1 rounded border border-[#313244] bg-[#11111b] px-2 py-1 text-[10px] uppercase text-[#cdd6f4]"
      data-testid="inline-actions"
      aria-label="Inline quick actions"
      style={{
        top: anchorTop ?? 48,
        left: anchorLeft ?? 12,
      }}
    >
      <button
        type="button"
        aria-label="Jump to counterpart line"
        title="Jump to the paired send/receive or related concurrency line."
        className="rounded border border-[#313244] px-2 py-1 transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canJump}
        onClick={() => onJump?.()}
      >
        Jump
      </button>
      <button
        type="button"
        aria-label="Deep Trace selected line"
        title="Run deeper runtime tracing for the selected concurrency signal."
        className="rounded border border-[#313244] px-2 py-1 transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canDeepTrace}
        onClick={() => onDeepTrace?.()}
      >
        Deep Trace
      </button>
    </div>
  );
}

export default InlineActions;
