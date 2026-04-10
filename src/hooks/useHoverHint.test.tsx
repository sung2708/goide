import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LensConstruct } from "../features/concurrency/lensTypes";
import { ConcurrencyConfidence } from "../lib/ipc/types";
import { useHoverHint } from "./useHoverHint";

function makeConstruct(
  line: number,
  confidence: ConcurrencyConfidence
): LensConstruct {
  return {
    kind: "channel",
    line,
    column: 1,
    symbol: null,
    confidence,
  };
}

describe("useHoverHint", () => {
  it("returns active hint only for predicted construct on hovered line", () => {
    const { result } = renderHook(() =>
      useHoverHint({
        workspacePath: "C:/repo",
        activeFilePath: "main.go",
        detectedConstructs: [
          makeConstruct(2, ConcurrencyConfidence.Likely),
          makeConstruct(3, ConcurrencyConfidence.Predicted),
        ],
      })
    );

    act(() => {
      result.current.setHoveredLine(2);
    });
    expect(result.current.activeHint).toBeNull();
    expect(result.current.activeHintLine).toBeNull();

    act(() => {
      result.current.setHoveredLine(3);
    });
    expect(result.current.activeHint?.line).toBe(3);
    expect(result.current.activeHint?.confidence).toBe(
      ConcurrencyConfidence.Predicted
    );
    expect(result.current.activeHintLine).toBe(3);
  });

  it("clears hovered line when active file changes", () => {
    const { result, rerender } = renderHook(
      ({ activeFilePath }) =>
        useHoverHint({
          workspacePath: "C:/repo",
          activeFilePath,
          detectedConstructs: [makeConstruct(5, ConcurrencyConfidence.Predicted)],
        }),
      { initialProps: { activeFilePath: "a.go" } }
    );

    act(() => {
      result.current.setHoveredLine(5);
    });
    expect(result.current.activeHintLine).toBe(5);

    rerender({ activeFilePath: "b.go" });
    expect(result.current.hoveredLine).toBeNull();
    expect(result.current.activeHint).toBeNull();
    expect(result.current.activeHintLine).toBeNull();
  });
});

