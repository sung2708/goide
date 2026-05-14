import type { ReactElement } from "react";
import type { GitGraphModel, GitGraphNode } from "./gitGraphModel";

type VirtualRow = {
  index: number;
  start: number;
  size: number;
};

type GitGraphCustomRendererProps = {
  model: GitGraphModel;
  virtualRows: VirtualRow[];
  totalHeight: number;
  onCommitHover: (node: GitGraphNode) => void;
  onCommitLeave: (node: GitGraphNode) => void;
};

const LANE_GAP = 12;
const LEFT_PAD = 8;
const NODE_RADIUS = 3.5;

function laneX(lane: number): number {
  return LEFT_PAD + lane * LANE_GAP;
}

function nodeY(row: number): number {
  return row * 30 + 15;
}

function edgePath(fromLane: number, toLane: number, fromRow: number, toRow: number): string {
  const x1 = laneX(fromLane);
  const x2 = laneX(toLane);
  const y1 = nodeY(fromRow);
  const y2 = nodeY(toRow);
  if (x1 === x2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const midY = y1 + (y2 - y1) * 0.45;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

function badgeClass(kind: "branch" | "remote" | "tag"): string {
  if (kind === "tag") {
    return "rounded bg-[rgba(163,190,140,0.14)] px-1 py-0.5 text-[9px] text-(--overlay1)";
  }
  if (kind === "remote") {
    return "rounded bg-[rgba(129,161,193,0.14)] px-1 py-0.5 text-[9px] text-(--overlay1)";
  }
  return "rounded bg-[rgba(136,192,208,0.12)] px-1 py-0.5 text-[9px] text-(--overlay1)";
}

export default function GitGraphCustomRenderer({
  model,
  virtualRows,
  totalHeight,
  onCommitHover,
  onCommitLeave,
}: GitGraphCustomRendererProps): ReactElement {
  const rowByIndex = new Map<number, VirtualRow>();
  for (const row of virtualRows) {
    rowByIndex.set(row.index, row);
  }

  const visibleNodes = model.nodes.filter((node) => rowByIndex.has(node.row));
  const maxLane = model.lanes.reduce((max, lane) => Math.max(max, lane.index), 0);
  const graphWidth = laneX(maxLane) + 12;

  return (
    <div style={{ height: `${totalHeight}px`, position: "relative" }}>
      <svg
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: `${graphWidth}px`, height: `${totalHeight}px`, pointerEvents: "none" }}
      >
        {model.edges.map((edge, index) => (
          <path
            key={`${edge.fromHash}-${edge.toHash}-${index}`}
            data-testid="git-graph-edge"
            d={edgePath(edge.fromLane, edge.toLane, edge.fromRow, edge.toRow)}
            stroke={model.lanes[edge.fromLane]?.color ?? "var(--overlay0)"}
            strokeWidth={edge.kind === "merge" ? 1.5 : 1.2}
            fill="none"
            opacity={edge.kind === "merge" ? 0.9 : 0.75}
          />
        ))}
        {visibleNodes.map((node) => (
          <circle
            key={node.hash}
            data-testid="git-graph-node"
            cx={laneX(node.lane)}
            cy={nodeY(node.row)}
            r={NODE_RADIUS}
            fill={model.lanes[node.lane]?.color ?? "var(--blue)"}
            stroke="var(--base)"
            strokeWidth={1}
          />
        ))}
      </svg>

      {visibleNodes.map((node) => {
        const row = rowByIndex.get(node.row);
        if (!row) {
          return null;
        }

        return (
          <div
            key={`row-${node.hash}`}
            className="absolute left-0 top-0 flex w-full items-center gap-1 px-2 hover:bg-(--bg-hover)"
            style={{ transform: `translateY(${row.start}px)`, height: `${row.size}px` }}
            onMouseEnter={() => onCommitHover(node)}
            onMouseLeave={() => onCommitLeave(node)}
          >
            <div style={{ width: `${graphWidth}px`, minWidth: `${graphWidth}px`, height: "1px" }} />
            <span className="min-w-0 flex-1 truncate text-[11px] text-(--subtext0)">{node.subject}</span>
            {node.refs.slice(0, 2).map((ref) => (
              <span key={`${node.hash}-${ref.kind}-${ref.name}`} className={badgeClass(ref.kind)}>
                {ref.name}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
