import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
export const setFindRanges = StateEffect.define<{ from: number; to: number }[]>();
export const findDecorations = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    if (transaction.docChanged) value = Decoration.none;
    for (const effect of transaction.effects) if (effect.is(setFindRanges)) {
      value = Decoration.set(effect.value.filter(range => range.to > range.from && range.to <= transaction.state.doc.length)
        .map(range => Decoration.mark({ class: "cm-searchMatch" }).range(range.from, range.to)), true);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});
