import { describe, expect, it } from "vitest";
import type { LensConstruct } from "./lensTypes";
import { ConcurrencyConfidence } from "../../lib/ipc/types";
import {
  MAX_VISIBLE_HINTS_PER_VIEWPORT,
  selectVisiblePredictedConstructs,
  type VisibleLineRange,
} from "./signalDensity";

function makeConstruct(
  line: number,
  column: number,
  confidence: ConcurrencyConfidence
): LensConstruct {
  return {
    kind: "channel",
    line,
    column,
    symbol: null,
    confidence,
  };
}

describe("selectVisiblePredictedConstructs", () => {
  it("caps predicted constructs within viewport range", () => {
    const visibleRange: VisibleLineRange = {
      fromLine: 10,
      toLine: 40,
    };
    const constructs = Array.from({ length: 20 }, (_, index) =>
      makeConstruct(index + 1, 1, ConcurrencyConfidence.Predicted)
    );

    const result = selectVisiblePredictedConstructs({
      constructs,
      visibleRange,
    });

    expect(result).toHaveLength(MAX_VISIBLE_HINTS_PER_VIEWPORT);
    expect(result.every((item) => item.line >= 10 && item.line <= 40)).toBe(true);
  });

  it("returns deterministic ordering by line and column", () => {
    const constructs = [
      makeConstruct(12, 8, ConcurrencyConfidence.Predicted),
      makeConstruct(11, 8, ConcurrencyConfidence.Predicted),
      makeConstruct(12, 2, ConcurrencyConfidence.Predicted),
      makeConstruct(11, 2, ConcurrencyConfidence.Likely),
      makeConstruct(11, 1, ConcurrencyConfidence.Predicted),
    ];

    const result = selectVisiblePredictedConstructs({
      constructs,
      visibleRange: { fromLine: 1, toLine: 30 },
      maxVisible: 10,
    });

    expect(result.map((item) => `${item.line}:${item.column}`)).toEqual([
      "11:1",
      "11:8",
      "12:2",
      "12:8",
    ]);
  });
});
