import type { LensHoverHint } from "../../features/concurrency/lensTypes";

type HintUnderlineProps = {
  hint: LensHoverHint | null;
};

function HintUnderline({ hint }: HintUnderlineProps) {
  if (!hint) {
    return null;
  }

  return (
    <div className="sr-only" aria-live="polite" data-testid="hint-underline-state">
      Predicted hint active on line {hint.line}
    </div>
  );
}

export default HintUnderline;

