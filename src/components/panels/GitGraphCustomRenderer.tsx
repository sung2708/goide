import type { GraphNode, GraphRef, GitGraphModel } from "./gitGraphModel";

type GraphModelVirtualRow = {
  index: number;
  start: number;
  size: number;
};

type GitGraphCustomRendererProps = {
  model: GitGraphModel;
  virtualRows: GraphModelVirtualRow[];
  totalHeight: number;
  onCommitHover: (node: GraphNode) => void;
  onCommitLeave: (node: GraphNode) => void;
};

const laneGap = 16;
const laneLeftPadding = 12;
const fallbackRowHeight = 30;

export default function GitGraphCustomRenderer({
  model,
  virtualRows,
  totalHeight,
  onCommitHover,
  onCommitLeave,
}: GitGraphCustomRendererProps) {
  const visibleIndexes = new Set(virtualRows.map((row) => row.index));
  const visibleNodes = virtualRows.map((row) => ({ row, node: model.nodes[row.index] })).filter((entry) => entry.node);
  const graphWidth = Math.max(44, model.lanes.length * laneGap + laneLeftPadding + 18);
  const visibleEdges = model.edges.filter((edge) => visibleIndexes.has(edge.fromRow) || visibleIndexes.has(edge.toRow));
  const rowByIndex = new Map(virtualRows.map((row) => [row.index, row]));

  const centerY = (rowIndex: number): number => {
    const row = rowByIndex.get(rowIndex);
    if (row) return row.start + row.size / 2;
    return rowIndex * fallbackRowHeight + fallbackRowHeight / 2;
  };

  return (
    <div style={{ height: `${totalHeight}px`, position: "relative" }}>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        width={graphWidth}
        height={totalHeight}
        viewBox={`0 0 ${graphWidth} ${totalHeight}`}
      >
        {visibleEdges.map((edge) => {
          const x1 = laneX(edge.fromLane);
          const x2 = laneX(edge.toLane);
          const y1 = centerY(edge.fromRow);
          const y2 = centerY(edge.toRow);
          const curve = Math.max(10, Math.abs(x2 - x1) * 0.8);
          const d = edge.fromLane === edge.toLane
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1} ${y1 + curve}, ${x2} ${y2 - curve}, ${x2} ${y2}`;
          return (
            <path
              key={`${edge.fromHash}-${edge.toHash}`}
              data-testid="git-graph-edge"
              d={d}
              fill="none"
              stroke={edge.color}
              strokeWidth={edge.kind === "merge" ? 1.7 : 1.35}
              opacity={edge.kind === "merge" ? 0.9 : 0.68}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {visibleNodes.map(({ row, node }) => (
        <div
          key={node.hash}
          className="absolute left-0 top-0 flex h-[30px] w-full items-center gap-2 px-2 hover:bg-(--bg-hover)"
          style={{ transform: `translateY(${row.start}px)` }}
          onMouseEnter={() => onCommitHover(node)}
          onMouseLeave={() => onCommitLeave(node)}
        >
          <div className="relative shrink-0" style={{ width: graphWidth, height: row.size }}>
            <span
              data-testid="git-graph-node"
              className="absolute top-1/2 block size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-(--base) shadow-[0_0_0_2px_rgba(136,192,208,0.16)]"
              style={{
                left: laneX(node.lane),
                background: model.lanes.find((lane) => lane.index === node.lane)?.color ?? "var(--blue)",
              }}
            />
          </div>
          <span className="min-w-0 flex-1 truncate text-[11px] text-(--subtext0)">{node.subject}</span>
          {node.refs.slice(0, 3).map((ref) => (
            <RefBadge key={`${node.hash}-${ref.kind}-${ref.name}`} refInfo={ref} />
          ))}
        </div>
      ))}
    </div>
  );
}

function laneX(lane: number): number {
  return laneLeftPadding + lane * laneGap;
}

function RefBadge({ refInfo }: { refInfo: GraphRef }) {
  const className = refInfo.kind === "tag"
    ? "bg-[rgba(163,190,140,0.14)] text-(--green)"
    : refInfo.kind === "remote"
      ? "bg-[rgba(180,190,254,0.13)] text-(--mauve)"
      : "bg-[rgba(136,192,208,0.14)] text-(--blue)";

  return (
    <span className={`max-w-24 truncate rounded-full px-1.5 py-0.5 text-[9px] font-medium ${className}`}>
      {refInfo.name}
    </span>
  );
}
