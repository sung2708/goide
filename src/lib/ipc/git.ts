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
};
export type GitFileDiff = { path: string; originalPath: string | null; patch: string; binary: boolean; limited: boolean };
export type GitMutation = { kind: "stage" | "unstage"; paths: string[] } | { kind: "commit"; message: string };
export type GitHistoryCommit = { hash: string; parents: string[]; author: string; date: string; subject: string; refs: string[] };
export type GitHistoryPage = { commits: GitHistoryCommit[]; tips: string[]; hasMore: boolean };

async function request<T>(command: string, args: Record<string, unknown>): Promise<ApiResponse<T>> {
  if (!("__TAURI_INTERNALS__" in window)) {
    return { ok: false, error: { code: "git_native_required", message: "Source Control requires the desktop app. Git state is unavailable in browser preview." } };
  }
  return invoke<ApiResponse<T>>(command, args);
}
export const getGitRepositoryStatus = (workspaceRoot: string) => request<GitRepositoryStatus>("git_repository_status", { workspaceRoot });
export const getGitFileDiff = (workspaceRoot: string, path: string, staged: boolean) => request<GitFileDiff>("git_file_diff", { workspaceRoot, path, staged });
export const mutateGit = (workspaceRoot: string, mutation: GitMutation) => request<void>("git_mutate", { workspaceRoot, mutation });
export const getGitHistoryPage = (workspaceRoot: string, offset: number, tips: string[]) => request<GitHistoryPage>("git_history_page", { workspaceRoot, offset, tips });
