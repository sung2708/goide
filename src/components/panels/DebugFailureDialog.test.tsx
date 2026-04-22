import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DebugFailureDialog from "./DebugFailureDialog";

describe("DebugFailureDialog", () => {
  it("renders a user-facing error title and message", () => {
    render(
      <DebugFailureDialog
        open
        title="Unable to start debug session"
        message="Delve is not installed or not on PATH."
        details={null}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: /unable to start debug session/i })).toBeInTheDocument();
    expect(screen.getByText(/delve is not installed/i)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <DebugFailureDialog
        open={false}
        title="Unable to start debug session"
        message="Delve is not installed or not on PATH."
        details={null}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("dialog", { name: /unable to start debug session/i })
    ).not.toBeInTheDocument();
  });

  it("renders details and calls onClose", () => {
    const onClose = vi.fn();
    render(
      <DebugFailureDialog
        open
        title="Unable to start debug session"
        message="Delve is not installed or not on PATH."
        details={"line 1\nline 2"}
        onClose={onClose}
      />
    );

    expect(screen.getByText(/line 1\s+line 2/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <DebugFailureDialog
        open
        title="Unable to start debug session"
        message="Delve is not installed or not on PATH."
        details={null}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
