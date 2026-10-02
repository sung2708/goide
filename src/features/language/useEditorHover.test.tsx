import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DocumentSession } from "../documents/DocumentSession";
import { useEditorHover } from "./useEditorHover";
const queryMock = vi.hoisted(() => vi.fn());
const cancelMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, data: true }));
vi.mock("../../lib/ipc/client", () => ({ queryWorkspaceLanguage: queryMock, cancelLanguageRequest: cancelMock }));

it("sends the current editor text and all other unsaved Go tabs with UTF-16 positions", async () => {
  const session = new DocumentSession(); session.reset("C:/workspace");
  const main = session.open("main.go", "package old\n");
  session.open("helper.go", "package main\nconst Helper = 1\n"); session.activate(main.id);
  queryMock.mockResolvedValue({ ok: true, data: { text: "const Helper int", locations: [], outsideWorkspace: 0 } });
  const hook = renderHook(() => useEditorHover(session.snapshot()));
  const result = await hook.result.current({ offset: 4, content: "😀 Helper", signal: new AbortController().signal });
  expect(result).toEqual({ text: "const Helper int" });
  expect(queryMock).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceRoot: "C:/workspace", relativePath: "main.go", kind: "hover", line: 1, column: 5, buffers: [{ path: "main.go", content: "😀 Helper" }, { path: "helper.go", content: "package main\nconst Helper = 1\n" }] }));
});

it("cancels pointer requests and rejects results belonging to an earlier document snapshot", async () => {
  const session = new DocumentSession(); session.reset("C:/workspace"); const main = session.open("main.go", "package main\n");
  let resolve!: (value: unknown) => void;
  queryMock.mockImplementation(() => new Promise(done => { resolve = done; }));
  const hook = renderHook(({ snapshot }) => useEditorHover(snapshot), { initialProps: { snapshot: session.snapshot() } });
  const controller = new AbortController();
  const pending = hook.result.current({ offset: 2, content: main.text, signal: controller.signal });
  act(() => controller.abort());
  expect(cancelMock).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: "C:/workspace", requestId: expect.any(String) }));
  resolve({ ok: true, data: { text: "obsolete" } }); expect(await pending).toBeNull();
  const next = hook.result.current({ offset: 2, content: main.text, signal: new AbortController().signal });
  session.edit(main.id, "package edited\n"); hook.rerender({ snapshot: session.snapshot() });
  resolve({ ok: false, error: { message: "old error" } }); expect(await next).toBeNull();
});
