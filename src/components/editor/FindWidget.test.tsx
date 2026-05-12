import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import FindWidget from "./FindWidget";
import type { FindWidgetProps } from "./FindWidget";

function makeProps(overrides?: Partial<FindWidgetProps>): FindWidgetProps {
  return {
    query: "",
    replaceText: "",
    matchCase: false,
    wholeWord: false,
    useRegex: false,
    matchInfo: { current: 0, total: 0 },
    queryInputRef: createRef(),
    onQueryChange: vi.fn(),
    onReplaceTextChange: vi.fn(),
    onToggleMatchCase: vi.fn(),
    onToggleWholeWord: vi.fn(),
    onToggleRegex: vi.fn(),
    onFindNext: vi.fn(),
    onFindPrev: vi.fn(),
    onReplace: vi.fn(),
    onReplaceAll: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("FindWidget", () => {
  it("renders find and replace inputs", () => {
    render(<FindWidget {...makeProps()} />);
    expect(screen.getByPlaceholderText(/find/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/replace/i)).toBeInTheDocument();
  });

  it("shows match counter when total > 0", () => {
    render(<FindWidget {...makeProps({ matchInfo: { current: 2, total: 5 } })} />);
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
  });

  it("shows 'No results' when query present but no matches", () => {
    render(<FindWidget {...makeProps({ query: "xyz", matchInfo: { current: 0, total: 0 } })} />);
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });

  it("match-case toggle button reflects active state via aria-pressed", () => {
    const { rerender } = render(<FindWidget {...makeProps({ matchCase: false })} />);
    expect(screen.getByRole("button", { name: /match case/i })).toHaveAttribute("aria-pressed", "false");
    rerender(<FindWidget {...makeProps({ matchCase: true })} />);
    expect(screen.getByRole("button", { name: /match case/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onToggleMatchCase when match case button clicked", async () => {
    const onToggleMatchCase = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onToggleMatchCase })} />);
    await user.click(screen.getByRole("button", { name: /match case/i }));
    expect(onToggleMatchCase).toHaveBeenCalledOnce();
  });

  it("calls onFindNext when Enter is pressed in find input", async () => {
    const onFindNext = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onFindNext })} />);
    await user.type(screen.getByPlaceholderText(/find/i), "{Enter}");
    expect(onFindNext).toHaveBeenCalledOnce();
  });

  it("calls onFindPrev when Shift+Enter is pressed in find input", async () => {
    const onFindPrev = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onFindPrev })} />);
    await user.type(screen.getByPlaceholderText(/find/i), "{Shift>}{Enter}{/Shift}");
    expect(onFindPrev).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed in find input", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onClose })} />);
    await user.type(screen.getByPlaceholderText(/find/i), "{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when X button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onClose })} />);
    await user.click(screen.getByRole("button", { name: /close find widget/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onReplace when Replace button clicked", async () => {
    const onReplace = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onReplace })} />);
    await user.click(screen.getByRole("button", { name: /^replace$/i }));
    expect(onReplace).toHaveBeenCalledOnce();
  });

  it("calls onReplaceAll when Replace All button clicked", async () => {
    const onReplaceAll = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onReplaceAll })} />);
    await user.click(screen.getByRole("button", { name: /replace all/i }));
    expect(onReplaceAll).toHaveBeenCalledOnce();
  });

  it("calls onQueryChange when find input value changes", async () => {
    const onQueryChange = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onQueryChange })} />);
    await user.type(screen.getByPlaceholderText(/find/i), "a");
    expect(onQueryChange).toHaveBeenCalledWith("a");
  });

  it("prev and next navigation buttons are present", () => {
    render(<FindWidget {...makeProps()} />);
    expect(screen.getByRole("button", { name: /previous match/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next match/i })).toBeInTheDocument();
  });

  it("whole-word toggle button reflects active state via aria-pressed", () => {
    const { rerender } = render(<FindWidget {...makeProps({ wholeWord: false })} />);
    expect(screen.getByRole("button", { name: /match whole word/i })).toHaveAttribute("aria-pressed", "false");
    rerender(<FindWidget {...makeProps({ wholeWord: true })} />);
    expect(screen.getByRole("button", { name: /match whole word/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onToggleWholeWord when whole-word button clicked", async () => {
    const onToggleWholeWord = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onToggleWholeWord })} />);
    await user.click(screen.getByRole("button", { name: /match whole word/i }));
    expect(onToggleWholeWord).toHaveBeenCalledOnce();
  });

  it("regex toggle button reflects active state via aria-pressed", () => {
    const { rerender } = render(<FindWidget {...makeProps({ useRegex: false })} />);
    expect(screen.getByRole("button", { name: /use regular expression/i })).toHaveAttribute("aria-pressed", "false");
    rerender(<FindWidget {...makeProps({ useRegex: true })} />);
    expect(screen.getByRole("button", { name: /use regular expression/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onToggleRegex when regex button clicked", async () => {
    const onToggleRegex = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onToggleRegex })} />);
    await user.click(screen.getByRole("button", { name: /use regular expression/i }));
    expect(onToggleRegex).toHaveBeenCalledOnce();
  });

  it("queryInputRef is attached to the find input", () => {
    const ref = createRef<HTMLInputElement>();
    render(<FindWidget {...makeProps({ queryInputRef: ref })} />);
    expect(ref.current).toBe(screen.getByPlaceholderText(/find/i));
  });

  it("calls onReplaceTextChange when replace input value changes", async () => {
    const onReplaceTextChange = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onReplaceTextChange })} />);
    await user.type(screen.getByPlaceholderText(/replace/i), "a");
    expect(onReplaceTextChange).toHaveBeenCalledWith("a");
  });
});
