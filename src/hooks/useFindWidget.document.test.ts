import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { history, undo } from "@codemirror/commands";
import { search } from "@codemirror/search";
import { findDecorations } from "../features/search/findDecorations";
import { useFindWidget } from "./useFindWidget";
it("replaces Unicode literal dollar/backslash text in one isolated undo transaction", () => {
  const original = "😀 tên tên\nlast";
  const view = { state: EditorState.create({ doc: original, extensions: [history(), search(), findDecorations] }), focus: vi.fn(),
    dispatch(_spec: TransactionSpec) {} };
  view.dispatch = spec => { view.state = view.state.update(spec).state; };
  const ref = { current: view as unknown as EditorView };
  const { result } = renderHook(() => useFindWidget(ref));
  act(() => result.current.open()); act(() => result.current.setQuery("tên"));
  expect(result.current.matchInfo.total).toBe(2);
  act(() => result.current.setReplaceText("$1\\"));
  act(() => result.current.handleReplaceAll());
  expect(view.state.doc.toString()).toBe("😀 $1\\ $1\\\nlast");
  act(() => { expect(undo(ref.current)).toBe(true); });
  expect(view.state.doc.toString()).toBe(original);
});

it("rescans ordinary document edits without selecting a match under the user's cursor", () => {
  const view = { state: EditorState.create({ doc: "x x end", extensions: [search(), findDecorations] }), focus: vi.fn(), dispatch(_spec: TransactionSpec) {} };
  view.dispatch = spec => { view.state = view.state.update(spec).state; };
  const { result } = renderHook(() => useFindWidget({ current: view as unknown as EditorView }));
  act(() => result.current.open()); act(() => result.current.setQuery("x"));
  act(() => { view.dispatch({ changes: { from: 7, insert: "!" }, selection: { anchor: 8 } }); result.current.documentChanged(); });
  expect(view.state.selection.main.head).toBe(8); expect(view.state.selection.main.empty).toBe(true);
  expect(result.current.matchInfo.total).toBe(2);
});
