import { useCallback, useEffect, useState } from "react";
import { getWorkspaceBranches, getWorkspaceGitGraphCommits, getWorkspaceGitSnapshot } from "../../lib/ipc/client";
import type {
  WorkspaceBranchSnapshot,
  WorkspaceGitGraphCommit,
  WorkspaceGitSnapshot,
} from "../../lib/ipc/types";

type WorkspaceGitState = {
  gitSnapshot: WorkspaceGitSnapshot | null;
  gitError: string | null;
  branchSnapshot: WorkspaceBranchSnapshot | null;
  gitGraph: WorkspaceGitGraphCommit[];
  setBranchSnapshot: React.Dispatch<React.SetStateAction<WorkspaceBranchSnapshot | null>>;
  refreshBranchSnapshot: (workspaceRoot: string) => Promise<WorkspaceBranchSnapshot | null>;
  reloadGitSnapshot: (workspaceRoot: string) => Promise<void>;
  reloadGitState: (workspaceRoot: string) => Promise<void>;
};

export function useWorkspaceGitState(workspacePath: string | null): WorkspaceGitState {
  const [gitSnapshot, setGitSnapshot] = useState<WorkspaceGitSnapshot | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);
  const [branchSnapshot, setBranchSnapshot] = useState<WorkspaceBranchSnapshot | null>(null);
  const [gitGraph, setGitGraph] = useState<WorkspaceGitGraphCommit[]>([]);

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

  const reloadGitSnapshot = useCallback(async (workspaceRoot: string) => {
    const [gitRes, graphRes] = await Promise.all([
      getWorkspaceGitSnapshot(workspaceRoot),
      getWorkspaceGitGraphCommits(workspaceRoot),
    ]);

    if (gitRes.ok && gitRes.data) {
      setGitSnapshot(gitRes.data);
      setGitError(null);
    }
    if (graphRes.ok && graphRes.data) {
      setGitGraph(graphRes.data);
    }
  }, []);

  const reloadGitState = useCallback(async (workspaceRoot: string) => {
    const [gitRes, branchRes, graphRes] = await Promise.all([
      getWorkspaceGitSnapshot(workspaceRoot),
      getWorkspaceBranches(workspaceRoot),
      getWorkspaceGitGraphCommits(workspaceRoot),
    ]);

    if (gitRes.ok && gitRes.data) {
      setGitSnapshot(gitRes.data);
      setGitError(null);
    }
    if (branchRes.ok && branchRes.data) {
      setBranchSnapshot(branchRes.data);
    } else {
      setBranchSnapshot(null);
    }
    if (graphRes.ok && graphRes.data) {
      setGitGraph(graphRes.data);
    } else {
      setGitGraph([]);
    }
  }, []);

  useEffect(() => {
    if (!workspacePath) {
      setGitSnapshot(null);
      setGitError(null);
      setGitGraph([]);
      return;
    }
    let isCancelled = false;
    const pollGit = async () => {
      if (isCancelled) return;
      try {
        const [gitRes, graphRes] = await Promise.all([
          getWorkspaceGitSnapshot(workspacePath),
          getWorkspaceGitGraphCommits(workspacePath),
        ]);
        if (!isCancelled && gitRes.ok && gitRes.data) {
          setGitSnapshot(gitRes.data);
          setGitError(null);
          if (graphRes.ok && graphRes.data) {
            setGitGraph(graphRes.data);
          }
          const latestBranchSnapshot = await refreshBranchSnapshot(workspacePath);
          if (!isCancelled) {
            setBranchSnapshot(latestBranchSnapshot);
          }
        } else if (!isCancelled) {
          setGitSnapshot(null);
          setGitError(gitRes.error?.message ?? "Git data unavailable");
          setBranchSnapshot(null);
          setGitGraph([]);
        }
      } catch (_error) {
        if (!isCancelled) {
          setGitSnapshot(null);
          setGitError("Git data unavailable");
          setBranchSnapshot(null);
          setGitGraph([]);
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
  }, [workspacePath]);

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
    gitGraph,
    setBranchSnapshot,
    refreshBranchSnapshot,
    reloadGitSnapshot,
    reloadGitState,
  };
}
