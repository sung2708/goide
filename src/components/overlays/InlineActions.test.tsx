import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import InlineActions from "./InlineActions";

describe("InlineActions", () => {
  it("returns null when not visible", () => {
    const { container } = render(
      <InlineActions
        visible={false}
        runtimeAvailability="unavailable"
        hasCounterpart={false}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders contextual actions and disables unavailable actions", () => {
    render(
      <InlineActions
        visible
        runtimeAvailability="unavailable"
        hasCounterpart={false}
      />
    );

    expect(screen.getByTestId("inline-actions")).toBeInTheDocument();
    expect(screen.getByTestId("inline-actions")).toHaveStyle({ top: "48px" });
    expect(screen.getByRole("button", { name: /jump/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /deep trace/i })).toBeDisabled();
  });

  it("invokes action handlers when actions are available", () => {
    const onJump = vi.fn();
    const onDeepTrace = vi.fn();

    render(
      <InlineActions
        visible
        runtimeAvailability="available"
        hasCounterpart
        onJump={onJump}
        onDeepTrace={onDeepTrace}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /jump/i }));
    fireEvent.click(screen.getByRole("button", { name: /deep trace/i }));

    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onDeepTrace).toHaveBeenCalledTimes(1);
  });

  it("keeps Deep Trace enabled when runtime is degraded", () => {
    render(
      <InlineActions
        visible
        runtimeAvailability="degraded"
        hasCounterpart
      />
    );

    expect(screen.getByRole("button", { name: /jump/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /deep trace/i })).toBeEnabled();
  });
});
