import { useCallback, useEffect, useState } from "react";
import { getWorkspaceBranches, getWorkspaceGitSnapshot } from "../../lib/ipc/client";
import type { WorkspaceBranchSnapshot, WorkspaceGitSnapshot } from "../../lib/ipc/types";

type WorkspaceGitState = {
  gitSnapshot: WorkspaceGitSnapshot | null;
  gitError: string | null;
  branchSnapshot: WorkspaceBranchSnapshot | null;
  setBranchSnapshot: React.Dispatch<React.SetStateAction<WorkspaceBranchSnapshot | null>>;
  refreshBranchSnapshot: (workspaceRoot: string) => Promise<WorkspaceBranchSnapshot | null>;
  reloadGitState: (workspaceRoot: string) => Promise<void>;
};

export function useWorkspaceGitState(workspacePath: string | null): WorkspaceGitState {
  const [gitSnapshot, setGitSnapshot] = useState<WorkspaceGitSnapshot | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);
  const [branchSnapshot, setBranchSnapshot] = useState<WorkspaceBranchSnapshot | null>(null);

  const refreshBranchSnapshot = useCallback(async (workspaceRoot: string) => {
    try {
      const res = await getWorkspaceBranches(workspaceRoot);
      if (res.ok && res.data) {
        return res.data;
      }
      return null;
    } catch (_error) {
      return null;
    }
  }, []);

  const reloadGitState = useCallback(async (workspaceRoot: string) => {
    const [gitRes, branchRes] = await Promise.all([
      getWorkspaceGitSnapshot(workspaceRoot),
      getWorkspaceBranches(workspaceRoot),
    ]);

    if (gitRes.ok && gitRes.data) {
      setGitSnapshot(gitRes.data);
    }
    if (branchRes.ok && branchRes.data) {
      setBranchSnapshot(branchRes.data);
    } else {
      setBranchSnapshot(null);
    }
  }, []);

  useEffect(() => {
    if (!workspacePath) {
      setGitSnapshot(null);
      setGitError(null);
      return;
    }
    let isCancelled = false;
    const pollGit = async () => {
      if (isCancelled) return;
      try {
        const res = await getWorkspaceGitSnapshot(workspacePath);
        if (!isCancelled && res.ok && res.data) {
          setGitSnapshot(res.data);
          setGitError(null);
          const latestBranchSnapshot = await refreshBranchSnapshot(workspacePath);
          if (!isCancelled) {
            setBranchSnapshot(latestBranchSnapshot);
          }
        } else if (!isCancelled) {
          setGitSnapshot(null);
          setGitError(res.error?.message ?? "Git data unavailable");
          setBranchSnapshot(null);
        }
      } catch (err) {
        if (!isCancelled) {
          setGitSnapshot(null);
          setGitError("Git data unavailable");
          setBranchSnapshot(null);
        }
      }
      if (!isCancelled) {
        setTimeout(pollGit, 5000);
      }
    };
    void pollGit();
    return () => {
      isCancelled = true;
    };
  }, [refreshBranchSnapshot, workspacePath]);

  useEffect(() => {
    if (!workspacePath) {
      setBranchSnapshot(null);
      return;
    }
    let isCancelled = false;
    void refreshBranchSnapshot(workspacePath).then((snapshot) => {
      if (isCancelled) {
        return;
      }
      setBranchSnapshot(snapshot);
    });
    return () => {
      isCancelled = true;
    };
  }, [refreshBranchSnapshot, workspacePath]);

  return {
    gitSnapshot,
    gitError,
    branchSnapshot,
    setBranchSnapshot,
    refreshBranchSnapshot,
    reloadGitState,
  };
}
