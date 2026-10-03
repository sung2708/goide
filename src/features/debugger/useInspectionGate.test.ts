import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInspectionGate } from "./useInspectionGate";
describe("inspection execution gate", () => {
  it("hides old values after control acknowledgement until an observed new stop", async () => {
    const { result, rerender } = renderHook(({ token }) => useInspectionGate(token), { initialProps: { token: "old" as string | null } });
    const operation = vi.fn(async () => ({ ok: true, data: null }));
    await act(async () => {
      await result.current.control(operation);
      await result.current.control(operation);
    });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(result.current.token).toBeNull();
    expect(result.current.pending).toBe(true);
    rerender({ token: "new" });
    expect(result.current.token).toBe("new");
    expect(result.current.pending).toBe(false);
  });
  it("restores the same observed stop after an explicit rejected control", async () => {
    const { result } = renderHook(() => useInspectionGate("paused"));
    await act(async () => { await result.current.control(async () => ({ ok: false, data: { stopToken: "paused" }, error: { code: "step_failed", message: "Step rejected" } }), (reply, captured) => reply.data?.stopToken === captured); });
    expect(result.current.token).toBe("paused");
    expect(result.current.pending).toBe(false);
  });
  it("does not restore old values after an unconfirmed failure or lost transport", async () => {
    const { result, rerender } = renderHook(({ token }) => useInspectionGate(token), { initialProps: { token: "first" } });
    await act(async () => { await result.current.control(async () => ({ ok: false, error: { code: "timeout", message: "Outcome unknown" } })); });
    expect(result.current.token).toBeNull();
    rerender({ token: "second" });
    await act(async () => { await expect(result.current.control(async () => { throw new Error("IPC lost"); })).rejects.toThrow("IPC lost"); });
    expect(result.current.token).toBeNull();
    expect(result.current.pending).toBe(true);
    rerender({ token: "third" });
    expect(result.current.token).toBe("third");
  });
});
