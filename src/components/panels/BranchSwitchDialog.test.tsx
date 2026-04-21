import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import BranchSwitchDialog from "./BranchSwitchDialog";

describe("BranchSwitchDialog", () => {
  it("disables commit confirmation until a commit message is entered", async () => {
    const user = userEvent.setup();
    render(
      <BranchSwitchDialog
        open
        targetBranch="develop"
        changedFiles={[{ path: "main.go", status: "M" }]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /commit changes/i }));
    expect(screen.getByRole("button", { name: /confirm branch switch/i })).toBeDisabled();
  });
});
