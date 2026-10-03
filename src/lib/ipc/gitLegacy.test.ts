import { afterEach, expect, it, vi } from "vitest";
import { getWorkspaceGitSnapshot, getWorkspaceBranches, stageWorkspaceGitFile, unstageWorkspaceGitFile, commitWorkspaceGitChanges, getWorkspaceCommitDetail, getWorkspaceGitGraph, getWorkspaceGitGraphCommits, switchWorkspaceBranch } from "./client";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
afterEach(() => { delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__; invoke.mockReset(); });
const actions = [
  ["snapshot", () => getWorkspaceGitSnapshot("/root")], ["branches", () => getWorkspaceBranches("/root")],
  ["stage", () => stageWorkspaceGitFile({ workspaceRoot: "/root", relativePath: "main.go" })],
  ["unstage", () => unstageWorkspaceGitFile({ workspaceRoot: "/root", relativePath: "main.go" })],
  ["commit", () => commitWorkspaceGitChanges({ workspaceRoot: "/root", message: "actual commit" })],
  ["details", () => getWorkspaceCommitDetail("/root", "a".repeat(40))], ["graph", () => getWorkspaceGitGraph("/root")], ["graph commits", () => getWorkspaceGitGraphCommits("/root")],
  ["checkout", () => switchWorkspaceBranch({ workspaceRoot: "/root", targetBranch: "develop", preSwitchAction: "none" })],
] as const;
it.each(actions)("reports native-required for legacy Git %s without invented data or mutations", async (_name, run) => {
  delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  expect(await run()).toEqual({ ok: false, error: { code: "git_native_required", message: "Git operations require the desktop app and a real repository." } }); expect(invoke).not.toHaveBeenCalled();
});
it("keeps native mutation request arguments and responses unchanged", async () => {
  (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  invoke.mockResolvedValue({ ok: false, error: { code: "git_failed", message: "hook rejected" } });
  const request = { workspaceRoot: "/root", message: "actual commit" };
  expect(await commitWorkspaceGitChanges(request)).toMatchObject({ ok: false, error: { message: "hook rejected" } });
  expect(invoke).toHaveBeenCalledWith("commit_workspace_git_changes", { request });
});
