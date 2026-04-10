import { ConcurrencyConfidence } from "../../lib/ipc/types";
import type { LensConstruct } from "./lensTypes";

export const MAX_VISIBLE_HINTS_PER_VIEWPORT = 6;

export type VisibleLineRange = {
  fromLine: number;
  toLine: number;
};

type SelectVisiblePredictedConstructsArgs = {
  constructs: LensConstruct[];
  visibleRange: VisibleLineRange | null;
  maxVisible?: number;
};

function compareConstructs(a: LensConstruct, b: LensConstruct) {
  if (a.line !== b.line) {
    return a.line - b.line;
  }

  if (a.column !== b.column) {
    return a.column - b.column;
  }

  return (a.symbol ?? "").localeCompare(b.symbol ?? "");
}

export function selectVisiblePredictedConstructs({
  constructs,
  visibleRange,
  maxVisible = MAX_VISIBLE_HINTS_PER_VIEWPORT,
}: SelectVisiblePredictedConstructsArgs): LensConstruct[] {
  const boundedMaxVisible = Math.max(0, maxVisible);

  return constructs
    .filter(
      (construct) =>
        construct.confidence === ConcurrencyConfidence.Predicted &&
        (visibleRange === null ||
          (construct.line >= visibleRange.fromLine &&
            construct.line <= visibleRange.toLine))
    )
    .sort(compareConstructs)
    .slice(0, boundedMaxVisible);
}
