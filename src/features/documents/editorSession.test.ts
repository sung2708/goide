import { EditorState } from "@codemirror/state";
import { history, undo, undoDepth } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { expect, it } from "vitest";
import { captureEditorSession, editorSessionFields, initialEditorSession } from "./editorSession";
it("round trips real CodeMirror history and selection while keeping another document independent", () => {
  let state = EditorState.create({ doc: "original", extensions: [history()] });
  state = state.update({ changes: { from: 0, to: state.doc.length, insert: "edited" }, selection: { anchor: 3 } }).state;
  const session = captureEditorSession({ state, scrollDOM: { scrollTop: 120, scrollLeft: 8 } } as unknown as EditorView);
  const initial = initialEditorSession(session, "edited")!;
  state = EditorState.fromJSON(initial.json, { extensions: [history()] }, editorSessionFields);
  expect(state.selection.main.head).toBe(3); expect(session.scrollTop).toBe(120); expect(undoDepth(state)).toBe(1);
  const other = EditorState.create({ doc: "other", extensions: [history()] }); expect(undoDepth(other)).toBe(0);
  expect(undo({ state, dispatch: transaction => { state = transaction.state; } })).toBe(true); expect(state.doc.toString()).toBe("original");
  expect(other.doc.toString()).toBe("other");
});
it("does not restore old undo state over externally reloaded content", () => {
  const state = EditorState.create({ doc: "old", extensions: [history()] });
  const session = captureEditorSession({ state, scrollDOM: { scrollTop: 0, scrollLeft: 0 } } as unknown as EditorView);
  expect(initialEditorSession(session, "external change")).toBeUndefined();
});
