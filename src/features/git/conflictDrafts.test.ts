import { beforeEach, expect, it, vi } from "vitest";
import { getConflictDraft, hasConflictDraftsAt, removeConflictDraft, retainConflictDraft, saveConflictDrafts } from "./conflictDrafts";
const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../../lib/ipc/git", () => ({ mutateGit: mutate }));
const content = { path: "pkg/main.go", indexSignature: "stages", base: "base", current: "ours", incoming: "theirs", result: "markers" };
beforeEach(() => { removeConflictDraft("repo", content.path); mutate.mockReset(); });
it("retains edits made during a save and advances their expected disk baseline for retry", async () => {
  retainConflictDraft("repo", content, "first");
  mutate.mockImplementationOnce(async () => { retainConflictDraft("repo", content, "newer"); return { ok: true }; });
  await expect(saveConflictDrafts("repo")).rejects.toThrow("changed while saving");
  expect(getConflictDraft("repo", content.path)).toEqual({ content: { ...content, result: "first" }, result: "newer" });
  mutate.mockResolvedValue({ ok: true }); await saveConflictDrafts("repo");
  expect(mutate).toHaveBeenLastCalledWith("repo", { kind: "saveConflict", path: content.path, expectedIndex: "stages", expectedDisk: "first", result: "newer" });
  expect(getConflictDraft("repo", content.path)).toBeUndefined();
});
it("keeps a failed draft and protects its containing folder but not similarly named paths", async () => {
  retainConflictDraft("repo", content, "valuable"); mutate.mockResolvedValue({ ok: false, error: { message: "Disk changed" } });
  await expect(saveConflictDrafts("repo")).rejects.toThrow("Disk changed");
  expect(getConflictDraft("repo", content.path)?.result).toBe("valuable");
  expect(hasConflictDraftsAt("repo", "PKG")).toBe(true); expect(hasConflictDraftsAt("repo", "pkg2")).toBe(false); expect(hasConflictDraftsAt("other", "pkg")).toBe(false);
});
