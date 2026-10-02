import { useCallback, useEffect, useRef, useState } from "react";
import { getGitFileDiff, getGitRepositoryStatus, mutateGit, cancelGit, type GitFileDiff, type GitMutation, type GitRepositoryStatus } from "../../lib/ipc/git";

export type GitTransaction = (operation: () => Promise<void>, saveBuffer?: boolean, changesFiles?: boolean) => Promise<boolean>;

export function useSourceControl(root: string | null, revision: number, transaction?: GitTransaction, onChanged?: () => void) {
  const [status, setStatus] = useState<GitRepositoryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<GitFileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [output, setOutput] = useState<string[]>([]);
  const currentRoot = useRef(root); currentRoot.current = root;
  const generation = useRef(0);
  const diffGeneration = useRef(0);
  const mutationPending = useRef(false);
  const cancellationRequested = useRef(false);
  const epoch = useRef(0);

  const refresh = useCallback(async () => {
    if (!root) return;
    const id = ++generation.current;
    setLoading(true);
    try {
      const response = await getGitRepositoryStatus(root);
      if (id !== generation.current || currentRoot.current !== root) return;
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Git status unavailable.");
      setStatus(response.data); setError(null);
    } catch (err) {
      if (id === generation.current && currentRoot.current === root) {
        setStatus(null); setError(err instanceof Error ? err.message : "Git status unavailable.");
      }
    } finally { if (id === generation.current && currentRoot.current === root) setLoading(false); }
  }, [root]);

  useEffect(() => {
    epoch.current++;
    setBusy(false); setDiffLoading(false);
    setStatus(null); setDiff(null); setError(null); setOperationError(null); setOutput([]);
    const timer = setTimeout(() => { void refresh(); }, 0);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    // Low-frequency fallback catches external index/ref changes not included in
    // the workspace watcher. Foreground invalidation is debounced below.
    const fallback = setInterval(() => { if (!document.hidden && !mutationPending.current) void refresh(); }, 30000);
    return () => { clearTimeout(timer); clearInterval(fallback); window.removeEventListener("focus", focus); generation.current++; diffGeneration.current++; epoch.current++; };
  }, [refresh]);
  useEffect(() => {
    const timer = setTimeout(() => { if (!mutationPending.current) void refresh(); }, 200);
    return () => clearTimeout(timer);
  }, [revision, refresh]);

  const openDiff = useCallback(async (path: string, staged: boolean) => {
    if (!root) return;
    const id = ++diffGeneration.current;
    setDiff(null); setDiffLoading(true); setError(null);
    try {
      const response = await getGitFileDiff(root, path, staged);
      if (id !== diffGeneration.current || currentRoot.current !== root) return;
      if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Unable to load diff.");
      setDiff(response.data);
    } catch (err) {
      if (id === diffGeneration.current && currentRoot.current === root) setError(err instanceof Error ? err.message : "Unable to load diff.");
    } finally { if (id === diffGeneration.current && currentRoot.current === root) setDiffLoading(false); }
  }, [root]);

  const mutate = useCallback(async (mutation: GitMutation) => {
    if (!root || mutationPending.current || !transaction) return false;
    mutationPending.current = true; cancellationRequested.current = false; setBusy(true); setOperationError(null);
    const session = epoch.current;
    const changesFiles = ["pull", "discard", "deleteUntracked", "saveConflict", "stashPush", "stashApply", "stashPop"].includes(mutation.kind);
    let started = false;
    let succeeded = false;
    try {
      await transaction(async () => {
        if (cancellationRequested.current) throw new Error("Git operation cancelled before execution. No Git mutation was started.");
        started = true;
        const response = await mutateGit(root, mutation);
        if (!response.ok) throw new Error(response.error?.message ?? "Git operation failed.");
        succeeded = true;
      }, mutation.kind === "stage" || changesFiles, changesFiles);
      if (currentRoot.current !== root || epoch.current !== session) return false;
      if (succeeded) {
        diffGeneration.current++; setDiff(null);
        setOutput((lines) => [...lines.slice(-49), `${mutation.kind}: completed`]);
        if (!changesFiles) onChanged?.();
      }
    } catch (err) {
      if (currentRoot.current === root && epoch.current === session) {
        const message = err instanceof Error ? err.message : "Git operation failed.";
        setOperationError(message); setOutput((lines) => [...lines.slice(-19), `${mutation.kind}: ${message.slice(0, 8192)}`]);
      }
    } finally {
      mutationPending.current = false;
      if (started && changesFiles && currentRoot.current === root && epoch.current === session) onChanged?.();
      if (currentRoot.current === root && epoch.current === session) { setBusy(false); await refresh(); }
    }
    return succeeded;
  }, [root, transaction, onChanged, refresh]);

  const cancel = async () => {
    if (!root || !busy) return;
    cancellationRequested.current = true;
    try { const response = await cancelGit(root); if (!response.ok) throw new Error(response.error?.message ?? "Cancellation failed.");
      setOutput((lines) => [...lines.slice(-19), "Cancellation requested; waiting for Git to stop. Repository state will be refreshed."]);
    } catch (error) { setOperationError(error instanceof Error ? error.message : String(error)); }
  };
  return { status, error: operationError ?? error, loading, busy, diff, diffLoading, output, refresh, openDiff, mutate, cancel, closeDiff: () => { diffGeneration.current++; setDiff(null); setDiffLoading(false); } };
}
