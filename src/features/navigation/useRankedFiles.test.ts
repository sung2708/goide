import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRankedFiles } from "./useRankedFiles";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("coalesces typing, posts the index once, ignores stale results and retires the worker", () => {
  let owner!: { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn>; onmessage: ((event: { data: { id: number; files: string[] } }) => void) | null };
  vi.stubGlobal("Worker", class { postMessage = vi.fn(); terminate = vi.fn(); onmessage = null; constructor() { owner = this; } });
  const files = ["main.go", "model.go"], recent: string[] = [];
  const hook = renderHook(({ query }) => useRankedFiles(files, query, recent), { initialProps: { query: "m" } });
  const first = owner.postMessage.mock.calls[0][0]; expect(first.files).toEqual(files);
  hook.rerender({ query: "ma" }); hook.rerender({ query: "main" }); expect(owner.postMessage).toHaveBeenCalledTimes(1);
  act(() => owner.onmessage!({ data: { id: first.id, files: ["model.go"] } }));
  expect(hook.result.current.files).toEqual([]); expect(owner.postMessage).toHaveBeenCalledTimes(2);
  const latest = owner.postMessage.mock.calls[1][0]; expect(latest.query).toBe("main"); expect(latest.files).toBeUndefined();
  act(() => owner.onmessage!({ data: { id: latest.id, files: ["main.go"] } })); expect(hook.result.current.files).toEqual(["main.go"]);
  hook.unmount(); expect(owner.terminate).toHaveBeenCalledOnce();
});
