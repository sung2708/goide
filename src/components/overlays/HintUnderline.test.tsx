import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HintUnderline from "./HintUnderline";
import type { LensHoverHint } from "../../features/concurrency/lensTypes";
import { ConcurrencyConfidence } from "../../lib/ipc/types";

function makeHint(confidence: LensHoverHint["confidence"]): LensHoverHint {
  return {
    kind: "channel",
    line: 10,
    column: 1,
    symbol: null,
    scopeKey: null,
    confidence,
  };
}

describe("HintUnderline", () => {
  it("renders the confidence label when a hint is present", () => {
    render(<HintUnderline hint={makeHint(ConcurrencyConfidence.Predicted)} />);

    const label = screen.getByTestId("hint-confidence-label");
    expect(label).toBeInTheDocument();
    expect(label).toHaveTextContent(/Predicted/i);
    expect(label).toHaveStyle({
      backgroundColor: "var(--signal-predicted-bg)",
    });
    expect(label.className).not.toContain("bg-opacity-10");
  });

  it("returns null when no hint is provided", () => {
    const { container } = render(<HintUnderline hint={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("includes confidence level in screen reader announcement", () => {
    render(<HintUnderline hint={makeHint(ConcurrencyConfidence.Predicted)} />);

    const srState = screen.getByTestId("hint-underline-state");
    expect(srState).toHaveTextContent(/Confidence: Predicted/i);
  });
});
