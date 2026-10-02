import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SourceControlPanel from "./SourceControlPanel";
import type { GitRepositoryStatus } from "../../lib/ipc/git";
const { status, diff, mutate, history, cancel } = vi.hoisted(() => ({ status: vi.fn(), diff: vi.fn(), mutate: vi.fn(), history: vi.fn(), cancel: vi.fn() }));
vi.mock("../../lib/ipc/git", () => ({ getGitRepositoryStatus: status, getGitFileDiff: diff, mutateGit: mutate, getGitHistoryPage: history, cancelGit: cancel }));
const data: GitRepositoryStatus = {
  root: "C:/repo", gitDir: "C:/repo/.git", gitVersion: "git version 2.50", branch: "main", head: "abc", upstream: "origin/main", ahead: 2, behind: 1, operation: null,
  remotes: ["origin"],
  files: [
    { path: "both.go", originalPath: null, indexStatus: "M", worktreeStatus: "M", conflicted: false, submodule: false },
    { path: "untracked Ω.go", originalPath: null, indexStatus: "?", worktreeStatus: "?", conflicted: false, submodule: false },
  ],
};
const transaction = vi.fn(async (operation: () => Promise<void>, _saveBuffer?: boolean) => { await operation(); return true; });
const props = { workspacePath: "C:/repo", snapshot: null, transaction };
describe("Source Control vertical slice", () => {
  beforeEach(() => {
    vi.clearAllMocks(); status.mockResolvedValue({ ok: true, data }); mutate.mockResolvedValue({ ok: true });
    cancel.mockResolvedValue({ ok: true, data: true });
    diff.mockResolvedValue({ ok: true, data: { path: "both.go", originalPath: null, patch: "@@ -1 +1 @@\n-old\n+new\n", binary: false, limited: false } });
    history.mockResolvedValue({ ok: true, data: { commits: [], tips: [], hasMore: false } });
    transaction.mockImplementation(async (operation) => { await operation(); return true; });
  });
  it("shows the same file in staged and unstaged groups with independent actions", async () => {
    render(<SourceControlPanel {...props} />);
    const staged = await screen.findByRole("list", { name: "Staged changes" });
    const changed = screen.getByRole("list", { name: "Changes" });
    expect(within(staged).getByText("both.go")).toBeInTheDocument(); expect(within(changed).getByText("both.go")).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(staged).getByRole("button", { name: "Unstage both.go" })); });
    expect(mutate).toHaveBeenCalledWith("C:/repo", { kind: "unstage", paths: ["both.go"] });
    expect(transaction.mock.calls[0][1]).toBe(false);
    await act(async () => { fireEvent.click(within(changed).getByRole("button", { name: "Stage both.go" })); });
    expect(transaction.mock.calls[1][1]).toBe(true);
  });
  it("commits only staged content, keeps the message on hook failure and allows retry", async () => {
    render(<SourceControlPanel {...props} />);
    const message = await screen.findByRole("textbox", { name: "Commit message" });
    fireEvent.change(message, { target: { value: "subject\n\nbody $(literal)" } });
    mutate.mockResolvedValueOnce({ ok: false, error: { message: "hook rejected" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Commit staged (1)" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("hook rejected"); expect(message).toHaveValue("subject\n\nbody $(literal)");
    expect(mutate).toHaveBeenCalledWith("C:/repo", { kind: "commit", message: "subject\n\nbody $(literal)" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Commit staged (1)" })); });
    expect(message).toHaveValue("");
  });
  it("opens Git-generated staged/worktree diff with navigation without mutating the repository", async () => {
    render(<SourceControlPanel {...props} />);
    await screen.findByRole("list", { name: "Changes" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open changes both.go staged" })); });
    expect(diff).toHaveBeenCalledWith("C:/repo", "both.go", true);
    expect(screen.getByRole("region", { name: "Git diff" })).toHaveTextContent("+new");
    expect(screen.getByRole("button", { name: "Next change" })).toBeEnabled();
    expect(mutate).not.toHaveBeenCalled();
  });
  it("detects conflict states and keeps mutation controls disabled", async () => {
    status.mockResolvedValue({ ok: true, data: { ...data, operation: "merge", files: [{ ...data.files[0], conflicted: true, indexStatus: "U", worktreeStatus: "U" }] } });
    render(<SourceControlPanel {...props} onOpenTerminal={vi.fn()} />);
    await screen.findByRole("list", { name: "Merge changes / conflicts" });
    expect(screen.getByText(/MERGE IN PROGRESS/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commit merge (0)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open terminal" })).toBeEnabled();
  });
  it("ignores stale repository status on workspace change", async () => {
    let finish!: (value: unknown) => void;
    status.mockImplementation((root: string) => root === "C:/repo" ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve({ ok: true, data: { ...data, branch: "next" } }));
    const view = render(<SourceControlPanel {...props} />);
    await waitFor(() => expect(status).toHaveBeenCalled());
    view.rerender(<SourceControlPanel {...props} workspacePath="C:/next" />);
    await screen.findByText("next");
    await act(async () => { finish({ ok: true, data }); });
    expect(screen.getByText("next")).toBeInTheDocument(); expect(screen.queryByText("main")).not.toBeInTheDocument();
  });
  it("creates a branch explicitly without silently switching or saving the working buffer", async () => {
    render(<SourceControlPanel {...props} />);
    await screen.findByRole("list", { name: "Changes" });
    fireEvent.click(screen.getByText("Create branch"));
    fireEvent.change(screen.getByLabelText("New branch name"), { target: { value: "feature/new" } });
    await act(async () => { fireEvent.click(screen.getByText("Create from HEAD (stay here)")); });
    expect(mutate).toHaveBeenCalledWith("C:/repo", { kind: "createBranch", name: "feature/new", start: null });
    expect(transaction.mock.calls[0][1]).toBe(false);
  });
  it("requests cancellation without automatically retrying or clearing a rejected commit", async () => {
    let finish!: (value: unknown) => void;
    mutate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<SourceControlPanel {...props} />);
    const message = await screen.findByLabelText("Commit message");
    fireEvent.change(message, { target: { value: "valuable message" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit staged (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel Git operation" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith("C:/repo"));
    await act(async () => { finish({ ok: false, error: { message: "Git operation cancelled. Refresh before retrying." } }); });
    expect(message).toHaveValue("valuable message"); expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Git operation cancelled");
  });
});
