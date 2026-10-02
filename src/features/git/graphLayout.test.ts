import { describe, expect, it } from "vitest";
import { layoutGraph } from "./graphLayout";
import type { GitHistoryCommit } from "../../lib/ipc/git";
const commit = (hash: string, parents: string[]): GitHistoryCommit => ({ hash, parents, author: "A", date: "2026-01-01", subject: hash, refs: [] });

describe("Git DAG lane layout", () => {
  it("keeps linear commits in one lane and closes root edges", () => {
    const rows = layoutGraph([commit("c", ["b"]), commit("b", ["a"]), commit("a", [])]);
    expect(rows.map((row) => row.lane)).toEqual([0, 0, 0]);
    expect(rows[0].edges).toEqual([{ from: 0, to: 0, parent: true }]);
    expect(rows[2].edges).toEqual([]);
  });
  it("represents all merge parents, divergence and convergence", () => {
    const rows = layoutGraph([commit("merge", ["left", "right", "third"]), commit("left", ["base"]), commit("right", ["base"]), commit("third", ["base"]), commit("base", [])]);
    expect(rows[0].edges.filter((e) => e.parent).map((e) => e.to)).toEqual([0, 1, 2]);
    expect(rows[2].lane).toBe(1);
    expect(rows[2].edges).toContainEqual({ from: 1, to: 0, parent: true });
    expect(rows[3].edges).toContainEqual({ from: 2, to: 0, parent: true });
  });
  it("does not move prefix rows when additional pages arrive", () => {
    const first = [commit("a", ["b", "c"]), commit("b", ["d"])];
    expect(layoutGraph([...first, commit("c", ["d"]), commit("d", [])]).slice(0, 2)).toEqual(layoutGraph(first));
  });
});
