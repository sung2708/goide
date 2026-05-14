import type { WorkspaceGitGraphCommit } from "../../lib/ipc/types";

export type GitGraphRefKind = "branch" | "remote" | "tag";

export type GitGraphRef = {
  kind: GitGraphRefKind;
  name: string;
};

export type GitGraphNode = Omit<WorkspaceGitGraphCommit, "refs"> & {
  row: number;
  lane: number;
  refs: GitGraphRef[];
};

export type GitGraphEdgeKind = "linear" | "merge";

export type GitGraphEdge = {
  fromHash: string;
  toHash: string;
  fromRow: number;
  toRow: number;
  fromLane: number;
  toLane: number;
  kind: GitGraphEdgeKind;
};

export type GitGraphLane = {
  index: number;
  color: string;
};

export type GitGraphModel = {
  nodes: GitGraphNode[];
  edges: GitGraphEdge[];
  lanes: GitGraphLane[];
};

const LANE_COLORS = [
  "var(--blue)",
  "var(--green)",
  "var(--amber)",
  "var(--pink)",
  "var(--teal)",
  "var(--orange)",
];
const TAG_REF_PREFIX = "tag:";

export function parseGitRefs(rawRefs: string): GitGraphRef[] {
  const trimmed = rawRefs.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
    return [];
  }

  const body = trimmed.slice(1, -1).trim();
  if (!body) {
    return [];
  }

  const rawParts = body.split(",").map((part) => part.trim());
  const remoteNames = new Set(["origin", "upstream"]);
  rawParts.forEach((part) => {
    const match = /^([^/]+)\/HEAD\s*->/.exec(part);
    if (match?.[1]) {
      remoteNames.add(match[1]);
    }
  });

  const parts = rawParts.filter(
      (part) =>
        part.length > 0 &&
        part !== "HEAD" &&
        !part.includes(" ->")
    );

  return parts
    .map((part): GitGraphRef => {
      if (part.startsWith(TAG_REF_PREFIX)) {
        return { kind: "tag", name: part.slice(TAG_REF_PREFIX.length).trim() };
      }
      if (
        part.startsWith("remotes/") ||
        Array.from(remoteNames).some((remoteName) =>
          part.startsWith(`${remoteName}/`)
        )
      ) {
        return { kind: "remote", name: part };
      }
      return { kind: "branch", name: part };
    });
}

export function nextFreeLane(occupied: Set<number>): number {
  let lane = 0;
  while (occupied.has(lane)) {
    lane += 1;
  }
  return lane;
}

export function buildGitGraphModel(commits: WorkspaceGitGraphCommit[]): GitGraphModel {
  const hashSet = new Set(commits.map((commit) => commit.hash));
  const nodes: GitGraphNode[] = [];
  const edges: GitGraphEdge[] = [];
  const laneByHash = new Map<string, number>();
  const occupiedLanes = new Set<number>();
  const hashToNode = new Map<string, GitGraphNode>();

  commits.forEach((commit, row) => {
    let lane = laneByHash.get(commit.hash);
    if (lane == null) {
      lane = nextFreeLane(occupiedLanes);
      laneByHash.set(commit.hash, lane);
    }
    occupiedLanes.add(lane);

    const node: GitGraphNode = {
      ...commit,
      row,
      lane,
      refs: parseGitRefs(commit.refs),
    };
    nodes.push(node);
    hashToNode.set(commit.hash, node);

    const visibleParents = commit.parents.filter((parentHash) => hashSet.has(parentHash));
    visibleParents.forEach((parentHash, index) => {
      let parentLane = laneByHash.get(parentHash);
      if (parentLane == null) {
        if (index === 0) {
          parentLane = lane;
        } else {
          parentLane = nextFreeLane(occupiedLanes);
        }
        laneByHash.set(parentHash, parentLane);
      }
      occupiedLanes.add(parentLane);
    });
  });

  nodes.forEach((node) => {
    node.parents.forEach((parentHash, index) => {
      const parent = hashToNode.get(parentHash);
      if (!parent) {
        return;
      }
      edges.push({
        fromHash: node.hash,
        toHash: parent.hash,
        fromRow: node.row,
        toRow: parent.row,
        fromLane: node.lane,
        toLane: parent.lane,
        kind: index === 0 ? "linear" : "merge",
      });
    });
  });

  const maxLane = nodes.reduce((max, node) => Math.max(max, node.lane), -1);
  const lanes: GitGraphLane[] = [];
  for (let index = 0; index <= maxLane; index += 1) {
    lanes.push({
      index,
      color: LANE_COLORS[index % LANE_COLORS.length],
    });
  }

  return { nodes, edges, lanes };
}
