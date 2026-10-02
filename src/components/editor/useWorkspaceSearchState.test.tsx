import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useWorkspaceSearchState } from "./useWorkspaceSearchState";
const { search, preview, write, cancel } = vi.hoisted(() => ({ search: vi.fn(), preview: vi.fn(), write: vi.fn(), cancel: vi.fn() }));
vi.mock("../../lib/ipc/client", () => ({ searchWorkspaceText: search, previewWorkspaceReplacement: preview, writeWorkspaceFile: write, cancelWorkspaceSearch: cancel }));
const transaction = vi.fn(async (operation: () => Promise<void>) => { await operation(); return true; });
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(window, "confirm").mockReturnValue(true);
  search.mockResolvedValue({ ok: true, data: [{ relativePath: "a.go", matches: [{ line: 1, preview: "Needle needle" }] }] });
  preview.mockResolvedValue({ ok: true, data: [{ path: "a.go", before: "Needle needle\r\nneedle unlisted\r\n", after: "$literal $literal\r\nneedle unlisted\r\n", occurrences: 2 }] });
  cancel.mockResolvedValue({ ok: true, data: true });
  write.mockResolvedValue({ ok: true });
  transaction.mockImplementation(async (operation) => { await operation(); return true; });
});
it("replaces only displayed matching lines, keeps CRLF and sends the disk baseline", async () => {
  const { result } = renderHook(() => useWorkspaceSearchState("repo", { transaction }));
  await act(async () => { await result.current.handleWorkspaceSearch("needle"); });
  await act(async () => { await result.current.replaceAllMatches("needle", "$literal"); });
  expect(write).toHaveBeenCalledWith("repo", "a.go", "$literal $literal\r\nneedle unlisted\r\n", "Needle needle\r\nneedle unlisted\r\n");
  expect(window.confirm).toHaveBeenCalled();
});
it("keeps disk untouched when the preview is stale or preserving dirty edits fails", async () => {
  const { result } = renderHook(() => useWorkspaceSearchState("repo", { transaction }));
  await act(async () => { await result.current.handleWorkspaceSearch("needle"); });
  preview.mockResolvedValueOnce({ ok: false, error: { message: "a.go changed since search" } });
  await act(async () => { await result.current.replaceMatch("a.go", 1, "needle", "x"); });
  expect(write).not.toHaveBeenCalled(); expect(result.current.searchError).toContain("changed since search");
  transaction.mockResolvedValueOnce(false);
  await act(async () => { await result.current.replaceAllMatches("needle", "x"); });
  expect(write).not.toHaveBeenCalled(); expect(result.current.searchError).toContain("preservation failed");
});
it("reports a failed write and does not continue silently to later files", async () => {
  search.mockResolvedValue({ ok: true, data: ["a.go", "b.go"].map((relativePath) => ({ relativePath, matches: [{ line: 1, preview: "Needle needle" }] })) });
  const { result } = renderHook(() => useWorkspaceSearchState("repo", { transaction }));
  await act(async () => { await result.current.handleWorkspaceSearch("needle"); });
  write.mockResolvedValueOnce({ ok: false, error: { message: "external_file_conflict" } });
  await act(async () => { await result.current.replaceAllMatches("needle", "x"); });
  expect(write).toHaveBeenCalledTimes(1); expect(result.current.searchError).toContain("0 file(s) saved");
});
it("rejects old workspace responses even without starting a new search", async () => {
  let finish!: (value: unknown) => void;
  search.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const { result, rerender } = renderHook(({ root }) => useWorkspaceSearchState(root, { transaction }), { initialProps: { root: "old" } });
  act(() => { void result.current.handleWorkspaceSearch("needle"); }); rerender({ root: "new" });
  await act(async () => { finish({ ok: true, data: [{ relativePath: "old.go", matches: [] }] }); });
  await waitFor(() => expect(result.current.workspaceSearchResults).toEqual([]));
});
