import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HintUnderline from "./HintUnderline";
import type { LensHoverHint } from "../../features/concurrency/lensTypes";

function makeHint(confidence: LensHoverHint["confidence"]): LensHoverHint {
  return {
    kind: "channel",
    line: 10,
    column: 1,
    symbol: null,
    confidence,
  };
}

describe("HintUnderline", () => {
  it("renders the confidence label when a hint is present", () => {
    render(<HintUnderline hint={makeHint("predicted")} />);

    const label = screen.getByTestId("hint-confidence-label");
    expect(label).toBeInTheDocument();
    expect(label).toHaveTextContent(/Predicted/i);
    expect(label).toHaveStyle({
      backgroundColor: "var(--goide-signal-predicted-bg)",
    });
    expect(label.className).not.toContain("bg-opacity-10");
  });

  it("renders different labels for different confidence levels", () => {
    const { rerender } = render(<HintUnderline hint={makeHint("confirmed")} />);
    expect(screen.getByTestId("hint-confidence-label")).toHaveTextContent(
      /Confirmed/i
    );

    rerender(<HintUnderline hint={makeHint("likely")} />);
    expect(screen.getByTestId("hint-confidence-label")).toHaveTextContent(
      /Likely/i
    );
  });

  it("returns null when no hint is provided", () => {
    const { container } = render(<HintUnderline hint={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("includes confidence level in screen reader announcement", () => {
    render(<HintUnderline hint={makeHint("predicted")} />);

    const srState = screen.getByTestId("hint-underline-state");
    expect(srState).toHaveTextContent(/Confidence: Predicted/i);
  });
});
