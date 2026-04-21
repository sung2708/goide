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

  it("resets the selected action and commit message when reopened", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <BranchSwitchDialog
        open
        targetBranch="develop"
        changedFiles={[{ path: "main.go", status: "M" }]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole("button", { name: /commit changes/i }));
    await user.type(screen.getByLabelText(/commit message/i), "WIP commit");

    rerender(
      <BranchSwitchDialog
        open={false}
        targetBranch="develop"
        changedFiles={[{ path: "main.go", status: "M" }]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    rerender(
      <BranchSwitchDialog
        open
        targetBranch="develop"
        changedFiles={[{ path: "main.go", status: "M" }]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.queryByLabelText(/commit message/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirm branch switch/i }));

    expect(onConfirm).toHaveBeenCalledWith({ action: "stash", commitMessage: "" });
  });
});
