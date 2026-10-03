import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useGoTests } from "./useGoTests";
const { run, cancel, confirm, configure } = vi.hoisted(() => ({ run: vi.fn(), cancel: vi.fn(), confirm: vi.fn(), configure: vi.fn() }));
vi.mock("../../lib/ipc/client", () => ({ runGoTests: run, cancelLanguageRequest: cancel, confirmGoTestCleanup: confirm }));
vi.mock("../settings/toolchainConfiguration", () => ({ configureInOrder: configure }));
const result = { packages: [], success: false, exitCode: 1, stdout: "actual test events", stderr: "build failed" };
function setup(preserve = vi.fn(async (action: () => Promise<void>) => { await action(); return true; })) {
  const onChanged = vi.fn(), cancelPreparation = vi.fn();
  const hook = renderHook(({ root }) => useGoTests({ root, transaction: preserve, cancelPreparation, onChanged }), { initialProps: { root: "/root" } });
  return { hook, preserve, onChanged, cancelPreparation };
}
beforeEach(() => { configure.mockReset().mockResolvedValue({ ok: true, data: {} }); run.mockReset().mockResolvedValue({ ok: true, data: result }); cancel.mockReset().mockResolvedValue({ ok: true, data: true }); confirm.mockReset().mockResolvedValue({ ok: true, data: true }); });
afterEach(cleanup);
it("refuses to start after toolchain configuration fails", async () => {
  configure.mockResolvedValueOnce({ ok: false, error: { message: "Selected Go executable is unavailable" } });
  const { hook } = setup(); await act(async () => { await hook.result.current.run("package", "."); });
  expect(run).not.toHaveBeenCalled(); expect(hook.result.current.error).toContain("Selected Go executable"); expect(hook.result.current.busy).toBe(false);
});
it("executes an owned exact package target after Save All and retains actual failed output", async () => {
  const { hook, preserve, onChanged } = setup();
  await act(async () => { await hook.result.current.run("package", "a", "TestActual"); });
  expect(preserve).toHaveBeenCalledWith(expect.any(Function), true, true); expect(run).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: "/root", relativeDirectory: "a", target: "package", testName: "TestActual" }));
  expect(hook.result.current.output).toEqual(result); expect(hook.result.current.status).toBe("failed"); expect(onChanged).toHaveBeenCalledWith("/root");
});
it("retains mutation ownership until native cancellation completes and rejects duplicate starts", async () => {
  let finish!: (value: unknown) => void; run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { hook } = setup(); let work!: Promise<void>;
  act(() => { work = hook.result.current.run("workspace", "."); }); await waitFor(() => expect(run).toHaveBeenCalledOnce());
  await act(async () => { hook.result.current.cancel(); await hook.result.current.run("package", "."); });
  expect(cancel).toHaveBeenCalledWith(run.mock.calls[0][0]); expect(hook.result.current.busy).toBe(true);
  await act(async () => { finish({ ok: false, error: { message: "cancelled by native" } }); await work; });
  expect(hook.result.current.status).toBe("cancelled"); expect(hook.result.current.busy).toBe(false);
});
it("blocks native execution after preservation failure and discards obsolete workspace outcomes", async () => {
  const blocked = setup(vi.fn(async () => { throw new Error("external file conflict"); }));
  await act(async () => { await blocked.hook.result.current.run("package", "."); }); expect(run).not.toHaveBeenCalled(); blocked.hook.unmount();
  let finish!: (value: unknown) => void; run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { hook } = setup(); let work!: Promise<void>; act(() => { work = hook.result.current.run("package", "."); }); await waitFor(() => expect(run).toHaveBeenCalledOnce());
  hook.rerender({ root: "/other" }); expect(cancel).toHaveBeenCalled();
  await act(async () => { finish({ ok: true, data: result }); await work; }); expect(hook.result.current.output).toBeNull(); expect(hook.result.current.status).toBe("not run");
});
it("keeps the transaction held after transport failure until explicit native cleanup succeeds", async () => {
  run.mockRejectedValueOnce(new Error("transport failed")); confirm.mockResolvedValueOnce({ ok: false, error: { message: "worker still stopping" } });
  const { hook } = setup(); let work!: Promise<void>; act(() => { work = hook.result.current.run("workspace", "."); });
  await waitFor(() => expect(hook.result.current.error).toBe("worker still stopping")); expect(hook.result.current.busy).toBe(true); expect(hook.result.current.needsCleanup).toBe(true);
  await act(async () => { await hook.result.current.retryCleanup(); await work; }); expect(hook.result.current.busy).toBe(false); expect(hook.result.current.error).toContain("native cleanup is confirmed");
});
it("cancels during executable configuration before any test process starts", async () => {
  let finish!: (value: unknown) => void; configure.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { hook, cancelPreparation } = setup(); let work!: Promise<void>;
  act(() => { work = hook.result.current.run("package", "."); }); await waitFor(() => expect(configure).toHaveBeenCalledOnce());
  act(() => { hook.result.current.cancel(); }); expect(cancelPreparation).toHaveBeenCalledOnce();
  await act(async () => { finish({ ok: true, data: {} }); await work; }); expect(run).not.toHaveBeenCalled(); expect(hook.result.current.status).toBe("cancelled");
});
it("retains ownership after a structured native cleanup-pending response", async () => {
  run.mockResolvedValueOnce({ ok: false, error: { code: "go_test_cleanup_pending", message: "owned process still stopping" } });
  confirm.mockResolvedValueOnce({ ok: false, error: { message: "cleanup not confirmed" } });
  const { hook } = setup(); let work!: Promise<void>; act(() => { work = hook.result.current.run("package", "."); });
  await waitFor(() => expect(hook.result.current.needsCleanup).toBe(true)); expect(hook.result.current.busy).toBe(true);
  await act(async () => { await hook.result.current.retryCleanup(); await work; }); expect(hook.result.current.busy).toBe(false);
});
