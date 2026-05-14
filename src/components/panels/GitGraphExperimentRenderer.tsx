import { Gitgraph } from "@gitgraph/react";
import type { GitGraphModel } from "./gitGraphModel";

type GitGraphExperimentRendererProps = {
  model: GitGraphModel;
};

export default function GitGraphExperimentRenderer({
  model,
}: GitGraphExperimentRendererProps) {
  return (
    <div className="max-h-56 overflow-auto rounded border border-(--border-subtle) bg-(--surface0) p-2">
      <Gitgraph>
        {(gitgraph) => {
          const history = gitgraph.branch("history");
          model.nodes
            .slice()
            .reverse()
            .forEach((node) => {
              history.commit({
                hash: node.shortHash,
                subject: node.subject,
              });
            });
        }}
      </Gitgraph>
    </div>
  );
}
