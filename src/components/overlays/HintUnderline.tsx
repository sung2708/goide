import type { LensHoverHint } from "../../features/concurrency/lensTypes";

type HintUnderlineProps = {
  hint: LensHoverHint | null;
};

const CONFIDENCE_CONFIG = {
  predicted: {
    label: "Predicted",
    icon: "⚡",
    color: "var(--goide-signal-predicted)",
  },
  likely: {
    label: "Likely",
    icon: "🔍",
    color: "var(--goide-signal-likely)",
  },
  confirmed: {
    label: "Confirmed",
    icon: "✅",
    color: "var(--goide-signal-confirmed)",
  },
};

function HintUnderline({ hint }: HintUnderlineProps) {
  if (!hint) {
    return null;
  }

  // Fallback to predicted if confidence is missing or unknown
  const confidence = (hint.confidence?.toLowerCase() as keyof typeof CONFIDENCE_CONFIG) || "predicted";
  const { label, icon, color } = CONFIDENCE_CONFIG[confidence] || CONFIDENCE_CONFIG.predicted;

  return (
    <>
      <div
        className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] bg-opacity-10"
        data-testid="hint-confidence-label"
        style={{
          color,
          borderColor: color,
          backgroundColor: color, // Tailwind's bg-opacity-10 will handle the transparency
        }}
        aria-hidden="true"
      >
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="sr-only" aria-live="polite" data-testid="hint-underline-state">
        Confidence: {label}. Active on line {hint.line}
      </div>
    </>
  );
}

export default HintUnderline;
