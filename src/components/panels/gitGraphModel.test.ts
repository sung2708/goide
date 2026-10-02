import { describe, expect, it } from "vitest";
import { buildGitGraphModel, parseGitRefs } from "./gitGraphModel";
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

describe("parseGitRefs", () => {
  it("splits local branches, remotes, tags, and skips HEAD symbolic refs", () => {
    expect(
      parseGitRefs(
        "(HEAD, HEAD -> main, develop, origin/develop, tag: v1.1.0, upstream/main, remotes/teamone/release)"
      )
    ).toEqual([
      { kind: "branch", name: "develop" },
      { kind: "remote", name: "origin/develop" },
      { kind: "tag", name: "v1.1.0" },
      { kind: "remote", name: "upstream/main" },
      { kind: "remote", name: "remotes/teamone/release" },
    ]);
  });

  it("keeps slash-named local branches and slash tags classified correctly", () => {
    expect(parseGitRefs("(feature/login, tag: release/2026.05)")).toEqual([
      { kind: "branch", name: "feature/login" },
      { kind: "tag", name: "release/2026.05" },
    ]);
  });

  it("returns an empty list for blank or undecorated refs", () => {
    expect(parseGitRefs("")).toEqual([]);
    expect(parseGitRefs("develop")).toEqual([]);
  });
});

describe("buildGitGraphModel", () => {
  it("builds a linear graph with one stable lane", () => {
    const model = buildGitGraphModel([
      commit({ hash: "c", shortHash: "c", parents: ["b"], subject: "Commit C" }),
      commit({ hash: "b", shortHash: "b", parents: ["a"], subject: "Commit B" }),
      commit({ hash: "a", shortHash: "a", parents: [], subject: "Commit A" }),
    ]);

    expect(model.nodes.map((node) => [node.hash, node.row, node.lane])).toEqual([
      ["c", 0, 0],
      ["b", 1, 0],
      ["a", 2, 0],
    ]);
    expect(model.edges.map((edge) => [edge.fromHash, edge.toHash, edge.kind])).toEqual([
      ["c", "b", "linear"],
      ["b", "a", "linear"],
    ]);
    expect(model.lanes).toEqual([{ index: 0, color: "var(--blue)" }]);
  });

  it("keeps merge parents on visible lanes", () => {
    const model = buildGitGraphModel([
      commit({ hash: "m", shortHash: "m", parents: ["f", "b"], subject: "Merge feature", refs: "(develop)" }),
      commit({ hash: "f", shortHash: "f", parents: ["a"], subject: "Feature", refs: "(feature/login)" }),
      commit({ hash: "b", shortHash: "b", parents: ["a"], subject: "Base" }),
      commit({ hash: "a", shortHash: "a", parents: [], subject: "Initial" }),
    ]);

    expect(model.nodes.find((node) => node.hash === "m")?.refs).toEqual([
      { kind: "branch", name: "develop" },
    ]);
    expect(model.nodes.find((node) => node.hash === "f")?.refs).toEqual([
      { kind: "branch", name: "feature/login" },
    ]);
    expect(model.edges).toContainEqual(
      expect.objectContaining({ fromHash: "m", toHash: "f", kind: "linear" })
    );
    expect(model.edges).toContainEqual(
      expect.objectContaining({ fromHash: "m", toHash: "b", kind: "merge" })
    );
    expect(model.lanes.length).toBeGreaterThan(1);
  });

  it("skips parent edges when the parent is outside the loaded history window", () => {
    const model = buildGitGraphModel([
      commit({ hash: "c", shortHash: "c", parents: ["missing-parent"], subject: "Commit C" }),
    ]);

    expect(model.nodes).toHaveLength(1);
    expect(model.edges).toEqual([]);
  });

  it("preserves merge edge kind when first parent is outside the loaded history window", () => {
    const model = buildGitGraphModel([
      commit({
        hash: "m",
        shortHash: "m",
        parents: ["missing-parent", "b"],
        subject: "Merge with hidden first parent",
      }),
      commit({ hash: "b", shortHash: "b", parents: ["a"], subject: "Base" }),
      commit({ hash: "a", shortHash: "a", parents: [], subject: "Initial" }),
    ]);

    expect(model.edges).toContainEqual(
      expect.objectContaining({ fromHash: "m", toHash: "b", kind: "merge" })
    );
  });
});
