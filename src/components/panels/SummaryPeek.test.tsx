import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConcurrencyConfidence } from "../../lib/ipc/types";
import SummaryPeek, { type SummaryItem } from "./SummaryPeek";

describe("SummaryPeek", () => {
  it("renders empty fallback when no items are provided", () => {
    render(<SummaryPeek items={[]} />);

    expect(screen.getByText(/no signals yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/hover a concurrency line to reveal inline context/i)
    ).toBeInTheDocument();
  });

  it("renders list items and dispatches jump callback on click", async () => {
    const user = userEvent.setup();
    const onJumpToLine = vi.fn();
    const items: SummaryItem[] = [
      {
        line: 12,
        label: "Channel Op",
        confidence: ConcurrencyConfidence.Predicted,
        symbol: "jobs",
      },
    ];

    render(<SummaryPeek items={items} onJumpToLine={onJumpToLine} />);

    const itemButton = screen.getByRole("button", {
      name: /line 12.*channel op.*predicted.*jobs/i,
    });
    await user.click(itemButton);

    expect(onJumpToLine).toHaveBeenCalledTimes(1);
    expect(onJumpToLine).toHaveBeenCalledWith(12);
  });
});
