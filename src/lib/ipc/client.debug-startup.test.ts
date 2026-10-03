import { afterEach, expect, it, vi } from "vitest";
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
import { startDebugSession, activateScopedDeepTrace, cancelDebuggerStartup } from "./client";
afterEach(() => { delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__; vi.clearAllMocks(); });
it("never invents debugger startup in preview and forwards the owned UUID natively", async () => {
  const context = { workspaceRoot: "D:/workspace", requestId: "dc54f801-1c7f-4b46-876d-bcfb57cbb132" };
  const request = { ...context, relativePath: "main.go" };
  const scoped = { ...request, line: 3, column: 1, constructKind: "channel" as const };
  expect((await startDebugSession(request)).ok).toBe(false);
  expect((await activateScopedDeepTrace(scoped)).ok).toBe(false);
  expect((await cancelDebuggerStartup(context)).ok).toBe(false); expect(invoke).not.toHaveBeenCalled();
  (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  invoke.mockResolvedValue({ ok: true }); await startDebugSession(request); await activateScopedDeepTrace(scoped); await cancelDebuggerStartup(context);
  expect(invoke.mock.calls).toEqual([["start_debug_session", { request }], ["activate_scoped_deep_trace", { request: scoped }], ["cancel_debugger_startup", { request: context }]]);
});
