import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type * as Monaco from "monaco-editor";
const tasks = vi.hoisted(() => ({ pending: [] as any[] }));
vi.mock("../search/regexSearchClient", () => ({ startRegexSearch: vi.fn(request => {
  let resolve!: (value: unknown) => void, reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  const task = { request, promise, resolve, reject, cancel: vi.fn() }; tasks.pending.push(task); return task;
}) }));
afterEach(() => { cleanup(); tasks.pending.length = 0; });
import { useMonacoFind } from "./useMonacoFind";
function fixture() {
  let version = 1, readOnly = false;
  const model = { getVersionId: () => version, getValue: () => "one one", isDisposed: () => false, getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }), getOffsetAt: (pos: any) => pos.column - 1 };
  const marks = { set: vi.fn(), clear: vi.fn() };
  const editor = { getModel: () => model, getPosition: () => ({ lineNumber: 1, column: 1 }), getSelection: () => null, setSelection: vi.fn(), createDecorationsCollection: () => marks, getRawOptions: () => ({ readOnly }), pushUndoStop: vi.fn(), executeEdits: vi.fn(), focus: vi.fn(), revealRangeInCenter: vi.fn() };
  const ref = { current: editor as unknown as Monaco.editor.IStandaloneCodeEditor };
  const hook = renderHook(() => useMonacoFind(ref));
  act(() => { hook.result.current.open(); hook.result.current.setQuery("one"); });
  return { ...hook, editor, marks, change: () => version++, readonly: () => { readOnly = true; } };
}
const report = { matches: [{ from: 0, to: 3, replacement: "two" }, { from: 4, to: 7, replacement: "two" }], limited: false };
it("replaces all in one undo group and does not move the cursor on an ordinary rescan", async () => {
  const f = fixture(); await act(async () => tasks.pending[0].resolve(report));
  expect(f.editor.setSelection).toHaveBeenCalledTimes(1);
  act(() => f.result.current.handleReplaceAll());
  expect(f.editor.executeEdits).toHaveBeenCalledWith("goro.find.replace", expect.arrayContaining([expect.objectContaining({ text: "two" })]));
  expect(f.editor.pushUndoStop).toHaveBeenCalledTimes(2);
  await act(async () => tasks.pending[tasks.pending.length - 1].resolve(report));
  expect(f.editor.setSelection).toHaveBeenCalledTimes(1);
});
it("rejects stale results after edits and cancels pending searches on close", async () => {
  const f = fixture(); f.change(); await act(async () => tasks.pending[0].resolve(report));
  expect(f.marks.set).not.toHaveBeenCalled();
  act(() => f.result.current.documentChanged()); const task = tasks.pending[tasks.pending.length - 1];
  act(() => f.result.current.close()); expect(task.cancel).toHaveBeenCalled();
  await act(async () => task.resolve(report)); expect(f.editor.executeEdits).not.toHaveBeenCalled();
});
it("retains valid highlights on invalid regex while blocking replacement", async () => {
  const f = fixture(); await act(async () => tasks.pending[0].resolve(report));
  act(() => { f.result.current.toggleRegex(); f.result.current.setQuery("["); });
  await act(async () => tasks.pending[tasks.pending.length - 1].reject(new Error("Invalid regex")));
  await waitFor(() => expect(f.result.current.error).toBe("Invalid regex"));
  expect(f.marks.clear).not.toHaveBeenCalled(); act(() => f.result.current.handleReplaceAll()); expect(f.editor.executeEdits).not.toHaveBeenCalled();
});
it.each(["readonly", "limit"])("blocks replacement for %s", async mode => {
  const f = fixture(); if (mode === "readonly") f.readonly();
  await act(async () => tasks.pending[0].resolve({ ...report, limited: mode === "limit" }));
  act(() => f.result.current.handleReplaceAll()); expect(f.editor.executeEdits).not.toHaveBeenCalled();
});
