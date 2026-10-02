import { expect, it, vi } from "vitest";
import { ShellWorkspaceOwnership } from "./ShellWorkspaceOwnership";
it("retains failed disposals and retries only those IDs", async () => {
  const dispose = vi.fn().mockResolvedValue(undefined).mockRejectedValueOnce(new Error("stop denied"));
  const owner = new ShellWorkspaceOwnership(dispose); owner.begin("old")("one"); owner.begin("old")("two");
  await expect(owner.cleanupOutside(() => "new")).rejects.toThrow("old: stop denied"); expect(owner.hasOutside("new")).toBe(true);
  await owner.cleanupOutside(() => "new"); expect(owner.hasOutside("new")).toBe(false);
  expect(dispose.mock.calls.map(call => call[0])).toEqual(["one", "two", "one"]);
});
it("waits for late setup and then disposes the child returned by that setup", async () => {
  const dispose = vi.fn().mockResolvedValue(undefined); const owner = new ShellWorkspaceOwnership(dispose);
  const finish = owner.begin("old"); let complete = false;
  const cleanup = owner.cleanupOutside(() => "new").then(() => { complete = true; });
  await Promise.resolve(); expect(complete).toBe(false); expect(dispose).not.toHaveBeenCalled();
  finish("late-child"); await cleanup; expect(dispose).toHaveBeenCalledWith("late-child"); expect(owner.hasOutside("new")).toBe(false);
});
it("uses the latest root after awaiting setup and serializes cleanup attempts", async () => {
  const dispose = vi.fn().mockResolvedValue(undefined); const owner = new ShellWorkspaceOwnership(dispose);
  const finish = owner.begin("first"); let root = "second";
  const first = owner.cleanupOutside(() => root); const second = owner.cleanupOutside(() => root);
  await Promise.resolve(); root = "first"; finish("keep-current"); await Promise.all([first, second]);
  expect(dispose).not.toHaveBeenCalled(); expect(owner.hasOutside("first")).toBe(false); expect(owner.hasOutside(null)).toBe(true);
  await owner.cleanupOutside(() => null); expect(dispose).toHaveBeenCalledOnce();
});
it("settles failed setup without a phantom session and forgets acknowledged natural exits", async () => {
  const dispose = vi.fn(); const owner = new ShellWorkspaceOwnership(dispose);
  const finish = owner.begin("old"); finish(); finish("duplicate");
  owner.begin("old")("exited"); owner.forget("exited"); await owner.cleanupOutside(() => "new");
  expect(dispose).not.toHaveBeenCalled(); expect(owner.hasOutside(null)).toBe(false);
});