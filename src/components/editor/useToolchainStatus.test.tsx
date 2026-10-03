import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useToolchainStatus } from "./useToolchainStatus";
const query = vi.hoisted(() => vi.fn());
const configure = vi.hoisted(() => vi.fn());
vi.mock("../../lib/ipc/client", () => ({ getToolchainStatus: query, configureToolchainPaths: configure }));
beforeEach(() => { query.mockReset(); configure.mockReset(); configure.mockResolvedValue({ ok: true }); });
it("reports probe errors, retries, and preserves returned actual tool information", async () => {
  query.mockRejectedValueOnce(new Error("owned probe failed"));
  const hook = renderHook(() => useToolchainStatus());
  await waitFor(() => expect(hook.result.current.error).toBe("owned probe failed")); expect(hook.result.current.status).toBeNull();
  const status = { go: { available: true, path: "/go/bin/go", version: "go version actual", status: "ready" }, gopls: { available: false, status: "missing" }, delve: { available: false, status: "failed", error: "permission denied" } };
  query.mockResolvedValue({ ok: true, data: status }); await act(() => hook.result.current.refresh());
  expect(hook.result.current.status).toEqual(status); expect(hook.result.current.error).toBeNull(); expect(hook.result.current.checking).toBe(false);
});
it("does not claim readiness after executable validation or active-process rejection", async () => {
  configure.mockResolvedValue({ ok: false, error: { code: "tool_configuration_busy", message: "Stop the active Go run/debugger" } });
  const hook = renderHook(() => useToolchainStatus());
  await waitFor(() => expect(hook.result.current.error).toContain("Stop the active"));
  expect(hook.result.current.status).toBeNull(); expect(query).not.toHaveBeenCalled();
  expect(hook.result.current.error).toContain("Previous native tool paths remain active");
});
it("ignores retired probe results after refresh and unmount", async () => {
  let complete!: (response: unknown) => void; query.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const hook = renderHook(() => useToolchainStatus());
  await waitFor(() => expect(query).toHaveBeenCalledOnce());
  query.mockResolvedValue({ ok: false, error: { message: "current failure" } });
  await act(() => hook.result.current.refresh());
  await act(async () => { complete({ ok: true, data: { go: { available: true } } }); });
  expect(hook.result.current.error).toBe("current failure"); expect(hook.result.current.status).toBeNull();
  let late!: (response: unknown) => void; query.mockImplementation(() => new Promise(resolve => { late = resolve; }));
  const retired = renderHook(() => useToolchainStatus()); await waitFor(() => expect(late).toBeTypeOf("function")); retired.unmount();
  await act(async () => { late({ ok: false, error: { message: "late failure" } }); });
  expect(retired.result.current.error).toBeNull();
});
