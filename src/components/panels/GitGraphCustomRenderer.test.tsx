import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import GitGraphCustomRenderer from "./GitGraphCustomRenderer";
import { buildGitGraphModel } from "./gitGraphModel";
import type { WorkspaceGitGraphCommit } from "../../lib/ipc/types";

function commit(overrides: Partial<WorkspaceGitGraphCommit>): WorkspaceGitGraphCommit {
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

describe("GitGraphCustomRenderer", () => {
  it("renders commit subjects, ref badges, and graph edges", () => {
    const model = buildGitGraphModel([
      commit({
        hash: "m",
        shortHash: "m",
        parents: ["f", "b"],
        subject: "Merge feature",
        refs: "(develop, tag: v1.1.0)",
      }),
      commit({ hash: "f", shortHash: "f", parents: ["a"], subject: "Feature work", refs: "(feature/login)" }),
      commit({ hash: "b", shortHash: "b", parents: ["a"], subject: "Base work" }),
      commit({ hash: "a", shortHash: "a", parents: [], subject: "Initial" }),
    ]);

    render(
      <GitGraphCustomRenderer
        model={model}
        virtualRows={model.nodes.map((node) => ({ index: node.row, start: node.row * 30, size: 30 }))}
        totalHeight={120}
        onCommitHover={vi.fn()}
        onCommitLeave={vi.fn()}
      />
    );

    expect(screen.getByText("Merge feature")).toBeInTheDocument();
    expect(screen.getByText("feature/login")).toBeInTheDocument();
    expect(screen.getByText("v1.1.0")).toBeInTheDocument();
    expect(screen.getAllByTestId("git-graph-edge").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("git-graph-node")).toHaveLength(4);
  });

  it("notifies hover and leave for commit rows", async () => {
    const user = userEvent.setup();
    const model = buildGitGraphModel([commit({ hash: "a", shortHash: "a", subject: "Initial" })]);
    const onCommitHover = vi.fn();
    const onCommitLeave = vi.fn();

    render(
      <GitGraphCustomRenderer
        model={model}
        virtualRows={[{ index: 0, start: 0, size: 30 }]}
        totalHeight={30}
        onCommitHover={onCommitHover}
        onCommitLeave={onCommitLeave}
      />
    );

    await user.hover(screen.getByText("Initial"));
    expect(onCommitHover).toHaveBeenCalledWith(model.nodes[0]);

    await user.unhover(screen.getByText("Initial"));
    expect(onCommitLeave).toHaveBeenCalledWith(model.nodes[0]);
  });
});
