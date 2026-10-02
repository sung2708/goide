import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DocumentSession } from "../documents/DocumentSession";
import { useLanguageCancellation } from "./useLanguageCancellation";

const cancelMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, data: true }));
vi.mock("../../lib/ipc/client", () => ({ cancelLanguageRequest: cancelMock }));

it("cancels captured identities on supersession and workspace changes without clearing newer work", () => {
  cancelMock.mockClear();
  const session = new DocumentSession();
  session.reset("C:/first");
  session.open("main.go", "package main\n");
  const hook = renderHook(({ snapshot }) => useLanguageCancellation(snapshot), {
    initialProps: { snapshot: session.snapshot() },
  });
  let first!: ReturnType<typeof hook.result.current.begin>;
  let second!: typeof first;
  act(() => { first = hook.result.current.begin("C:/first"); });
  act(() => { second = hook.result.current.begin("C:/first"); });
  expect(first.requestId).not.toBe(second.requestId);
  expect(cancelMock).toHaveBeenCalledExactlyOnceWith(first);
  act(() => hook.result.current.cancel(first.requestId));
  expect(cancelMock).toHaveBeenCalledTimes(1);
  act(() => hook.result.current.complete(first.requestId));
  session.reset("C:/second");
  hook.rerender({ snapshot: session.snapshot() });
  expect(cancelMock).toHaveBeenLastCalledWith(second);
  let third!: typeof first;
  act(() => { third = hook.result.current.begin("C:/second"); });
  hook.unmount();
  expect(cancelMock).toHaveBeenLastCalledWith(third);
  expect(cancelMock).toHaveBeenCalledTimes(3);
});

it("does not cancel completed work when the component closes", () => {
  cancelMock.mockClear();
  const session = new DocumentSession();
  session.reset("C:/workspace");
  const hook = renderHook(() => useLanguageCancellation(session.snapshot()));
  act(() => {
    const request = hook.result.current.begin("C:/workspace");
    hook.result.current.complete(request.requestId);
  });
  hook.unmount();
  expect(cancelMock).not.toHaveBeenCalled();
});

it("reports native cancellation failures with their captured workspace", async () => {
  cancelMock.mockResolvedValueOnce({ ok: false, error: { message: "registry unavailable" } });
  const report = vi.fn();
  const session = new DocumentSession();
  session.reset("C:/original");
  const hook = renderHook(() => useLanguageCancellation(session.snapshot(), report));
  await act(async () => {
    hook.result.current.begin("C:/original");
    hook.result.current.cancel();
  });
  expect(report).toHaveBeenCalledWith(expect.stringContaining("C:/original: registry unavailable"));
});

it("does not cancel a newly captured request when an earlier render catches up", () => {
  cancelMock.mockClear(); const next = { root: "repo", version: 2 };
  const hook = renderHook(({ snapshot }) => useLanguageCancellation(snapshot), { initialProps: { snapshot: { root: "repo", version: 1 } } });
  act(() => { hook.result.current.begin("repo", next); }); hook.rerender({ snapshot: next });
  expect(cancelMock).not.toHaveBeenCalled();
  hook.rerender({ snapshot: { root: "repo", version: 3 } }); expect(cancelMock).toHaveBeenCalledOnce();
});