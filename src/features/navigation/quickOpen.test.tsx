import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { indexWorkspace, rankFiles } from "./quickOpen";
import { useQuickOpenIndex } from "./useQuickOpenIndex";
const { list, cancel } = vi.hoisted(() => ({ list: vi.fn(), cancel: vi.fn() }));
vi.mock("../../lib/ipc/client", () => ({ indexWorkspaceFiles: list, cancelWorkspaceSearch: cancel }));
beforeEach(() => { list.mockReset(); cancel.mockReset(); cancel.mockResolvedValue({ ok: true }); localStorage.clear(); });
it("matches noncontiguous filename characters and prioritizes exact names and recent files", () => {
  expect(rankFiles(["cmd/main.go", "model.go", "pkg/messaging.go"], "msg", [])).toEqual(["pkg/messaging.go"]);
  expect(rankFiles(["cmd/main.go", "main.go", "main.go.old"], "main.go", [])).toEqual(["main.go", "cmd/main.go", "main.go.old"]);
  expect(rankFiles(["a.go", "b.go", "c.go"], "", ["c.go", "a.go"])).toEqual(["c.go", "a.go", "b.go"]);
});
it("preserves native partial-index notices and uses one IPC request", async () => {
  list.mockResolvedValue({ ok: true, data: { files: ["main.go"], notice: "Permission denied" } });
  const result = await indexWorkspace("repo", new AbortController().signal);
  expect(result.files).toEqual(["main.go"]); expect(result.notice).toContain("Permission denied");
  expect(list).toHaveBeenCalledTimes(1);
});
it("does not start an aborted request and surfaces root errors", async () => {
  list.mockResolvedValue({ ok: false, error: { message: "Workspace missing" } });
  await expect(indexWorkspace("repo", new AbortController().signal)).rejects.toThrow("Workspace missing");
  list.mockClear(); const controller = new AbortController(); controller.abort();
  await expect(indexWorkspace("repo", controller.signal)).rejects.toThrow("cancelled"); expect(list).not.toHaveBeenCalled();
});
it("cancels native work by identity and rejects its late response", async () => {
  let finish!: (value: unknown) => void;
  list.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController(); const pending = indexWorkspace("repo", controller.signal);
  controller.abort(); expect(cancel).toHaveBeenCalledWith(list.mock.calls[0][1]);
  finish({ ok: true, data: { files: ["late.go"], notice: null } });
  await expect(pending).rejects.toThrow("cancelled");
});
it("reuses the index across palette openings and invalidates it on a filesystem revision", async () => {
  list.mockResolvedValue({ ok: true, data: { files: ["main.go", "b.go"], notice: null } });
  const view = renderHook(({ open, revision }) => useQuickOpenIndex("repo", revision, open, ""), { initialProps: { open: true, revision: 0 } });
  await waitFor(() => expect(view.result.current.files).toHaveLength(2));
  act(() => view.result.current.remember("main.go")); expect(view.result.current.files[0]).toBe("main.go");
  view.rerender({ open: false, revision: 0 }); view.rerender({ open: true, revision: 0 }); expect(list).toHaveBeenCalledTimes(1);
  view.rerender({ open: true, revision: 1 }); await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
});
it("ignores a late response from a previous workspace and exposes failure without showing its files", async () => {
  let finish!: (value: unknown) => void;
  list.mockImplementation((root: string) => root === "old" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ ok: false, error: { message: "Unavailable" } }));
  const view = renderHook(({ root }) => useQuickOpenIndex(root, 0, true, ""), { initialProps: { root: "old" } });
  view.rerender({ root: "new" }); await waitFor(() => expect(view.result.current.error).toBe("Unavailable"));
  await act(async () => finish({ ok: true, data: { files: ["old.go"], notice: null } }));
  expect(view.result.current.files).toEqual([]); expect(view.result.current.error).toBe("Unavailable"); expect(view.result.current.loading).toBe(false);
});

it("cancels an unfinished index when the picker closes", async () => {
  list.mockImplementation(() => new Promise(() => {}));
  const view = renderHook(({ open }) => useQuickOpenIndex("repo", 0, open, ""), { initialProps: { open: true } });
  view.rerender({ open: false });
  expect(cancel).toHaveBeenCalledWith(list.mock.calls[0][1]);
  expect(view.result.current.loading).toBe(false);
});
