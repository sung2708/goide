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

  it("renders the changed-files summary when files are provided", () => {
    render(
      <BranchSwitchDialog
        open
        targetBranch="feature"
        changedFiles={[
          { path: "src/main.go", status: " M" },
          { path: "src/util.go", status: "??" },
          { path: "src/server.go", status: "A " },
        ]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const summary = screen.getByLabelText(/changed files summary/i);
    expect(summary).toBeInTheDocument();

    // Each file path should be visible
    expect(screen.getByText("src/main.go")).toBeInTheDocument();
    expect(screen.getByText("src/util.go")).toBeInTheDocument();
    expect(screen.getByText("src/server.go")).toBeInTheDocument();

    // Status badges
    const modifiedBadges = screen.getAllByTitle("modified");
    expect(modifiedBadges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTitle("untracked")).toBeInTheDocument();
    expect(screen.getByTitle("staged")).toBeInTheDocument();
  });

  it("does not render the changed-files summary when changedFiles is empty", () => {
    render(
      <BranchSwitchDialog
        open
        targetBranch="feature"
        changedFiles={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByLabelText(/changed files summary/i)).not.toBeInTheDocument();
  });

  it("truncates the file list and shows a count of hidden files when more than 5 are provided", () => {
    const files = Array.from({ length: 8 }, (_, i) => ({
      path: `file${i}.go`,
      status: " M",
    }));

    render(
      <BranchSwitchDialog
        open
        targetBranch="feature"
        changedFiles={files}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Only the first 5 should be visible by path
    expect(screen.getByText("file0.go")).toBeInTheDocument();
    expect(screen.getByText("file4.go")).toBeInTheDocument();
    expect(screen.queryByText("file5.go")).not.toBeInTheDocument();

    // Overflow count notice
    expect(screen.getByText(/\+3 more files/i)).toBeInTheDocument();
  });
});
