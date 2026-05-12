import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import DocumentOutline from "./DocumentOutline";

describe("DocumentOutline", () => {
  const items = [
    {
      name: "outer",
      kind: "function",
      line: 2,
      from: 10,
      to: 40,
    },
    {
      name: "inner",
      kind: "function",
      line: 6,
      from: 80,
      to: 120,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-scrolls the active symbol into view when it changes", () => {
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoViewMock,
    });
    const scrollIntoViewSpy = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(scrollIntoViewMock);

    const { rerender } = render(<DocumentOutline items={items} activeItemFrom={10} />);

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });

    scrollIntoViewMock.mockClear();

    rerender(<DocumentOutline items={items} activeItemFrom={80} />);

    expect(screen.getByRole("button", { name: /line 6 function inner/i })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
  });

  it("supports keyboard focus navigation and jump actions", async () => {
    const user = userEvent.setup();
    const onJumpToLine = vi.fn();

    render(<DocumentOutline items={items} onJumpToLine={onJumpToLine} />);

    const outerButton = screen.getByRole("button", { name: /line 2 function outer/i });
    const innerButton = screen.getByRole("button", { name: /line 6 function inner/i });

    outerButton.focus();
    expect(outerButton).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(innerButton).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(outerButton).toHaveFocus();

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onJumpToLine).toHaveBeenCalledWith(6);
  });

  it("supports Home and End keyboard navigation", async () => {
    const user = userEvent.setup();

    render(<DocumentOutline items={items} />);

    const outerButton = screen.getByRole("button", { name: /line 2 function outer/i });
    const innerButton = screen.getByRole("button", { name: /line 6 function inner/i });

    outerButton.focus();
    expect(outerButton).toHaveFocus();

    await user.keyboard("{End}");
    expect(innerButton).toHaveFocus();

    await user.keyboard("{Home}");
    expect(outerButton).toHaveFocus();
  });

  it("moves focus to the active symbol when outline focus is already inside the panel", () => {
    const { rerender } = render(<DocumentOutline items={items} activeItemFrom={10} />);

    const outerButton = screen.getByRole("button", { name: /line 2 function outer/i });
    const innerButton = screen.getByRole("button", { name: /line 6 function inner/i });

    outerButton.focus();
    expect(outerButton).toHaveFocus();

    rerender(<DocumentOutline items={items} activeItemFrom={80} />);

    expect(innerButton).toHaveFocus();
  });

  it("renders a stable panel container when no symbols are present", () => {
    render(<DocumentOutline items={[]} />);
    expect(screen.getByTestId("document-outline")).toBeInTheDocument();
    expect(screen.getByText(/no symbols/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("does not steal focus when the active symbol changes from outside the outline", () => {
    const { rerender } = render(
      <div>
        <button type="button">Outside Control</button>
        <DocumentOutline items={items} activeItemFrom={10} />
      </div>
    );

    const outsideButton = screen.getByRole("button", { name: /outside control/i });
    outsideButton.focus();
    expect(outsideButton).toHaveFocus();

    rerender(
      <div>
        <button type="button">Outside Control</button>
        <DocumentOutline items={items} activeItemFrom={80} />
      </div>
    );

    expect(outsideButton).toHaveFocus();
    expect(screen.getByRole("button", { name: /line 6 function inner/i })).not.toHaveFocus();
  });
});
