import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GitGraph from "./GitGraph";
const history = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => vi.fn());
vi.mock("../../lib/ipc/git", () => ({ getGitHistoryPage: history, searchGitHistory: search }));
vi.mock("./CommitDetailsView", () => ({ default: ({ hash }: { hash: string }) => <div>Details: {hash}</div> }));
describe("native Git Graph", () => {
  it("virtualizes commit rows, pins subsequent pages and selects commits with keyboard", async () => {
    const commits = Array.from({ length: 100 }, (_, index) => ({ hash: `hash${index}`, parents: index < 99 ? [`hash${index + 1}`] : [], author: "A", date: "date", subject: `Commit ${index}`, refs: index === 0 ? ["branch: topic,comma", "tag: release"] : [] }));
    history.mockReset().mockResolvedValueOnce({ ok: true, data: { commits, tips: ["tip"], hasMore: true } }).mockResolvedValueOnce({ ok: true, data: { commits: [], tips: ["tip"], hasMore: false } });
    render(<GitGraph root="repo" />);
    const row = await screen.findByRole("button", { name: "Commit 0; hash0; 1 parents" });
    expect(screen.getByText("topic,comma")).toBeInTheDocument(); expect(screen.getAllByTestId("git-graph-node")).toHaveLength(24);
    fireEvent.keyDown(row, { key: "Enter" }); expect(screen.getByText("Details: hash0")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load 100 more commits" }));
    await waitFor(() => expect(history).toHaveBeenLastCalledWith("repo", 100, ["tip"]));
  });
  it("opens native search results outside loaded rows without filtering the graph topology", async () => {
    const current = { hash: "current", parents: ["older"], author: "A", date: "date", subject: "Current commit", refs: [] };
    const old = { ...current, hash: "very-old", subject: "Older matching commit" };
    history.mockReset().mockResolvedValue({ ok: true, data: { commits: [current], tips: ["pinned"], hasMore: true } });
    search.mockResolvedValue({ ok: true, data: { commits: [old], tips: ["pinned"], hasMore: false } });
    render(<GitGraph root="repo" />); await screen.findByRole("button", { name: "Current commit; current; 1 parents" });
    fireEvent.click(screen.getByRole("button", { name: "Search commits" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search commits" }), { target: { value: "Older" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: /very-old.*Older matching commit/ }));
    expect(screen.getByText("Details: very-old")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Current commit; current; 1 parents" })).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith("repo", expect.objectContaining({ tips: ["pinned"] }));
  });
});
