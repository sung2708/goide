import { expect, it, vi } from "vitest";
import { RunOwnership } from "./runOwnership";
import type { ApiResponse } from "../../lib/ipc/types";
const context = { workspaceRoot: "/repo", runId: "23ca03b3-bd31-4ee7-b332-5f6a00e70dbe" };
it("keeps startup pending until acknowledgement and stops only the captured owner", async () => {
  const stop = vi.fn().mockResolvedValue({ ok: true }); const owner = new RunOwnership(stop);
  let finish!: (response: ApiResponse<void>) => void;
  const launch = owner.start(context, () => new Promise(resolve => { finish = resolve; }), vi.fn());
  expect(owner.current()).toEqual(context);
  await expect(owner.start({ ...context, runId: "other" }, vi.fn(), vi.fn())).rejects.toThrow("Stop the current run");
  await owner.stop(); expect(stop).toHaveBeenCalledWith(context);
  finish({ ok: false, error: { code: "run_start_failed", message: "Startup cancelled" } }); await launch;
  expect(owner.current()).toBeNull();
});
it("holds the caller after a lost launch reply until a failed cleanup is retried", async () => {
  const stop = vi.fn().mockResolvedValueOnce({ ok: false, error: { message: "job still alive" } }).mockResolvedValue({ ok: true });
  const owner = new RunOwnership(stop); const pending = vi.fn(); let finished = false;
  const launch = owner.start(context, async () => { throw new Error("transport lost"); }, pending).catch(error => { finished = true; return error; });
  await vi.waitFor(() => expect(pending).toHaveBeenCalledWith(expect.stringContaining("job still alive")));
  owner.retire(context.runId); expect(owner.current()).toEqual(context); expect(owner.cleanupPending()).toBe(true); expect(finished).toBe(false);
  await owner.stop(); expect((await launch).message).toBe("transport lost"); expect(owner.current()).toBeNull(); expect(owner.cleanupPending()).toBe(false);
  expect(stop.mock.calls).toEqual([[context], [context]]);
});
it("coalesces duplicate Stop and retains failed native startup cleanup", async () => {
  const stop = vi.fn().mockResolvedValueOnce({ ok: false, error: { message: "cleanup pending" } });
  const owner = new RunOwnership(stop); const pending = vi.fn();
  const response = { ok: false, error: { code: "run_cleanup_pending", message: "owned job retained" } };
  const launch = owner.start(context, async () => response, pending);
  await vi.waitFor(() => expect(pending).toHaveBeenCalled());
  let finish!: (response: ApiResponse<void>) => void; stop.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = owner.stop(); const second = owner.stop(); expect(first).toBe(second);
  finish({ ok: true }); await first; expect(await launch).toEqual(response);
});
it("accepts an authoritative rejection without inventing a started process", async () => {
  const stop = vi.fn(); const owner = new RunOwnership(stop);
  const response = { ok: false, error: { code: "run_start_failed", message: "invalid package" } };
  expect(await owner.start(context, async () => response, vi.fn())).toEqual(response);
  expect(stop).not.toHaveBeenCalled(); expect(owner.current()).toBeNull();
});
