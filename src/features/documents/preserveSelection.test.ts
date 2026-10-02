import { EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { ExternalChange } from "@uiw/react-codemirror";
import { expect, it } from "vitest";
import { preserveExternalSelection, synchronizeControlledDocument } from "./preserveSelection";
import type { EditorView } from "@codemirror/view";

it("retains cursor line and column through a controlled format and supports one-step undo", () => {
  const before = "package main\nfunc main( ){println(1)}\n";
  const after = "package main\n\nfunc main() { println(1) }\n";
  const anchor = before.indexOf("println") + 3;
  let state = EditorState.create({ doc: before, selection: { anchor }, extensions: [history(), preserveExternalSelection] });
  state = state.update({ changes: { from: 0, to: before.length, insert: after }, annotations: ExternalChange.of(true) }).state;
  expect(state.selection.main.head).toBe(after.indexOf("println") + 3);
  expect(undo({ state, dispatch: transaction => { state = transaction.state; } })).toBe(true);
  expect(state.doc.toString()).toBe(before); expect(state.selection.main.head).toBe(anchor);
});

it("clamps a retained cursor to a shorter line while honoring explicit navigation", () => {
  let state = EditorState.create({ doc: "first\nlong line", selection: { anchor: 13 }, extensions: [preserveExternalSelection] });
  state = state.update({ changes: { from: 0, to: state.doc.length, insert: "first\nx" }, annotations: ExternalChange.of(true) }).state;
  expect(state.selection.main.head).toBe(7);
  state = state.update({ changes: { from: 0, to: state.doc.length, insert: "expanded document" }, selection: { anchor: 2 }, annotations: ExternalChange.of(true) }).state;
  expect(state.selection.main.head).toBe(2);
});

it("synchronizes a reviewed value immediately so a following keystroke edits the new text", () => {
  let state = EditorState.create({ doc: "old", extensions: [history(), preserveExternalSelection] });
  const view = { get state() { return state; }, dispatch: (spec: Parameters<EditorState["update"]>[0]) => { state = state.update(spec).state; } } as unknown as EditorView;
  synchronizeControlledDocument(view, "formatted");
  expect(state.doc.toString()).toBe("formatted");
  state = state.update({ changes: { from: state.doc.length, insert: "+new typing" } }).state;
  expect(state.doc.toString()).toBe("formatted+new typing");
});
