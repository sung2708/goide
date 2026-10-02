import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useExplorerDocumentTransaction } from "./useExplorerDocumentTransaction";
import { retainConflictDraft, removeConflictDraft } from "../../features/git/conflictDrafts";
function setup(saved = true) {
  const p = { root: { current: "repo" as string | null }, path: { current: "pkg/main.go" as string | null }, lock: { current: false }, mutation: { current: false }, preserve: vi.fn().mockResolvedValue(saved), isPreserved: () => saved, setBusy: vi.fn(), onError: vi.fn() };
  return { p, ...renderHook(() => useExplorerDocumentTransaction(p)) };
}
describe("Explorer document transactions", () => {
  it("blocks mutation of a retained conflict draft even when it is not the active document", async () => {
    const view = setup(), operation = vi.fn();
    retainConflictDraft("repo", { path: "other/conflicted.go", indexSignature: "stages", base: null, current: "ours", incoming: "theirs", result: "markers" }, "valuable result");
    try {
      expect(await view.result.current(operation, "other")).toBeNull(); expect(operation).not.toHaveBeenCalled();
      expect(view.p.onError).toHaveBeenCalledWith(expect.stringContaining("retained Git conflict"));
    } finally { removeConflictDraft("repo", "other/conflicted.go"); }
  });
  it("blocks folder rename/delete when preserving an affected document fails", async () => {
    const view = setup(false), operation = vi.fn();
    expect(await view.result.current(operation, "pkg")).toBeNull();
    expect(operation).not.toHaveBeenCalled(); expect(view.p.lock.current).toBe(false);
  });
  it("serializes mutations, preserves affected buffers and clears locks on failures", async () => {
    const view = setup(), operation = vi.fn(async () => { expect(view.p.lock.current).toBe(true); expect(view.p.mutation.current).toBe(true); throw new Error("permission denied"); });
    expect(await view.result.current(operation, "pkg/main.go")).toBeNull();
    expect(view.p.preserve).toHaveBeenCalledTimes(1); expect(view.p.onError).toHaveBeenCalledWith("permission denied");
    expect(view.p.lock.current).toBe(false); expect(view.p.mutation.current).toBe(false);
    await view.result.current(async () => "unrelated", "other.go"); expect(view.p.preserve).toHaveBeenCalledTimes(1);
  });
});
