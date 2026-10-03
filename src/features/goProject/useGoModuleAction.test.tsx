import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GoModuleOutput, GoProjectInfo } from "../../lib/ipc/types";
import { useGoModuleAction } from "./useGoModuleAction";
const { native, cancel, confirm } = vi.hoisted(() => ({ native: vi.fn(), cancel: vi.fn(), confirm: vi.fn() }));
vi.mock("../../lib/ipc/client", () => ({ runGoModuleAction: native, cancelLanguageRequest: cancel, confirmGoModuleCleanup: confirm }));
const info = { workFile: null } as GoProjectInfo;
const output: GoModuleOutput = { action: "tidy", directory: "/root/a", success: true, exitCode: 0, stdout: "actual output", stderr: "" };
const setup = (transaction = vi.fn(async (operation: () => Promise<void>) => { await operation(); return true; })) => {
  const onChanged = vi.fn(), onBusy = vi.fn(), cancelPreparation = vi.fn();
  const hook = renderHook(({ root }) => useGoModuleAction({ root, info, transaction, onChanged, onBusy, cancelPreparation }), { initialProps: { root: "/root" } });
  return { hook, transaction, onChanged, onBusy, cancelPreparation };
};
beforeEach(() => { native.mockReset().mockResolvedValue({ ok: true, data: output }); cancel.mockReset().mockResolvedValue({ ok: true, data: true }); confirm.mockReset().mockResolvedValue({ ok: true, data: true }); });
afterEach(cleanup);
it("preserves all buffers under the mutation guard and refreshes actual command output", async () => {
  const { hook, transaction, onChanged, onBusy } = setup();
  await act(async () => { await hook.result.current.run("tidy", "a"); });
  expect(transaction).toHaveBeenCalledWith(expect.any(Function), true, true);
  expect(native).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: "/root", relativeDirectory: "a", action: "tidy", expectedWorkFile: null }));
  expect(hook.result.current.output).toEqual(output); expect(onChanged).toHaveBeenCalledWith("/root"); expect(onBusy.mock.calls).toEqual([[true], [false]]);
});
it("does not invoke native after preservation fails or cancellation arrives during Save All", async () => {
  const failed = setup(vi.fn(async () => { throw new Error("External-file conflict"); }));
  await act(async () => { await failed.hook.result.current.run("tidy", "."); });
  expect(native).not.toHaveBeenCalled(); expect(failed.onChanged).not.toHaveBeenCalled(); expect(failed.hook.result.current.error).toBe("External-file conflict"); failed.hook.unmount();
  let finish!: () => void;
  const held = setup(vi.fn(async operation => { await new Promise<void>(resolve => { finish = resolve; }); await operation(); return true; }));
  let work!: Promise<void>; act(() => { work = held.hook.result.current.run("download", "."); });
  act(() => { held.hook.result.current.cancel(); }); expect(held.cancelPreparation).toHaveBeenCalledOnce();
  await act(async () => { finish(); await work; }); expect(native).not.toHaveBeenCalled(); expect(held.hook.result.current.error).toContain("cancelled before startup");
});
it("keeps mutation ownership until cancellation is acknowledged and rejects duplicate starts", async () => {
  let finish!: (value: unknown) => void;
  native.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { hook, onBusy, onChanged } = setup(); let work!: Promise<void>;
  act(() => { work = hook.result.current.run("download", "."); }); await waitFor(() => expect(native).toHaveBeenCalledOnce());
  await act(async () => { hook.result.current.cancel(); await hook.result.current.run("tidy", "."); });
  expect(cancel).toHaveBeenCalledWith(native.mock.calls[0][0]); expect(native).toHaveBeenCalledOnce(); expect(hook.result.current.busy).toBe(true); expect(onBusy).not.toHaveBeenCalledWith(false);
  await act(async () => { finish({ ok: false, error: { message: "Native module command cancelled" } }); await work; });
  expect(hook.result.current.busy).toBe(false); expect(hook.result.current.error).toContain("cancelled"); expect(onChanged).toHaveBeenCalledWith("/root");
});
it("preserves failed command output, refreshes after partial mutation and rejects obsolete roots", async () => {
  native.mockResolvedValueOnce({ ok: true, data: { ...output, success: false, exitCode: 1, stderr: "invalid go.mod" } });
  const { hook, onChanged } = setup();
  await act(async () => { await hook.result.current.run("tidy", "."); });
  expect(hook.result.current.output?.stderr).toBe("invalid go.mod"); expect(hook.result.current.error).toContain("exited with 1"); expect(onChanged).toHaveBeenCalledOnce();
  let finish!: (value: unknown) => void; native.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  let work!: Promise<void>; act(() => { work = hook.result.current.run("tidy", "."); }); await waitFor(() => expect(native).toHaveBeenCalledTimes(2));
  hook.rerender({ root: "/new" }); expect(cancel).toHaveBeenCalled();
  await act(async () => { finish({ ok: true, data: output }); await work; }); expect(hook.result.current.output).toBeNull();
});
it("cancels a live owned command on unmount", async () => {
  let finish!: (value: unknown) => void; native.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { hook, onBusy } = setup(); let work!: Promise<void>;
  act(() => { work = hook.result.current.run("tidy", "."); }); await waitFor(() => expect(native).toHaveBeenCalledOnce());
  hook.unmount(); expect(cancel).toHaveBeenCalledWith(native.mock.calls[0][0]); expect(onBusy).not.toHaveBeenCalledWith(false);
  await act(async () => { finish({ ok: false, error: { message: "cancelled" } }); await work; }); expect(onBusy).toHaveBeenCalledWith(false);
});
it("retains the document transaction after transport failure until native cleanup is confirmed", async () => {
  native.mockRejectedValueOnce(new Error("IPC transport lost"));
  confirm.mockResolvedValueOnce({ ok: false, error: { message: "process reader still stopping" } });
  const { hook, onBusy, onChanged } = setup(); let work!: Promise<void>;
  act(() => { work = hook.result.current.run("tidy", "."); });
  await waitFor(() => expect(hook.result.current.error).toContain("process reader still stopping"));
  expect(hook.result.current.busy).toBe(true); expect(hook.result.current.needsCleanup).toBe(true); expect(onBusy).not.toHaveBeenCalledWith(false); expect(onChanged).not.toHaveBeenCalled();
  await act(async () => { await hook.result.current.retryCleanup(); await work; });
  expect(hook.result.current.busy).toBe(false); expect(hook.result.current.error).toContain("native cleanup is confirmed"); expect(hook.result.current.output).toBeNull(); expect(onChanged).toHaveBeenCalledWith("/root");
});
it("keeps the mutation guard after native reports incomplete teardown", async () => {
  native.mockResolvedValueOnce({ ok: false, error: { code: "go_module_cleanup_pending", message: "tree still stopping" } });
  confirm.mockResolvedValueOnce({ ok: false, error: { message: "cleanup pending" } });
  const { hook, onBusy } = setup(); let work!: Promise<void>; act(() => { work = hook.result.current.run("tidy", "."); });
  await waitFor(() => expect(hook.result.current.needsCleanup).toBe(true)); expect(onBusy).not.toHaveBeenCalledWith(false);
  await act(async () => { await hook.result.current.retryCleanup(); await work; }); expect(onBusy).toHaveBeenCalledWith(false);
});
