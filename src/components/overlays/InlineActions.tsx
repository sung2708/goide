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
      className="pointer-events-none absolute z-10 flex items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--mantle)] px-2 py-1 text-[11px] uppercase text-[var(--text)]"
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
        title="Jump to the related send/receive or concurrency line when available."
        className="pointer-events-auto rounded border border-[var(--border-subtle)] px-2 py-1 transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canJump}
        onClick={() => onJump?.()}
      >
        Jump
      </button>
      <button
        type="button"
        aria-label="Deep Trace selected line"
        title="Focus runtime inspection on the selected concurrency signal."
        className="pointer-events-auto rounded border border-[var(--border-subtle)] px-2 py-1 transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canDeepTrace}
        onClick={() => onDeepTrace?.()}
      >
        Deep Trace
      </button>
    </div>
  );
}

export default InlineActions;
