import { render, screen } from "@testing-library/react";
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
});
