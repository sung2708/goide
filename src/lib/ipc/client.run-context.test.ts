import { afterEach, expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
import { stopCurrentRun } from "./client";
afterEach(() => { delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__; vi.clearAllMocks(); });
it("requires desktop ownership and forwards the exact workspace/UUID to Stop", async () => {
  const context = { workspaceRoot: "D:/workspace", runId: "2c95c5d8-cdb7-4c6f-ac4c-b0d5b18d507c" };
  expect((await stopCurrentRun(context)).error?.code).toBe("run_native_required"); expect(invoke).not.toHaveBeenCalled();
  (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  invoke.mockResolvedValue({ ok: true }); expect((await stopCurrentRun(context)).ok).toBe(true);
  expect(invoke).toHaveBeenCalledWith("stop_current_run", { context });
});
