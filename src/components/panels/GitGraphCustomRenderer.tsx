import type { GitGraphModel, GitGraphNode, GitGraphRef } from "./gitGraphModel";
import type { GraphModelVirtualRow } from "./GitGraphView";

type GitGraphCustomRendererProps = {
  model: GitGraphModel;
  virtualRows: GraphModelVirtualRow[];
  totalHeight: number;
  onCommitHover: (node: GitGraphNode) => void;
  onCommitLeave: (node: GitGraphNode) => void;
  onCommitSelect?: (node: GitGraphNode) => void;
  selectedHash?: string | null;
  rowHeight?: number;
  virtualized?: boolean;
};

const laneGap = 13;
const laneLeftPadding = 12;
const fallbackRowHeight = 32;

export default function GitGraphCustomRenderer({
  model,
  virtualRows,
  totalHeight,
  onCommitHover,
  onCommitLeave,
  onCommitSelect,
  selectedHash,
  rowHeight = fallbackRowHeight,
  virtualized = false,
}: GitGraphCustomRendererProps) {
  const fallbackRows = model.nodes.map((node) => ({
    index: node.row,
    start: node.row * rowHeight,
    size: rowHeight,
  }));
  const rowsToRender = virtualized || virtualRows.length > 0 ? virtualRows : fallbackRows;
  const visibleIndexes = new Set(rowsToRender.map((row) => row.index));
  const visibleNodes = rowsToRender.map((row) => ({ row, node: model.nodes[row.index] })).filter((entry) => entry.node);
  const graphWidth = Math.max(34, model.lanes.length * laneGap + laneLeftPadding + 10);
  const firstVisible = rowsToRender[0]?.index;
  const lastVisible = rowsToRender[rowsToRender.length - 1]?.index;
  const visibleEdges = model.edges.filter((edge) => visibleIndexes.has(edge.fromRow) || visibleIndexes.has(edge.toRow) ||
    (firstVisible !== undefined && lastVisible !== undefined && edge.fromRow <= lastVisible && edge.toRow >= firstVisible));
  const rowByIndex = new Map(rowsToRender.map((row) => [row.index, row]));

  const centerY = (rowIndex: number): number => {
    const row = rowByIndex.get(rowIndex);
    if (row) return row.start + row.size / 2;
    return rowIndex * rowHeight + rowHeight / 2;
  };

  return (
    <div style={{ height: `${totalHeight}px`, position: "relative" }} className="select-none font-sans">
      {/* SVG Canvas for Branch & Merge Curves */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        width={graphWidth}
        height={totalHeight}
        viewBox={`0 0 ${graphWidth} ${totalHeight}`}
      >
        <defs>
          <filter id="git-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {visibleEdges.map((edge) => {
          const x1 = laneX(edge.fromLane);
          const x2 = laneX(edge.toLane);
          const y1 = centerY(edge.fromRow);
          const y2 = centerY(edge.toRow);
          const dy = y2 - y1;
          const d = edge.fromLane === edge.toLane
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1} ${y1 + dy * 0.42}, ${x2} ${y2 - dy * 0.42}, ${x2} ${y2}`;
          const laneColor = model.lanes.find((lane) => lane.index === edge.toLane)?.color ?? "var(--blue)";

          return (
            <path
              key={`${edge.fromHash}-${edge.toHash}`}
              data-testid="git-graph-edge"
              d={d}
              fill="none"
              stroke={laneColor}
              strokeWidth={edge.kind === "merge" ? 2 : 1.75}
              strokeOpacity={edge.kind === "merge" ? 0.95 : 0.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>

      {/* Commit Rows */}
      {visibleNodes.map(({ row, node }) => {
        const isSelected = selectedHash === node.hash;
        const laneColor = model.lanes.find((lane) => lane.index === node.lane)?.color ?? "var(--blue)";
        const isMerge = node.parents.length > 1;
        const hasRefs = node.refs.length > 0;

        return (
          <div
            key={node.hash}
            role={onCommitSelect ? "button" : undefined}
            tabIndex={onCommitSelect ? 0 : undefined}
            aria-label={`${node.subject}; ${node.hash}; ${node.parents.length} parents`}
            onClick={() => onCommitSelect?.(node)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onCommitSelect?.(node); } }}
            className={`group absolute left-0 top-0 flex w-full items-center gap-2 px-2 border-b transition-colors duration-100 cursor-pointer ${
              isSelected
                ? "bg-[var(--selection-bg-strong)] border-[var(--brand-primary)]/40"
                : "border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]"
            }`}
            style={{ transform: `translateY(${row.start}px)`, height: `${row.size}px` }}
            onMouseEnter={() => onCommitHover(node)}
            onMouseLeave={() => onCommitLeave(node)}
          >
            {/* Graph Node Dot */}
            <div className="relative shrink-0" style={{ width: graphWidth, height: row.size }}>
              {isMerge ? (
                <span
                  data-testid="git-graph-node"
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-3 rounded-full transition-transform duration-100 group-hover:scale-125 flex items-center justify-center"
                  style={{
                    left: laneX(node.lane),
                    border: `2px solid ${laneColor}`,
                    background: "var(--base)",
                    boxShadow: `0 0 5px ${laneColor}40`,
                  }}
                >
                  <span className="size-1 rounded-full" style={{ background: laneColor }} />
                </span>
              ) : (
                <span
                  data-testid="git-graph-node"
                  className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-100 group-hover:scale-125 ${
                    hasRefs
                      ? "size-2.5 ring-2 ring-offset-1 ring-offset-[var(--base)]"
                      : "size-2"
                  }`}
                  style={{
                    left: laneX(node.lane),
                    background: laneColor,
                    boxShadow: `0 0 4px ${laneColor}50`,
                    ...(hasRefs ? { borderColor: laneColor } : {}),
                  }}
                />
              )}
            </div>

            {/* Commit Message & Inline Badges */}
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              {node.refs.slice(0, 2).map((ref) => (
                <RefBadge key={`${node.hash}-${ref.kind}-${ref.name}`} refInfo={ref} />
              ))}
              <span
                className={`min-w-0 flex-1 truncate text-[11px] leading-tight transition-colors ${
                  isSelected
                    ? "text-[var(--text)] font-semibold"
                    : "text-[var(--subtext1)] group-hover:text-[var(--text)]"
                }`}
                title={node.subject}
              >
                {node.subject}
              </span>
            </div>

            {/* Right: Monospace Short Hash + Relative Date */}
            <div className="shrink-0 flex items-center gap-1.5 font-mono text-[10px]">
              <span className="text-[var(--overlay1)] group-hover:text-[var(--text)] px-1 py-0.5 bg-[var(--surface0)]/60 rounded-none border border-transparent group-hover:border-[var(--border-subtle)] select-all transition-colors">
                {node.shortHash ?? node.hash.slice(0, 7)}
              </span>

              {(node.dateIso || node.relativeTime) && (
                <span className="text-[var(--overlay0)] hidden sm:inline" title={node.dateIso}>
                  {formatRelativeTime(node.dateIso || node.relativeTime)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function laneX(lane: number): number {
  return laneLeftPadding + lane * laneGap;
}

function RefBadge({ refInfo }: { refInfo: GitGraphRef }) {
  if (refInfo.kind === "tag") {
    return (
      <span className="inline-flex items-center gap-1 max-w-24 shrink-0 truncate rounded-none border border-[var(--green)]/40 bg-[var(--green)]/12 px-1 py-0.2 text-[9px] font-mono font-medium text-[var(--green)]">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/>
          <path d="M7 7h.01"/>
        </svg>
        <span className="truncate">{refInfo.name}</span>
      </span>
    );
  }

  if (refInfo.kind === "remote") {
    return (
      <span className="inline-flex items-center gap-1 max-w-24 shrink-0 truncate rounded-none border border-[var(--mauve)]/40 bg-[var(--mauve)]/12 px-1 py-0.2 text-[9px] font-mono font-medium text-[var(--mauve)]">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
        </svg>
        <span className="truncate">{refInfo.name}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 max-w-24 shrink-0 truncate rounded-none border border-[var(--blue)]/40 bg-[var(--blue)]/12 px-1 py-0.2 text-[9px] font-mono font-medium text-[var(--blue)]">
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="6" y1="3" x2="6" y2="15"/>
        <circle cx="18" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
      <span className="truncate">{refInfo.name}</span>
    </span>
  );
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  if (!dateStr.includes("T") && !dateStr.includes("-")) return dateStr;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr.slice(0, 10);
    const now = Date.now();
    const diffSec = Math.floor((now - date.getTime()) / 1000);
    if (diffSec < 60) return "now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
    if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d`;
    return date.toISOString().slice(5, 10);
  } catch {
    return dateStr.slice(0, 10);
  }
}
