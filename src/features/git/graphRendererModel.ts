import type { GitGraphModel, GitGraphRef } from "../../components/panels/gitGraphModel";
import type { GitHistoryCommit } from "../../lib/ipc/git";
import { layoutGraph } from "./graphLayout";

export function rendererModel(commits: GitHistoryCommit[]): GitGraphModel {
  const rows = layoutGraph(commits);
  const positions = new Map(rows.map((row, index) => [row.commit.hash, { row: index, lane: row.lane }]));
  const colors = ["var(--blue)", "var(--green)", "var(--mauve)", "var(--peach)", "var(--teal)"];
  return {
    nodes: rows.map((row, index) => ({
      ...row.commit, row: index, lane: row.lane, graphPrefix: "", shortHash: row.commit.hash.slice(0, 8),
      email: "", dateIso: row.commit.date, relativeTime: row.commit.date.slice(0, 10),
      refs: row.commit.refs.map((ref): GitGraphRef => {
        if (ref.startsWith("tag: ")) return { kind: "tag", name: ref.slice(5) };
        if (ref.startsWith("remote: ")) return { kind: "remote", name: ref.slice(8) };
        return { kind: "branch", name: ref.startsWith("branch: ") ? ref.slice(8) : ref };
      }),
    })),
    edges: rows.flatMap((row, index) => row.commit.parents.flatMap((parent, parentIndex) => {
      const position = positions.get(parent);
      return position ? [{ fromHash: row.commit.hash, toHash: parent, fromRow: index, toRow: position.row,
        fromLane: row.lane, toLane: position.lane, kind: parentIndex === 0 ? "linear" as const : "merge" as const }] : [];
    })),
    lanes: Array.from({ length: Math.max(1, ...rows.map((row) => row.width)) }, (_, index) => ({ index, color: colors[index % colors.length] })),
  };
}
