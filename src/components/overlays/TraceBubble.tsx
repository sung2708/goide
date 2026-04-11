type TraceBubbleConfidence = "predicted" | "likely" | "confirmed";

type TraceBubbleProps = {
  visible: boolean;
  confidence: TraceBubbleConfidence;
  label: string;
  anchorTop?: number | null;
  anchorLeft?: number | null;
};

const CONFIDENCE_CONFIG: Record<
  TraceBubbleConfidence,
  { chip: string; color: string; bgColor: string }
> = {
  predicted: {
    chip: "Predicted",
    color: "var(--goide-signal-predicted, #9399b2)",
    bgColor: "var(--goide-signal-predicted-bg, rgba(147,153,178,0.08))",
  },
  likely: {
    chip: "Likely",
    color: "var(--goide-signal-likely, #89b4fa)",
    bgColor: "var(--goide-signal-likely-bg, rgba(137,180,250,0.08))",
  },
  confirmed: {
    chip: "Confirmed",
    color: "var(--goide-signal-confirmed, #a6e3a1)",
    bgColor: "var(--goide-signal-confirmed-bg, rgba(166,227,161,0.08))",
  },
};

function TraceBubble({
  visible,
  confidence,
  label,
  anchorTop = null,
  anchorLeft = null,
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
        className="flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium"
        style={{
          borderColor: config.color,
          backgroundColor: config.bgColor,
          color: "var(--goide-text-muted, #a6adc8)",
        }}
      >
        {/* Operation type label */}
        <span className="uppercase tracking-[0.1em]">{label}</span>

        {/* Separator */}
        <span className="opacity-40">·</span>

        {/* Confidence chip */}
        <span
          className="uppercase tracking-[0.12em]"
          style={{ color: config.color }}
        >
          {config.chip}
        </span>
      </div>
    </div>
  );
}

export default TraceBubble;
export type { TraceBubbleProps, TraceBubbleConfidence };
