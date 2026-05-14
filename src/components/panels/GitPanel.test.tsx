import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GitPanel from "./GitPanel";
import type { WorkspaceGitGraphCommit } from "../../lib/ipc/types";

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

  function graphCommit(overrides: Partial<WorkspaceGitGraphCommit>): WorkspaceGitGraphCommit {
    return {
      graphPrefix: "*",
      hash: "hash-a",
      shortHash: "a",
      parents: [],
      author: "A User",
      email: "a@example.com",
      dateIso: "2026-05-13T00:00:00Z",
      relativeTime: "now",
      refs: "",
      subject: "Commit A",
      ...overrides,
    };
  }

  it("renders the upgraded graph tab with branch and tag badges", () => {
    render(
      <GitPanel
        snapshot={{ branch: "develop", changedFiles: [], commits: [] }}
        graph={[
          graphCommit({ hash: "b", shortHash: "b", parents: ["a"], subject: "Feature complete", refs: "(develop, tag: v1.1.0)" }),
          graphCommit({ hash: "a", shortHash: "a", parents: [], subject: "Initial commit" }),
        ]}
      />
    );

    expect(screen.getByText("Feature complete")).toBeInTheDocument();
    const featureRow = screen.getByText("Feature complete").closest("div");
    expect(featureRow).not.toBeNull();
    expect(within(featureRow as HTMLElement).getByText("develop")).toBeInTheDocument();
    expect(screen.getByText("v1.1.0")).toBeInTheDocument();
  });

  it("requests commit detail when hovering a graph row", async () => {
    const user = userEvent.setup();
    const onLoadCommitDetail = vi.fn().mockResolvedValue({
      hash: "hash-a",
      shortHash: "a",
      subject: "Initial commit",
      author: "A User",
      email: "a@example.com",
      dateIso: "2026-05-13T00:00:00Z",
      relativeTime: "now",
      parents: [],
      filesChanged: 1,
      insertions: 2,
      deletions: 0,
      body: "",
    });

    render(
      <GitPanel
        snapshot={{ branch: "develop", changedFiles: [], commits: [] }}
        graph={[graphCommit({ hash: "hash-a", shortHash: "a", subject: "Initial commit" })]}
        onLoadCommitDetail={onLoadCommitDetail}
      />
    );

    await user.hover(screen.getByText("Initial commit"));
    await waitFor(() => {
      expect(onLoadCommitDetail).toHaveBeenCalledWith("hash-a");
    });
  });

  it("keeps the empty graph state when no history is available", () => {
    render(
      <GitPanel
        snapshot={{ branch: "develop", changedFiles: [], commits: [] }}
        graph={[]}
      />
    );

    expect(screen.getByText("No commit history.")).toBeInTheDocument();
  });
});
