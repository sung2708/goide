import { afterEach, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { entryActionLenses, type EntryActionContext } from "./entryActionLenses";
import { semanticAnalysisField, setSemanticAnalysisEffect } from "./semanticFolding";
import type { SemanticAnalysisResult } from "../../features/semantics/types";
let view: EditorView | undefined;
afterEach(() => { view?.destroy(); view = undefined; document.body.replaceChildren(); });
function setup(path = "main.go") {
  const source = "package main\nfunc main() {}\n";
  const context: EntryActionContext = { key: "first:main.go", path, enabled: true, execute: vi.fn() };
  view = new EditorView({ state: EditorState.create({ doc: source, extensions: [semanticAnalysisField, entryActionLenses(() => context)] }), parent: document.body });
  const result: SemanticAnalysisResult = { filePath: path, version: 1, sourceText: source, symbols: [], folds: [], selectionRanges: [], entryActions: [{ name: "main", kind: "main", range: { from: 13, to: source.length } }, { name: "TestOne", kind: "test", range: { from: 13, to: source.length } }] };
  const publish = () => view!.dispatch({ effects: setSemanticAnalysisEffect.of(result) });
  publish(); return { context, result, source, publish };
}
it("renders lightweight Run/Debug controls with the exact source snapshot", () => {
  const { context, source } = setup();
  const buttons = [...document.querySelectorAll("button")]; expect(buttons.map(button => button.textContent)).toEqual(["Run", "Debug"]);
  buttons[0].click(); expect(context.execute).toHaveBeenCalledWith(expect.objectContaining({ kind: "main" }), "run", source);
  expect(document.querySelector(".cm-entry-actions")?.closest(".cm-line")).not.toBeNull();
  expect(view!.state.doc.toString()).toBe(source);
});
it("rejects stale widgets across edits, workspace changes and pending execution", () => {
  const { context, publish } = setup(); const button = document.querySelector("button")!;
  context.enabled = false; button.click(); expect(context.execute).not.toHaveBeenCalled();
  context.enabled = true; context.key = "second:main.go"; button.click(); expect(context.execute).not.toHaveBeenCalled();
  publish(); const newer = document.querySelector("button")!;
  view!.dispatch({ changes: { from: 0, insert: "// changed\n" } });
  expect(document.querySelector("button")).toBeNull(); newer.click(); expect(context.execute).not.toHaveBeenCalled();
  publish(); expect(document.querySelector("button")).toBeNull();
});
it("offers Test controls only in _test.go and rejects delayed analysis from another file", () => {
  const { result, context, publish } = setup("worker_test.go");
  expect([...document.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Run Test", "Debug Test"]);
  context.enabled = false; publish(); expect(document.querySelector("button")!.disabled).toBe(true);
  result.filePath = "elsewhere_test.go"; publish(); expect(document.querySelector("button")).toBeNull();
});
