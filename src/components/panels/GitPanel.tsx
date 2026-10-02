import type { ComponentProps } from "react";
import SourceControlPanel from "../../features/git/SourceControlPanel";
import GitHistoryPanel from "./GitHistoryPanel";

// Preserve develop's read-only snapshot view for existing hosts. Native workspaces
// use the NUL-safe domain API and document transactions.
type Props = ComponentProps<typeof SourceControlPanel> & ComponentProps<typeof GitHistoryPanel>;
export default function GitPanel(props: Props) {
  return props.workspacePath ? <SourceControlPanel {...props} /> : <GitHistoryPanel {...props} />;
}
