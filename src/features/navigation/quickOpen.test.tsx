import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { indexWorkspace, rankFiles } from "./quickOpen";
import { useQuickOpenIndex } from "./useQuickOpenIndex";
const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../../lib/ipc/client", () => ({ listWorkspaceEntries: list }));
beforeEach(() => { list.mockReset(); localStorage.clear(); });
it("matches noncontiguous filename characters and prioritizes exact names and recent files", () => {
  expect(rankFiles(["cmd/main.go", "model.go", "pkg/messaging.go"], "msg", [])).toEqual(["pkg/messaging.go"]);
  expect(rankFiles(["cmd/main.go", "main.go", "main.go.old"], "main.go", [])).toEqual(["main.go", "cmd/main.go", "main.go.old"]);
  expect(rankFiles(["a.go", "b.go", "c.go"], "", ["c.go", "a.go"])).toEqual(["c.go", "a.go", "b.go"]);
});
it("excludes generated trees and reports partial indexing errors instead of hiding them", async () => {
  list.mockImplementation(async (_root: string, path?: string) => path
    ? { ok: false, error: { message: "Permission denied" } }
    : { ok: true, data: [{ name: "target", path: "target", isDir: true }, { name: "pkg", path: "pkg", isDir: true }, { name: "main.go", path: "main.go", isDir: false }] });
  const result = await indexWorkspace("repo", () => false);
  expect(result.files).toEqual(["main.go"]); expect(result.notice).toContain("Permission denied");
  expect(list.mock.calls.map(call => call[1])).toEqual([undefined, "pkg"]);
});
it("stops traversal when cancelled and surfaces root errors", async () => {
  list.mockResolvedValue({ ok: false, error: { message: "Workspace missing" } });
  await expect(indexWorkspace("repo", () => false)).rejects.toThrow("Workspace missing");
  list.mockClear(); await expect(indexWorkspace("repo", () => true)).rejects.toThrow("cancelled"); expect(list).not.toHaveBeenCalled();
});
it("reuses the index across palette openings and invalidates it on a filesystem revision", async () => {
  list.mockResolvedValue({ ok: true, data: [{ name: "main.go", path: "main.go", isDir: false }, { name: "b.go", path: "b.go", isDir: false }] });
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
  await act(async () => finish({ ok: true, data: [{ name: "old.go", path: "old.go", isDir: false }] }));
  expect(view.result.current.files).toEqual([]); expect(view.result.current.error).toBe("Unavailable"); expect(view.result.current.loading).toBe(false);
});
