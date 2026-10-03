import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SourceControlPanel from "./SourceControlPanel";
import type { GitRepositoryStatus } from "../../lib/ipc/git";
import { settingsStore } from "../settings/SettingsStore";
const { status, diff, mutate, history, cancel, search, stashes } = vi.hoisted(() => ({ status: vi.fn(), diff: vi.fn(), mutate: vi.fn(), history: vi.fn(), cancel: vi.fn(), search: vi.fn(), stashes: vi.fn() }));
vi.mock("../../lib/ipc/git", () => ({ getGitRepositoryStatus: status, getGitFileDiff: diff, mutateGit: mutate, getGitHistoryPage: history, cancelGit: cancel, searchGitHistory: search, getGitStashList: stashes, getGitStashPreview: diff }));
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
    stashes.mockResolvedValue({ ok: true, data: { entries: [{ reference: "stash@{0}", hash: "a".repeat(40), date: "2026-10-03", message: "On main: saved" }], hasMore: false } });
    diff.mockResolvedValue({ ok: true, data: { path: "both.go", originalPath: null, patch: "@@ -1 +1 @@\n-old\n+new\n", binary: false, limited: false } });
    history.mockResolvedValue({ ok: true, data: { commits: [], tips: [], hasMore: false } });
    search.mockResolvedValue({ ok: true, data: { commits: [], tips: [], hasMore: false } });
    transaction.mockImplementation(async (operation) => { await operation(); return true; });
  });
  it("shows the same file in staged and unstaged groups with independent actions", async () => {
    render(<SourceControlPanel {...props} />);
    const staged = await screen.findByRole("list", { name: "Staged changes" });
    const changed = screen.getByRole("list", { name: "Changes" });
    expect(within(staged).getByText("both.go")).toBeInTheDocument(); expect(within(changed).getByText("both.go")).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(staged).getByRole("button", { name: "Unstage both.go" })); });
    expect(mutate).toHaveBeenCalledWith("C:/repo", { kind: "unstage", paths: ["both.go"] }, expect.any(String));
    expect(transaction.mock.calls[0][1]).toBe(false);
    await act(async () => { fireEvent.click(within(changed).getByRole("button", { name: "Stage both.go" })); });
    expect(transaction.mock.calls[1][1]).toBe(true);
  });
  it("honors repeated command view requests after local tab changes", async () => {
    const view = render(<SourceControlPanel {...props} requestedView={{ view: "stashes", id: 1 }} />);
    expect(await screen.findByRole("button", { name: "Drop stash@{0}" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Changes" }));
    expect(await screen.findByRole("list", { name: "Staged changes" })).toBeInTheDocument();
    view.rerender(<SourceControlPanel {...props} requestedView={{ view: "stashes", id: 2 }} />);
    expect(await screen.findByRole("button", { name: "Drop stash@{0}" })).toBeInTheDocument();
  });
  it("uses the configured default Source Control view on opening", async () => {
    settingsStore.update("git.defaultView", "stashes");
    const view = render(<SourceControlPanel {...props} />);
    try { expect(await screen.findByRole("button", { name: "Drop stash@{0}" })).toBeInTheDocument(); }
    finally { view.unmount(); settingsStore.reset(); }
  });
  it("routes stash file mutations through save/run guards and refreshes partially changed state on failure", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const changed = vi.fn(); mutate.mockResolvedValue({ ok: false, error: { message: "Apply conflict; stash retained" } });
    render(<SourceControlPanel {...props} onChanged={changed} />);
    await screen.findByRole("list", { name: "Changes" }); fireEvent.click(screen.getByRole("button", { name: "Stashes" }));
    await screen.findByRole("button", { name: "Pop stash@{0}" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Pop stash@{0}" })); });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), true, true);
    expect(changed).toHaveBeenCalledOnce(); expect(screen.getByRole("alert")).toHaveTextContent("stash retained");
    expect(mutate).toHaveBeenCalledWith("C:/repo", expect.objectContaining({ kind: "stashPop", hash: "a".repeat(40) }), expect.any(String));
    transaction.mockClear(); mutate.mockResolvedValue({ ok: true });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Drop stash@{0}" })); });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), false, false);
    vi.restoreAllMocks();
  });
  it("commits only staged content, keeps the message on hook failure and allows retry", async () => {
    render(<SourceControlPanel {...props} />);
    const message = await screen.findByRole("textbox", { name: "Commit message" });
    fireEvent.change(message, { target: { value: "subject\n\nbody $(literal)" } });
    mutate.mockResolvedValueOnce({ ok: false, error: { message: "hook rejected" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Commit staged (1)" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("hook rejected"); expect(message).toHaveValue("subject\n\nbody $(literal)");
    expect(mutate).toHaveBeenCalledWith("C:/repo", { kind: "commit", message: "subject\n\nbody $(literal)" }, expect.any(String));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Commit staged (1)" })); });
    expect(message).toHaveValue("");
    expect(mutate.mock.calls[1][2]).not.toBe(mutate.mock.calls[0][2]);
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
  it("opens file history from the exact status row without saving or mutating", async () => {
    render(<SourceControlPanel {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "File history both.go" }));
    await waitFor(() => expect(search).toHaveBeenCalledWith("C:/repo", expect.objectContaining({ field: "file", text: "both.go", offset: 0 })));
    expect(screen.getByRole("region", { name: "Search repository history" })).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
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
    expect(mutate).toHaveBeenCalledWith("C:/repo", { kind: "createBranch", name: "feature/new", start: null }, expect.any(String));
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
    await waitFor(() => expect(cancel).toHaveBeenCalledWith("C:/repo", mutate.mock.calls[0][2]));
    await act(async () => { finish({ ok: false, error: { message: "Git operation cancelled. Refresh before retrying." } }); });
    expect(message).toHaveValue("valuable message"); expect(mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Git operation cancelled");
  });
  it("does not apply an old cancellation error to the next operation", async () => {
    let finishFirst!: (value: unknown) => void;
    let finishSecond!: (value: unknown) => void;
    let finishCancel!: (value: unknown) => void;
    mutate.mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
    cancel.mockImplementationOnce(() => new Promise(resolve => { finishCancel = resolve; }));
    render(<SourceControlPanel {...props} />);
    const message = await screen.findByLabelText("Commit message");
    fireEvent.change(message, { target: { value: "preserve message" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit staged (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel Git operation" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith("C:/repo", mutate.mock.calls[0][2]));
    await act(async () => { finishFirst({ ok: false, error: { message: "First operation stopped" } }); });
    fireEvent.click(screen.getByRole("button", { name: "Commit staged (1)" }));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(2));
    expect(mutate.mock.calls[1][2]).not.toBe(mutate.mock.calls[0][2]);
    await act(async () => { finishCancel({ ok: false, error: { message: "Old cancellation failure" } }); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(message).toHaveValue("preserve message");
    await act(async () => { finishSecond({ ok: true }); });
  });
});
