import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GitPanel from "./GitPanel";

describe("GitPanel", () => {
  it("renders a switch-branch button and wires it to onOpenBranchPicker", async () => {
    const user = userEvent.setup();
    const onOpenBranchPicker = vi.fn();

    render(
      <GitPanel
        snapshot={{
          branch: "develop",
          changedFiles: [],
          commits: [],
        }}
        branchSnapshot={{
          currentBranch: "develop",
          isDetachedHead: false,
          detachedHeadRef: null,
          branches: [],
          hasUncommittedChanges: false,
          changedFilesSummary: [],
        }}
        onOpenBranchPicker={onOpenBranchPicker}
      />
    );

    await user.click(screen.getByRole("button", { name: /switch branch/i }));

    expect(onOpenBranchPicker).toHaveBeenCalledTimes(1);
  });
});
