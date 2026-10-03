import { useCallback, useEffect, useRef, useState } from "react";
import { getWorkspaceBranches, getWorkspaceGitGraphCommits, getWorkspaceGitSnapshot } from "../../lib/ipc/client";
import type { ApiResponse, WorkspaceBranchSnapshot, WorkspaceGitGraphCommit, WorkspaceGitSnapshot } from "../../lib/ipc/types";

function read<T>(result: PromiseSettledResult<ApiResponse<T>>, label: string): { data: T | null; error: string | null } {
  if (result.status === "rejected") return { data: null, error: label + ": " + (result.reason instanceof Error ? result.reason.message : String(result.reason)) };
  if (!result.value?.ok || result.value.data == null) return { data: null, error: label + ": " + (result.value?.error?.message ?? "Git data unavailable") };
  return { data: result.value.data, error: null };
}
export function useWorkspaceGitState(workspacePath: string | null) {
  const [gitSnapshot, setGitSnapshot] = useState<WorkspaceGitSnapshot | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);
  const [branchSnapshot, setBranchSnapshot] = useState<WorkspaceBranchSnapshot | null>(null);
  const [gitGraph, setGitGraph] = useState<WorkspaceGitGraphCommit[]>([]);
  const root = useRef(workspacePath); root.current = workspacePath;
  const loadedRoot = useRef(workspacePath), generation = useRef(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  const refreshBranchSnapshot = useCallback(async (workspaceRoot: string) => {
    const id = generation.current;
    const [response] = await Promise.allSettled([getWorkspaceBranches(workspaceRoot)]);
    const result = read(response, "Branches");
    if (mounted.current && root.current === workspaceRoot && id === generation.current && result.error) setGitError(result.error);
    return result.data;
  }, []);
  const reloadGitState = useCallback(async (workspaceRoot: string) => {
    if (!mounted.current || root.current !== workspaceRoot) return;
    const id = ++generation.current;
    const [snapshot, branches, graph] = await Promise.allSettled([
      getWorkspaceGitSnapshot(workspaceRoot), getWorkspaceBranches(workspaceRoot), getWorkspaceGitGraphCommits(workspaceRoot),
    ]);
    if (!mounted.current || root.current !== workspaceRoot || id !== generation.current) return;
    const status = read(snapshot, "Repository"), refs = read(branches, "Branches"), history = read(graph, "History");
    loadedRoot.current = workspaceRoot;
    setGitSnapshot(status.data); setBranchSnapshot(refs.data); setGitGraph(history.data ?? []);
    setGitError([status.error, refs.error, history.error].filter(Boolean).join("; ") || null);
  }, []);
  useEffect(() => {
    generation.current++;
    loadedRoot.current = workspacePath;
    setGitSnapshot(null); setGitError(null); setBranchSnapshot(null); setGitGraph([]);
    if (!workspacePath) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (disposed) return;
      await reloadGitState(workspacePath);
      if (!disposed) timer = setTimeout(() => void poll(), 5000);
    };
    void poll();
    return () => { disposed = true; if (timer !== undefined) clearTimeout(timer); };
  }, [workspacePath, reloadGitState]);
  const current = loadedRoot.current === workspacePath;
  return { gitSnapshot: current ? gitSnapshot : null, gitError: current ? gitError : null, branchSnapshot: current ? branchSnapshot : null, gitGraph: current ? gitGraph : [], setBranchSnapshot, refreshBranchSnapshot, reloadGitSnapshot: reloadGitState, reloadGitState };
}