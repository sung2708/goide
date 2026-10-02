import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import GitHistorySearch from "./GitHistorySearch";
const search = vi.hoisted(() => vi.fn());
vi.mock("../../lib/ipc/git", () => ({ searchGitHistory: search }));
beforeEach(() => { search.mockReset(); });
const commit = { hash: "full-hash", parents: ["parent"], author: "Author", date: "2026", subject: "Older matching commit", refs: [] };
function submit(text = "needle [x].*") { fireEvent.change(screen.getByRole("textbox", { name: "Search commits" }), { target: { value: text } }); fireEvent.click(screen.getByRole("button", { name: "Search" })); }
it("queries native history and pins pagination rather than filtering loaded graph rows", async () => {
  search.mockResolvedValueOnce({ ok: true, data: { commits: [commit], tips: ["pinned"], hasMore: true } }).mockResolvedValueOnce({ ok: true, data: { commits: [], tips: ["pinned"], hasMore: false } });
  const select = vi.fn(); render(<GitHistorySearch root="repo" tips={["graph-tip"]} onSelect={select} onClose={vi.fn()} />);
  submit(); await screen.findByText("Older matching commit", { exact: false });
  expect(search).toHaveBeenCalledWith("repo", { field: "message", text: "needle [x].*", offset: 0, tips: ["graph-tip"] });
  fireEvent.click(screen.getByRole("button", { name: /full-hash.*Older matching commit/ })); expect(select).toHaveBeenCalledWith(commit);
  fireEvent.click(screen.getByRole("button", { name: "Load 100 more search results" }));
  await waitFor(() => expect(search).toHaveBeenLastCalledWith("repo", { field: "message", text: "needle [x].*", offset: 1, tips: ["pinned"] }));
});
it("discards late results on edited queries and workspace switches", async () => {
  let finish!: (value: unknown) => void; search.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<GitHistorySearch root="repo" tips={[]} onSelect={vi.fn()} onClose={vi.fn()} />);
  submit(); fireEvent.change(screen.getByRole("textbox", { name: "Search commits" }), { target: { value: "newer" } });
  await act(async () => { finish({ ok: true, data: { commits: [commit], tips: [], hasMore: false } }); });
  expect(screen.queryByText("Older matching commit", { exact: false })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  view.rerender(<GitHistorySearch root="next" tips={[]} onSelect={vi.fn()} onClose={vi.fn()} />);
  await act(async () => { finish({ ok: false, error: { message: "obsolete error" } }); });
  expect(screen.queryByRole("alert")).toBeNull();
});
it("surfaces native failures and routes author/hash searches without guessing commits", async () => {
  search.mockResolvedValue({ ok: false, error: { message: "ambiguous commit hash" } });
  render(<GitHistorySearch root="repo" tips={[]} onSelect={vi.fn()} onClose={vi.fn()} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Commit search field" }), { target: { value: "hash" } }); submit("abcdef0");
  expect(await screen.findByRole("alert")).toHaveTextContent("ambiguous commit hash");
  expect(search).toHaveBeenCalledWith("repo", expect.objectContaining({ field: "hash", text: "abcdef0" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Commit search field" }), { target: { value: "author" } }); submit("Author [Ω]");
  await waitFor(() => expect(search).toHaveBeenLastCalledWith("repo", expect.objectContaining({ field: "author", text: "Author [Ω]" })));
});

it("loads an exact file history request immediately, preserving literal path characters", async () => {
  search.mockResolvedValue({ ok: true, data: { commits: [commit], tips: ["pinned"], hasMore: false } });
  render(<GitHistorySearch root="repo" tips={[]} initialFilePath="space Ω [ab].go" onSelect={vi.fn()} onClose={vi.fn()} />);
  await screen.findByText("Older matching commit", { exact: false });
  expect(search).toHaveBeenCalledWith("repo", { field: "file", text: "space Ω [ab].go", offset: 0, tips: [] });
  expect(screen.getByRole("combobox", { name: "Commit search field" })).toHaveValue("file");
});
