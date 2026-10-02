import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useGitDocumentTransaction } from "./useGitDocumentTransaction";

describe("Git document transaction", () => {
  const setup = () => {
    const params = { root: { current: "C:/repo" as string | null }, lock: { current: false }, mutation: { current: false }, preserve: vi.fn().mockResolvedValue(true), isPreserved: vi.fn().mockReturnValue(true), setBusy: vi.fn() };
    const hook = renderHook(() => useGitDocumentTransaction(params));
    return { params, run: hook.result.current };
  };
  it("unstage/commit never persist unsaved working buffers", async () => {
    const { params, run } = setup();
    await run(async () => { expect(params.mutation.current).toBe(true); });
    expect(params.preserve).not.toHaveBeenCalled(); expect(params.lock.current).toBe(false);
  });
  it("stage preserves the buffer and blocks failed saves or late edits", async () => {
    const { params, run } = setup(); const operation = vi.fn();
    params.preserve.mockResolvedValue(false);
    await expect(run(operation, true)).rejects.toThrow(/save failed/i);
    expect(operation).not.toHaveBeenCalled(); expect(params.lock.current).toBe(false);
    params.preserve.mockResolvedValue(true); params.isPreserved.mockReturnValue(false);
    await expect(run(operation, true)).rejects.toThrow(/buffer changed/i);
    expect(operation).not.toHaveBeenCalled();
  });
  it("shares transition ownership and releases it after IPC failure", async () => {
    const { params, run } = setup(); params.lock.current = true;
    await expect(run(vi.fn())).rejects.toThrow(/wait/i);
    params.lock.current = false;
    await expect(run(async () => { throw new Error("hook failed"); })).rejects.toThrow("hook failed");
    expect(params.lock.current).toBe(false); expect(params.mutation.current).toBe(false);
  });
});
