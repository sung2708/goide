type TraceBubbleConfidence = "predicted" | "likely" | "confirmed";

type TraceBubbleProps = {
  visible: boolean;
  confidence: TraceBubbleConfidence;
  label: string;
  anchorTop?: number | null;
  anchorLeft?: number | null;
  blocked?: boolean;
};

const CONFIDENCE_CONFIG: Record<
  TraceBubbleConfidence,
  { chip: string; color: string; bgColor: string }
> = {
  predicted: {
    chip: "Predicted",
    color: "var(--signal-predicted)",
    bgColor: "var(--signal-predicted-bg)",
  },
  likely: {
    chip: "Likely",
    color: "var(--signal-likely)",
    bgColor: "var(--signal-likely-bg)",
  },
  confirmed: {
    chip: "Confirmed",
    color: "var(--signal-confirmed)",
    bgColor: "var(--signal-confirmed-bg)",
  },
};

function TraceBubble({
  visible,
  confidence,
  label,
  anchorTop = null,
  anchorLeft = null,
  blocked = false,
}: TraceBubbleProps) {
  if (!visible) {
    return null;
  }

  const config = CONFIDENCE_CONFIG[confidence] ?? CONFIDENCE_CONFIG.predicted;

  return (
    <div
      className="pointer-events-none absolute z-10"
      data-testid="trace-bubble"
      aria-hidden="true"
      style={{
        top: anchorTop !== null && anchorTop !== undefined ? anchorTop : 24,
        left: anchorLeft !== null && anchorLeft !== undefined ? anchorLeft : 12,
      }}
    >
      <div
        className="glass-morphism flex items-center gap-2 rounded-full border px-3 py-1 text-[9px] font-bold shadow-md"
        style={{
          borderColor: config.color,
          backgroundColor: `rgba(30, 30, 46, 0.45)`,
          color: "var(--text)",
        }}
      >
        {/* Operation type label */}
        <span className="uppercase opacity-80">{label}</span>

        {/* Separator */}
        <span className="opacity-20">|</span>

        {/* Confidence chip */}
        <span
          className="uppercase"
          style={{ color: config.color }}
        >
          {config.chip}
        </span>
        {blocked ? (
          <>
            <span className="opacity-20">|</span>
            <span className="inline-flex items-center gap-1.5 text-[9px] uppercase text-[var(--signal-blocked)]">
              <span
                data-testid="trace-bubble-blocked-indicator"
                className="inline-block h-2 w-2 rounded-full bg-[var(--signal-blocked)]"
              />
              Blocked
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default TraceBubble;
export type { TraceBubbleProps, TraceBubbleConfidence };
