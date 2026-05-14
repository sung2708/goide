import { useMemo } from "react";
import type { WorkspaceGitGraphCommit } from "../../lib/ipc/types";
import GitGraphCustomRenderer from "./GitGraphCustomRenderer";
import GitGraphExperimentRenderer from "./GitGraphExperimentRenderer";
import { buildGitGraphModel, type GitGraphNode } from "./gitGraphModel";

export type GitGraphRendererKind = "custom" | "gitgraph";

export type GraphModelVirtualRow = {
  index: number;
  start: number;
  size: number;
};

type GitGraphViewProps = {
  commits: WorkspaceGitGraphCommit[];
  virtualRows: GraphModelVirtualRow[];
  totalHeight: number;
  renderer?: GitGraphRendererKind;
  onCommitHover: (node: GitGraphNode) => void;
  onCommitLeave: (node: GitGraphNode) => void;
};

export default function GitGraphView({
  commits,
  virtualRows,
  totalHeight,
  renderer = "custom",
  onCommitHover,
  onCommitLeave,
}: GitGraphViewProps) {
  const model = useMemo(() => buildGitGraphModel(commits), [commits]);

  if (renderer === "gitgraph") {
    return <GitGraphExperimentRenderer model={model} />;
  }

  return (
    <GitGraphCustomRenderer
      model={model}
      virtualRows={virtualRows}
      totalHeight={totalHeight}
      onCommitHover={onCommitHover}
      onCommitLeave={onCommitLeave}
    />
  );
}
