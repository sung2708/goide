import type { LensHoverHint } from "../../features/concurrency/lensTypes";

type HintUnderlineProps = {
  hint: LensHoverHint | null;
};

const CONFIDENCE_CONFIG = {
  predicted: {
    label: "Predicted",
    icon: "⚡",
    color: "var(--goide-signal-predicted)",
    backgroundColor: "var(--goide-signal-predicted-bg)",
  },
  likely: {
    label: "Likely",
    icon: "🔍",
    color: "var(--goide-signal-likely)",
    backgroundColor: "var(--goide-signal-likely-bg)",
  },
  confirmed: {
    label: "Confirmed",
    icon: "✅",
    color: "var(--goide-signal-confirmed)",
    backgroundColor: "var(--goide-signal-confirmed-bg)",
  },
};

function HintUnderline({ hint }: HintUnderlineProps) {
  if (!hint) {
    return null;
  }

  const confidence =
    (hint.confidence?.toLowerCase() as keyof typeof CONFIDENCE_CONFIG) ||
    "predicted";
  const { label, icon, color, backgroundColor } =
    CONFIDENCE_CONFIG[confidence] || CONFIDENCE_CONFIG.predicted;

  return (
    <>
      <div
        className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em]"
        data-testid="hint-confidence-label"
        style={{
          color,
          borderColor: color,
          backgroundColor,
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
