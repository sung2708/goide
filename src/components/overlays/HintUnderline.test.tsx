import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HintUnderline from "./HintUnderline";
import type { LensHoverHint } from "../../features/concurrency/lensTypes";

describe("HintUnderline", () => {
  it("renders the confidence label when a hint is present", () => {
    const mockHint: LensHoverHint = {
      line: 10,
      confidence: "Predicted",
    } as any;

    render(<HintUnderline hint={mockHint} />);

    const label = screen.getByTestId("hint-confidence-label");
    expect(label).toBeInTheDocument();
    expect(label).toHaveTextContent(/⚡/);
    expect(label).toHaveTextContent(/Predicted/i);
  });

  it("renders different icons for different confidence levels", () => {
    const confirmedHint: LensHoverHint = {
      line: 10,
      confidence: "Confirmed",
    } as any;

    const { rerender } = render(<HintUnderline hint={confirmedHint} />);
    expect(screen.getByTestId("hint-confidence-label")).toHaveTextContent(/✅/);
    expect(screen.getByTestId("hint-confidence-label")).toHaveTextContent(/Confirmed/i);

    const likelyHint: LensHoverHint = {
      line: 10,
      confidence: "Likely",
    } as any;

    rerender(<HintUnderline hint={likelyHint} />);
    expect(screen.getByTestId("hint-confidence-label")).toHaveTextContent(/🔍/);
    expect(screen.getByTestId("hint-confidence-label")).toHaveTextContent(/Likely/i);
  });

  it("returns null when no hint is provided", () => {
    const { container } = render(<HintUnderline hint={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("includes confidence level in screen reader announcement", () => {
    const mockHint: LensHoverHint = {
      line: 10,
      confidence: "Predicted",
    } as any;

    render(<HintUnderline hint={mockHint} />);

    const srState = screen.getByTestId("hint-underline-state");
    expect(srState).toHaveTextContent(/Confidence: Predicted/i);
  });
});
