import { EditorSelection, EditorState } from "@codemirror/state";
import { ExternalChange } from "@uiw/react-codemirror";
import type { EditorView } from "@codemirror/view";

/** Apply a reviewed controlled value before the wrapper can defer it behind a
 * typing timer and later overwrite a newer keystroke with that old value. */
export function synchronizeControlledDocument(view: EditorView, text: string) {
  if (view.state.doc.toString() === text) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, annotations: ExternalChange.of(true) });
}

/** Controlled whole-document updates (including reviewed formatting) retain
 * the cursor's line/column rather than mapping every cursor to document end. */
export const preserveExternalSelection = EditorState.transactionFilter.of(transaction => {
  if (!transaction.docChanged || transaction.selection || !transaction.annotation(ExternalChange)) return transaction;
  const before = transaction.startState.doc.toString();
  const after = transaction.newDoc.toString();
  const onlyWhitespaceChanged = before.replace(/\s/g, "") === after.replace(/\s/g, "");
  const mapped = new Map<number, number>();
  const mapPosition = (offset: number) => {
    if (mapped.has(offset)) return mapped.get(offset)!;
    if (onlyWhitespaceChanged) {
      if (offset === before.length) return after.length;
      const rank = before.slice(0, offset).replace(/\s/g, "").length;
      let seen = 0, previous = -1;
      for (let index = 0; index < after.length; index++) {
        if (/\s/.test(after[index])) continue;
        if (seen === rank) {
          const gap = /^\s*/.exec(before.slice(offset))![0].length;
          const result = Math.max(previous + 1, index - gap);
          mapped.set(offset, result); return result;
        }
        previous = index; seen++;
      }
      return after.length;
    }
    const previous = transaction.startState.doc.lineAt(offset);
    const next = transaction.newDoc.line(Math.min(previous.number, transaction.newDoc.lines));
    return next.from + Math.min(offset - previous.from, next.length);
  };
  const selection = EditorSelection.create(transaction.startState.selection.ranges.map(range => EditorSelection.range(mapPosition(range.anchor), mapPosition(range.head))), transaction.startState.selection.mainIndex);
  return [transaction, { selection, sequential: true }];
});
