import type { WorkspaceGitBranch } from "../../lib/ipc/types";

type BranchPickerProps = {
  open: boolean;
  currentBranch: string | null;
  branches: WorkspaceGitBranch[];
  query: string;
  onQueryChange: (value: string) => void;
  onSelectBranch: (branch: WorkspaceGitBranch) => void;
  onClose: () => void;
};

function BranchPicker({ open, branches }: BranchPickerProps) {
  if (!open) {
    return null;
  }

  return (
    <section aria-label="Branch picker">
      <ul>
        {branches.map((branch) => (
          <li key={branch.name}>{branch.name}</li>
        ))}
      </ul>
    </section>
  );
}

export default BranchPicker;
