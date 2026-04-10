import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConcurrencyConfidence } from "../../lib/ipc/types";
import HintUnderline from "./HintUnderline";

describe("HintUnderline", () => {
  it("renders nothing when there is no active hint", () => {
    render(<HintUnderline hint={null} />);
    expect(screen.queryByTestId("hint-underline-state")).toBeNull();
  });

  it("renders accessibility state when a predicted hint is active", () => {
    render(
      <HintUnderline
        hint={{
          kind: "channel",
          line: 12,
          column: 2,
          symbol: null,
          confidence: ConcurrencyConfidence.Predicted,
        }}
      />
    );

    expect(screen.getByTestId("hint-underline-state")).toHaveTextContent(
      "Predicted hint active on line 12"
    );
  });
});

