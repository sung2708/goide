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
    scopeKey: null,
    confidence,
  };
}

describe("useHoverHint", () => {
  it("returns active hint only for predicted construct on hovered line", () => {
    const { result } = renderHook(() =>
      useHoverHint({
        workspacePath: "C:/repo",
        activeFilePath: "main.go",
        runtimeAvailability: "unavailable",
        visibleRange: { fromLine: 1, toLine: 40 },
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
          runtimeAvailability: "unavailable",
          visibleRange: { fromLine: 1, toLine: 40 },
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

  it("suppresses active hint when hovered line is outside capped viewport set", () => {
    const constructs: LensConstruct[] = [
      makeConstruct(2, ConcurrencyConfidence.Predicted),
      makeConstruct(4, ConcurrencyConfidence.Predicted),
      makeConstruct(6, ConcurrencyConfidence.Predicted),
      makeConstruct(8, ConcurrencyConfidence.Predicted),
      makeConstruct(10, ConcurrencyConfidence.Predicted),
      makeConstruct(12, ConcurrencyConfidence.Predicted),
      makeConstruct(14, ConcurrencyConfidence.Predicted),
    ];

    const { result } = renderHook(() =>
      useHoverHint({
        workspacePath: "C:/repo",
        activeFilePath: "main.go",
        runtimeAvailability: "unavailable",
        visibleRange: { fromLine: 1, toLine: 30 },
        detectedConstructs: constructs,
      })
    );

    act(() => {
      result.current.setHoveredLine(14);
    });

    expect(result.current.activeHint).toBeNull();
    expect(result.current.activeHintLine).toBeNull();
  });

  it("keeps predicted fallback hints active when runtime is unavailable", () => {
    const { result } = renderHook(() =>
      useHoverHint({
        workspacePath: "C:/repo",
        activeFilePath: "main.go",
        runtimeAvailability: "unavailable",
        visibleRange: { fromLine: 1, toLine: 20 },
        detectedConstructs: [makeConstruct(7, ConcurrencyConfidence.Predicted)],
      })
    );

    act(() => {
      result.current.setHoveredLine(7);
    });

    expect(result.current.activeHint?.line).toBe(7);
    expect(result.current.activeHint?.confidence).toBe(
      ConcurrencyConfidence.Predicted
    );
  });

  it("supports keyboard/selection reveal when no hover line is active", () => {
    const { result } = renderHook(() =>
      useHoverHint({
        workspacePath: "C:/repo",
        activeFilePath: "main.go",
        runtimeAvailability: "unavailable",
        selectedLine: 9,
        visibleRange: { fromLine: 1, toLine: 20 },
        detectedConstructs: [makeConstruct(9, ConcurrencyConfidence.Predicted)],
      })
    );

    expect(result.current.activeHint?.line).toBe(9);
    expect(result.current.activeHintLine).toBe(9);
  });

  it("keeps predicted fallback hints active when runtime is degraded", () => {
    const { result } = renderHook(() =>
      useHoverHint({
        workspacePath: "C:/repo",
        activeFilePath: "main.go",
        runtimeAvailability: "degraded",
        visibleRange: { fromLine: 1, toLine: 20 },
        detectedConstructs: [makeConstruct(11, ConcurrencyConfidence.Predicted)],
      })
    );

    act(() => {
      result.current.setHoveredLine(11);
    });

    expect(result.current.activeHint?.line).toBe(11);
    expect(result.current.activeHint?.confidence).toBe(
      ConcurrencyConfidence.Predicted
    );
  });
});
