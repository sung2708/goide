import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkspaceGitState } from "./useWorkspaceGitState";
const { snapshot, branches, graph } = vi.hoisted(() => ({ snapshot: vi.fn(), branches: vi.fn(), graph: vi.fn() }));
vi.mock("../../lib/ipc/client", () => ({ getWorkspaceGitSnapshot: snapshot, getWorkspaceBranches: branches, getWorkspaceGitGraphCommits: graph }));
beforeEach(() => {
  snapshot.mockReset().mockResolvedValue({ ok: true, data: { branch: "actual", changedFiles: [], commits: [] } });
  branches.mockReset().mockResolvedValue({ ok: true, data: { currentBranch: "actual", branches: [] } }); graph.mockReset().mockResolvedValue({ ok: true, data: [] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("retains successful native data and exposes independent reload failures without rejecting", async () => {
  const hook = renderHook(() => useWorkspaceGitState("/root"));
  await waitFor(() => expect(hook.result.current.gitSnapshot?.branch).toBe("actual"));
  branches.mockRejectedValueOnce(new Error("reference read failed")); graph.mockResolvedValueOnce({ ok: false, error: { message: "history failed" } });
  await act(async () => { await hook.result.current.reloadGitState("/root"); });
  expect(hook.result.current.gitSnapshot?.branch).toBe("actual"); expect(hook.result.current.branchSnapshot).toBeNull(); expect(hook.result.current.gitGraph).toEqual([]);
  expect(hook.result.current.gitError).toContain("reference read failed"); expect(hook.result.current.gitError).toContain("history failed");
  await act(async () => { await hook.result.current.reloadGitState("/root"); }); expect(hook.result.current.gitError).toBeNull();
});
it("rejects stale manual reloads across roots and keeps a newer reload authoritative", async () => {
  const hook = renderHook(({ root }) => useWorkspaceGitState(root), { initialProps: { root: "/old" } });
  await waitFor(() => expect(hook.result.current.gitSnapshot).not.toBeNull());
  let finish!: (value: unknown) => void; snapshot.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let old!: Promise<void>; act(() => { old = hook.result.current.reloadGitState("/old"); });
  snapshot.mockResolvedValue({ ok: true, data: { branch: "new root", changedFiles: [], commits: [] } }); hook.rerender({ root: "/new" });
  expect(hook.result.current.gitSnapshot).toBeNull(); await waitFor(() => expect(hook.result.current.gitSnapshot?.branch).toBe("new root"));
  await act(async () => { finish({ ok: true, data: { branch: "obsolete", changedFiles: [], commits: [] } }); await old; });
  expect(hook.result.current.gitSnapshot?.branch).toBe("new root");
  snapshot.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let retired!: Promise<void>; act(() => { retired = hook.result.current.reloadGitState("/new"); });
  await act(async () => { await hook.result.current.reloadGitState("/new"); finish({ ok: false, error: { message: "retired failure" } }); await retired; });
  expect(hook.result.current.gitSnapshot?.branch).toBe("new root"); expect(hook.result.current.gitError).toBeNull();
});
it("clears unavailable repository data and preserves branch-refresh error details", async () => {
  const hook = renderHook(() => useWorkspaceGitState("/root"));
  await waitFor(() => expect(hook.result.current.gitSnapshot).not.toBeNull());
  snapshot.mockRejectedValueOnce(new Error("repository removed"));
  await act(async () => { await hook.result.current.reloadGitSnapshot("/root"); }); expect(hook.result.current.gitSnapshot).toBeNull(); expect(hook.result.current.gitError).toContain("repository removed");
  branches.mockRejectedValueOnce(new Error("branches unavailable"));
  await act(async () => { expect(await hook.result.current.refreshBranchSnapshot("/root")).toBeNull(); });
  expect(hook.result.current.gitError).toContain("branches unavailable");
});
it("does not accumulate poll timers after workspace disposal or unmount", async () => {
  vi.useFakeTimers();
  const hook = renderHook(({ root }) => useWorkspaceGitState(root), { initialProps: { root: "/root" as string | null } });
  await act(async () => { await Promise.resolve(); }); expect(vi.getTimerCount()).toBe(1);
  hook.rerender({ root: null }); expect(vi.getTimerCount()).toBe(0); expect(hook.result.current.branchSnapshot).toBeNull();
  hook.rerender({ root: "/new" }); await act(async () => { await Promise.resolve(); }); expect(vi.getTimerCount()).toBe(1);
  hook.unmount(); expect(vi.getTimerCount()).toBe(0);
});
