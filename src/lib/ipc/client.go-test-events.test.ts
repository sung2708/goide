import { beforeEach, expect, it, vi } from "vitest";
import type { GoTestEvent } from "../../features/goTests/liveOutput";
const { listen } = vi.hoisted(() => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));
import { subscribeGoTestOutput } from "./client";
const request = { workspaceRoot: "D:/opened", relativeDirectory: ".", requestId: "owned", target: "package" as const, testName: null };
beforeEach(() => { listen.mockReset(); delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__; });
it("requires desktop events and forwards only the subscribed workspace/request", async () => {
  const receive = vi.fn(); await expect(subscribeGoTestOutput(request, receive)).rejects.toThrow("desktop app"); expect(listen).not.toHaveBeenCalled();
  (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  let deliver!: (event: { payload: GoTestEvent }) => void; const unlisten = vi.fn();
  listen.mockImplementation(async (_name, handler) => { deliver = handler; return unlisten; });
  expect(await subscribeGoTestOutput(request, receive)).toBe(unlisten);
  const event: GoTestEvent = { ...request, sequence: 1, kind: "output", stream: "stdout", bytes: [65] };
  deliver({ payload: { ...event, requestId: "replaced" } }); deliver({ payload: { ...event, workspaceRoot: "D:/foreign" } });
  expect(receive).not.toHaveBeenCalled(); deliver({ payload: event }); expect(receive).toHaveBeenCalledWith(event);
});
