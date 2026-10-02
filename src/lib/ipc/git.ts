import { invoke } from "@tauri-apps/api/core";
import type { ApiResponse } from "./types";

export type GitFileStatus = {
  path: string; originalPath: string | null;
  indexStatus: string; worktreeStatus: string; conflicted: boolean; submodule: boolean;
};
export type GitRepositoryStatus = {
  root: string; gitDir: string; gitVersion: string;
  branch: string | null; head: string | null; upstream: string | null;
  ahead: number; behind: number; operation: string | null; files: GitFileStatus[];
  remotes: string[];
};
export type GitFileDiff = { path: string; originalPath: string | null; patch: string; binary: boolean; limited: boolean };
export type GitMutation = { kind: "stashPush"; message: string; includeUntracked: boolean } | { kind: "stashApply" | "stashPop"; reference: string; hash: string; restoreIndex: boolean } | { kind: "stashDrop"; reference: string; hash: string } | { kind: "stage" | "unstage"; paths: string[] } | { kind: "discard" | "deleteUntracked"; path: string } | { kind: "commit"; message: string } | { kind: "fetch"; remote: string } | { kind: "pull"; remote: string; branch: string } | { kind: "push"; remote: string; branch: string; setUpstream: boolean } | { kind: "saveConflict"; path: string; expectedIndex: string; expectedDisk: string; result: string } | { kind: "stageResolved"; path: string; expectedIndex: string; expectedDisk: string } | { kind: "createBranch"; name: string; start: string | null };
export type GitConflictContent = { path: string; indexSignature: string; base: string | null; current: string | null; incoming: string | null; result: string };
export type GitStashEntry = { reference: string; hash: string; date: string; message: string };
export type GitStashList = { entries: GitStashEntry[]; hasMore: boolean };
export const getGitStashList = (workspaceRoot: string) => request<GitStashList>("git_stash_list", { workspaceRoot });
export const getGitStashPreview = (workspaceRoot: string, reference: string, hash: string) => request<GitFileDiff>("git_stash_preview", { workspaceRoot, reference, hash });
export const getGitConflictContent = (workspaceRoot: string, path: string) => request<GitConflictContent>("git_conflict_content", { workspaceRoot, path });
export type GitHistoryCommit = { hash: string; parents: string[]; author: string; date: string; subject: string; refs: string[] };
export type GitHistoryPage = { commits: GitHistoryCommit[]; tips: string[]; hasMore: boolean };
export type GitHistorySearchRequest = { field: "message" | "author" | "hash" | "file"; text: string; offset: number; tips: string[] };
export type GitCommitDetails = { hash: string; parents: string[]; author: string; email: string; date: string; message: string; selectedParent: string | null; files: { path: string; originalPath: string | null; status: string }[] };

async function request<T>(command: string, args: Record<string, unknown>): Promise<ApiResponse<T>> {
  if (!("__TAURI_INTERNALS__" in window)) {
    return { ok: false, error: { code: "git_native_required", message: "Source Control requires the desktop app. Git state is unavailable in browser preview." } };
  }
  return invoke<ApiResponse<T>>(command, args);
}
export const getGitRepositoryStatus = (workspaceRoot: string) => request<GitRepositoryStatus>("git_repository_status", { workspaceRoot });
export const getGitFileDiff = (workspaceRoot: string, path: string, staged: boolean) => request<GitFileDiff>("git_file_diff", { workspaceRoot, path, staged });
export const mutateGit = (workspaceRoot: string, mutation: GitMutation) => request<void>("git_mutate", { workspaceRoot, mutation });
export const cancelGit = (workspaceRoot: string) => request<boolean>("git_cancel", { workspaceRoot });
export const getGitHistoryPage = (workspaceRoot: string, offset: number, tips: string[]) => request<GitHistoryPage>("git_history_page", { workspaceRoot, offset, tips });
export const searchGitHistory = (workspaceRoot: string, search: GitHistorySearchRequest) => request<GitHistoryPage>("git_search_history", { workspaceRoot, request: search });
export const getGitCommitDetails = (workspaceRoot: string, hash: string, parent: string | null) => request<GitCommitDetails>("git_commit_details", { workspaceRoot, hash, parent });
export const getGitHistoricalDiff = (workspaceRoot: string, hash: string, parent: string | null, path: string) => request<GitFileDiff>("git_historical_diff", { workspaceRoot, hash, parent, path });
