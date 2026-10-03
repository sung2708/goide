import { expect, it, vi } from "vitest";
import { DebuggerStartup } from "./startup";
import type { ApiResponse } from "../../lib/ipc/types";
const context = { workspaceRoot: "/repo", requestId: "dfc6e183-c662-4e7d-9a5d-0c887fb7a916" };
it("retains the captured startup until adoption and refuses a second actor", async () => {
  const cancel = vi.fn().mockResolvedValue({ ok: true }); const startup = new DebuggerStartup(cancel);
  expect(await startup.start(context, async () => ({ ok: true, data: "actual session" }), vi.fn())).toEqual({ ok: true, data: "actual session" });
  await expect(startup.start({ ...context, requestId: "other" }, vi.fn(), vi.fn())).rejects.toThrow("current debugger startup");
  startup.adopt("foreign"); expect(startup.current()).toEqual(context);
  startup.adopt(context.requestId); expect(startup.current()).toBeNull(); await startup.cancel(); expect(cancel).not.toHaveBeenCalled();
});
it("holds a lost reply until native cleanup succeeds on retry", async () => {
  const cancel = vi.fn().mockResolvedValueOnce({ ok: false, error: { message: "adapter still alive" } }).mockResolvedValue({ ok: true });
  const startup = new DebuggerStartup(cancel); const pending = vi.fn(); let finished = false;
  const launch = startup.start(context, async () => { throw new Error("reply lost"); }, pending).finally(() => { finished = true; });
  await vi.waitFor(() => expect(pending).toHaveBeenCalledWith(expect.stringContaining("adapter still alive")));
  startup.adopt(context.requestId); expect(startup.current()).toEqual(context); expect(finished).toBe(false);
  await startup.cancel(); expect((await launch).error?.code).toBe("debug_startup_cancelled"); expect(startup.current()).toBeNull();
  expect(cancel.mock.calls).toEqual([[context], [context]]);
});
it("confirmed Cancel releases a hung startup reply and retires a late success", async () => {
  const cancel = vi.fn().mockResolvedValue({ ok: true }); const startup = new DebuggerStartup(cancel);
  let finish!: (reply: ApiResponse<string>) => void;
  const launch = startup.start(context, () => new Promise<ApiResponse<string>>(resolve => { finish = resolve; }), vi.fn());
  await Promise.resolve(); await startup.cancel();
  expect((await launch).error?.code).toBe("debug_startup_cancelled"); expect(cancel).toHaveBeenCalledWith(context);
  finish({ ok: true, data: "late SDK session" }); await Promise.resolve(); expect(startup.current()).toBeNull();
});
it("does not adopt an acknowledgement while a failing cancellation is still pending", async () => {
  let cancelReply!: (reply: ApiResponse<void>) => void; const cancel = vi.fn(() => new Promise<ApiResponse<void>>(resolve => { cancelReply = resolve; }));
  const startup = new DebuggerStartup(cancel); const pending = vi.fn();
  let launchReply!: (reply: ApiResponse<string>) => void;
  const launch = startup.start(context, () => new Promise<ApiResponse<string>>(resolve => { launchReply = resolve; }), pending);
  await Promise.resolve(); const cancelling = startup.cancel(); launchReply({ ok: true, data: "already acknowledged" });
  cancelReply({ ok: false, error: { code: "debug_startup_cleanup_pending", message: "retained job" } }); await expect(cancelling).rejects.toThrow("retained job");
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
  cancelReply({ ok: false, error: { code: "debug_startup_cleanup_pending", message: "still retained" } });
  await vi.waitFor(() => expect(pending).toHaveBeenCalled()); expect(startup.cleanupPending()).toBe(true);
  const retry = startup.cancel(); cancelReply({ ok: true }); await retry;
  expect((await launch).error?.code).toBe("debug_startup_cancelled"); expect(startup.current()).toBeNull();
});
it("trusts an authoritative native rejection without inventing a session", async () => {
  const cancel = vi.fn(); const startup = new DebuggerStartup(cancel);
  expect((await startup.start(context, async () => ({ ok: false, error: { code: "debug_target_invalid", message: "excluded file" } }), vi.fn())).ok).toBe(false);
  expect(cancel).not.toHaveBeenCalled(); expect(startup.current()).toBeNull();
});
