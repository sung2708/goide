import { memo } from "react";

type ThreadLineProps = {
  sourceAnchor: { top: number; left: number } | null;
  targetAnchor: { top: number; left: number } | null;
  visible: boolean;
};

function ThreadLine({ sourceAnchor, targetAnchor, visible }: ThreadLineProps) {
  if (!visible || !sourceAnchor || !targetAnchor) {
    return null;
  }

  // Calculate bounding box for SVG
  const minX = Math.min(sourceAnchor.left, targetAnchor.left);
  const maxX = Math.max(sourceAnchor.left, targetAnchor.left);
  const minY = Math.min(sourceAnchor.top, targetAnchor.top);
  const maxY = Math.max(sourceAnchor.top, targetAnchor.top);

  // Add some padding so curves don't clip at edges
  const padding = 20;

  const width = Math.max(maxX - minX + padding * 2, 40);
  const height = Math.max(maxY - minY + padding * 2, 40);

  const startX = sourceAnchor.left - minX + padding;
  const startY = sourceAnchor.top - minY + padding;
  const endX = targetAnchor.left - minX + padding;
  const endY = targetAnchor.top - minY + padding;

  // Cubic bezier points: extend out horizontally from the source and target
  // so the line curves smoothly
  const controlPointOffset = Math.max(20, Math.abs(endY - startY) * 0.4);
  const d = `M ${startX} ${startY} C ${startX - controlPointOffset} ${startY}, ${endX - controlPointOffset} ${endY}, ${endX} ${endY}`;

  return (
    <div
      className="absolute pointer-events-none z-0"
      style={{
        top: minY - padding,
        left: minX - padding,
        width,
        height,
      }}
    >
      <svg width="100%" height="100%" className="overflow-visible">
        <path
          d={d}
          fill="none"
          stroke="var(--goide-signal-likely, #89b4fa)" 
          strokeWidth="1.5" 
          strokeDasharray="4 4"
          className="opacity-40"
        />
        <circle 
          cx={startX} 
          cy={startY} 
          r="3" 
          fill="var(--goide-signal-likely, #89b4fa)" 
          className="opacity-50" 
        />
        <circle 
          cx={endX} 
          cy={endY} 
          r="3" 
          fill="var(--goide-signal-likely, #89b4fa)" 
          className="opacity-50" 
        />
      </svg>
    </div>
  );
}

export default memo(ThreadLine);
