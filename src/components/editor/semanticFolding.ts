import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { codeFolding, foldGutter, foldService } from "@codemirror/language";
import type { SemanticAnalysisResult } from "../../features/semantics/types";

export const setSemanticAnalysisEffect = StateEffect.define<SemanticAnalysisResult | null>();

export const semanticAnalysisField = StateField.define<SemanticAnalysisResult | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setSemanticAnalysisEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

function findFold(
  result: SemanticAnalysisResult | null,
  lineStart: number,
  lineEnd: number
) {
  if (!result) {
    return null;
  }

  for (const fold of result.folds) {
    if (fold.from >= lineStart && fold.from <= lineEnd && fold.to > fold.from) {
      return {
        from: fold.from,
        to: fold.to,
      };
    }
  }

  return null;
}

export const semanticFoldingExtension: Extension = [
  semanticAnalysisField,
  codeFolding(),
  foldGutter({
    foldingChanged(update) {
      return update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(setSemanticAnalysisEffect))
      );
    },
  }),
  foldService.of((state, lineStart, lineEnd) => {
    const result = state.field(semanticAnalysisField, false) ?? null;
    return findFold(result, lineStart, lineEnd);
  }),
];
