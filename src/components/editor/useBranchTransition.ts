import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { switchWorkspaceBranch } from "../../lib/ipc/client";
import type { WorkspaceGitBranch, WorkspaceBranchSnapshot } from "../../lib/ipc/types";

export type BranchConfirmation = {
  action: "commit" | "stash" | "discard";
  commitMessage?: string;
};

type Params = {
  workspacePathRef: MutableRefObject<string | null>;
  documentTransitionRef: MutableRefObject<boolean>;
  branchMutationRef: MutableRefObject<boolean>;
  branchSnapshot: WorkspaceBranchSnapshot | null;
  setBranchSnapshot: (snapshot: WorkspaceBranchSnapshot | null) => void;
  refreshBranchSnapshot: (root: string) => Promise<WorkspaceBranchSnapshot | null>;
  preserveActiveDocument: () => Promise<boolean>;
  isDocumentPreserved: () => boolean;
  reloadWorkspaceState: () => Promise<void>;
  closePicker: () => void;
  getBlockReason: () => string | null;
};

/** Owns the save -> inspect -> checkout -> reload transaction for Git navigation. */
export function useBranchTransition(params: Params) {
  const [pendingTargetBranch, setPendingTargetBranch] = useState<WorkspaceGitBranch | null>(null);
  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);
  const [branchSwitchLoading, setBranchSwitchLoading] = useState(false);
  const [branchSwitchError, setBranchSwitchError] = useState<string | null>(null);
  const [isBranchMutationInProgress, setIsBranchMutationInProgress] = useState(false);
  // Ref guards commands/editor callbacks before React has rendered read-only state.
  const branchMutationRef = params.branchMutationRef;
  const mounted = useRef(true);
  const pendingWorkspace = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const transact = async (operation: (root: string) => Promise<void>) => {
    const root = params.workspacePathRef.current;
    if (!root || params.documentTransitionRef.current) return;
    const blockReason = params.getBlockReason();
    if (blockReason) {
      setBranchSwitchError(blockReason);
      return;
    }
    params.documentTransitionRef.current = true;
    setBranchSwitchLoading(true);
    setBranchSwitchError(null);
    try {
      if (!(await params.preserveActiveDocument())) return;
      if (!mounted.current || params.workspacePathRef.current !== root) return;
      if (!params.isDocumentPreserved()) {
        setBranchSwitchError("The current file changed while preparing the Git operation. Save and retry.");
        return;
      }
      branchMutationRef.current = true;
      setIsBranchMutationInProgress(true);
      await operation(root);
    } catch (error) {
      if (mounted.current && params.workspacePathRef.current === root) {
        setBranchSwitchError(error instanceof Error ? error.message : "Branch switch failed");
      }
    } finally {
      branchMutationRef.current = false;
      params.documentTransitionRef.current = false;
      if (mounted.current) {
        setIsBranchMutationInProgress(false);
        setBranchSwitchLoading(false);
      }
    }
  };

  const checkout = async (root: string, branch: WorkspaceGitBranch, payload?: BranchConfirmation) => {
    let response;
    try {
      response = await switchWorkspaceBranch({
        workspaceRoot: root,
        targetBranch: branch.name,
        remoteRef: branch.remoteRef ?? null,
        preSwitchAction: payload?.action ?? "none",
        ...(payload ? { commitMessage: payload.commitMessage ?? null } : {}),
      });
    } catch (error) {
      if (mounted.current && params.workspacePathRef.current === root) {
        await params.reloadWorkspaceState();
      }
      throw error;
    }
    if (!mounted.current || params.workspacePathRef.current !== root) return;
    if (!response.ok || !response.data) {
      // A pre-switch commit/stash/discard may have succeeded even if checkout
      // failed. Reload the now-clean buffer from disk on either outcome.
      await params.reloadWorkspaceState();
      setBranchSwitchError(response.error?.message ?? "Branch switch failed");
      return;
    }
    params.setBranchSnapshot(response.data);
    setPendingTargetBranch(null);
    setIsBranchDialogOpen(false);
    await params.reloadWorkspaceState();
  };

  const handleBranchSelect = async (branch: WorkspaceGitBranch) => {
    if (branch.name === params.branchSnapshot?.currentBranch) {
      params.closePicker();
      return;
    }
    await transact(async (root) => {
      params.closePicker();
      // Saving may have made a previously clean Git worktree dirty.
      const snapshot = await params.refreshBranchSnapshot(root);
      if (!mounted.current || params.workspacePathRef.current !== root) return;
      if (!snapshot) {
        setBranchSwitchError("Branch data unavailable");
        return;
      }
      params.setBranchSnapshot(snapshot);
      if (branch.name === snapshot.currentBranch) return;
      setPendingTargetBranch(branch);
      pendingWorkspace.current = root;
      if (snapshot.hasUncommittedChanges) {
        setIsBranchDialogOpen(true);
      } else {
        await checkout(root, branch);
      }
    });
  };

  const handleBranchSwitchConfirm = async (payload: BranchConfirmation) => {
    if (!pendingTargetBranch) return;
    if (pendingWorkspace.current !== params.workspacePathRef.current) {
      setIsBranchDialogOpen(false);
      setPendingTargetBranch(null);
      setBranchSwitchError("The workspace changed. Select the branch again in the current workspace.");
      return;
    }
    await transact(async (root) => { await checkout(root, pendingTargetBranch, payload); });
  };

  const cancelBranchSwitch = () => {
    if (params.documentTransitionRef.current) return;
    setIsBranchDialogOpen(false);
    setPendingTargetBranch(null);
    setBranchSwitchError(null);
  };

  return {
    pendingTargetBranch, isBranchDialogOpen, branchSwitchLoading, branchSwitchError,
    isBranchMutationInProgress, branchMutationRef,
    handleBranchSelect, handleBranchSwitchConfirm, cancelBranchSwitch,
  };
}
