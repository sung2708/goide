import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DocumentSession } from "../documents/DocumentSession";
import { useEditorSignature } from "./useEditorSignature";
const queryMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, data: true }));
vi.mock("../../lib/ipc/client", () => ({ queryWorkspaceSignature: queryMock, cancelLanguageRequest: cancelMock }));

it("keeps its callback stable while capturing current buffers and cancelling stale signature work", async () => {
  const session = new DocumentSession(); session.reset("C:/workspace"); const main = session.open("main.go", "package main\n");
  session.open("helper.go", "package main\nconst Unsaved = 1\n"); session.activate(main.id);
  let resolve!: (value: unknown) => void;
  queryMock.mockImplementation(() => new Promise(done => { resolve = done; }));
  const hook = renderHook(({ snapshot }) => useEditorSignature(snapshot), { initialProps: { snapshot: session.snapshot() } });
  const callback = hook.result.current;
  const controller = new AbortController();
  const pending = callback({ offset: 3, content: "F( ", signal: controller.signal });
  expect(queryMock).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String), column: 4, buffers: [{ path: "main.go", content: "F( " }, { path: "helper.go", content: "package main\nconst Unsaved = 1\n" }] }));
  session.edit(main.id, "package edited\n"); hook.rerender({ snapshot: session.snapshot() });
  expect(hook.result.current).toBe(callback);
  resolve({ ok: true, data: { signatures: [], activeSignature: 0 } }); expect(await pending).toBeNull();
  const next = callback({ offset: 3, content: "G( ", signal: controller.signal });
  act(() => controller.abort());
  expect(cancelMock).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: "C:/workspace" }));
  resolve({ ok: false, error: { message: "obsolete" } }); expect(await next).toBeNull();
});

it("preserves genuine tooling failures and empty signature responses", async () => {
  const session = new DocumentSession(); session.reset("C:/workspace"); session.open("main.go", "package main\n");
  const hook = renderHook(() => useEditorSignature(session.snapshot()));
  queryMock.mockResolvedValue({ ok: false, error: { message: "gopls missing" } });
  expect(await hook.result.current({ offset: 2, content: "F(", signal: new AbortController().signal })).toEqual({ error: "gopls missing" });
  queryMock.mockResolvedValue({ ok: true, data: null });
  expect(await hook.result.current({ offset: 2, content: "F(", signal: new AbortController().signal })).toBeNull();
});
