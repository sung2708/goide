import type { GitHistoryCommit } from "../../lib/ipc/git";

export type GraphRow = {
  commit: GitHistoryCommit; lane: number; width: number;
  incoming: boolean;
  edges: { from: number; to: number; parent: boolean }[];
};

/** Prefix-deterministic: adding a page never changes an existing row's lanes. */
export function layoutGraph(commits: GitHistoryCommit[]): GraphRow[] {
  const lanes: (string | null)[] = [];
  return commits.map((commit) => {
    const before = [...lanes];
    let lane = lanes.indexOf(commit.hash);
    const incoming = lane >= 0;
    if (lane < 0) {
      lane = lanes.indexOf(null);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = commit.hash;
    }
    lanes[lane] = null;
    const edges: GraphRow["edges"] = [];
    commit.parents.forEach((parent, index) => {
      let target = lanes.indexOf(parent);
      if (target < 0) {
        target = index === 0 ? lane : lanes.indexOf(null);
        if (target < 0) target = lanes.length;
        lanes[target] = parent;
      }
      edges.push({ from: lane, to: target, parent: true });
    });
    before.forEach((hash, from) => {
      if (hash && hash !== commit.hash) {
        const to = lanes.indexOf(hash);
        if (to >= 0) edges.push({ from, to, parent: false });
      }
    });
    return { commit, lane, incoming, edges, width: Math.max(before.length, lanes.length, lane + 1) };
  });
}
