import { useEffect, useMemo, useState } from "react";
import { ConcurrencyConfidence } from "../lib/ipc/types";
import type { LensConstruct, LensHoverHint } from "../features/concurrency/lensTypes";
import {
  selectVisiblePredictedConstructs,
  type VisibleLineRange,
} from "../features/concurrency/signalDensity";

type UseHoverHintArgs = {
  workspacePath: string | null;
  activeFilePath: string | null;
  runtimeAvailability: "available" | "unavailable" | "degraded";
  selectedLine?: number | null;
  visibleRange?: VisibleLineRange | null;
  detectedConstructs: LensConstruct[];
};

type UseHoverHintResult = {
  hoveredLine: number | null;
  activeHint: LensHoverHint | null;
  activeHintLine: number | null;
  setHoveredLine: (line: number | null) => void;
};

export function useHoverHint({
  workspacePath,
  activeFilePath,
  runtimeAvailability,
  selectedLine = null,
  visibleRange = null,
  detectedConstructs,
}: UseHoverHintArgs): UseHoverHintResult {
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  useEffect(() => {
    setHoveredLine(null);
  }, [workspacePath, activeFilePath]);

  const visiblePredictedConstructs = useMemo(
    () =>
      selectVisiblePredictedConstructs({
        constructs: detectedConstructs,
        visibleRange,
      }),
    [detectedConstructs, visibleRange]
  );
  const predictedByLine = useMemo(() => {
    const index = new Map<number, LensConstruct>();
    for (const construct of visiblePredictedConstructs) {
      if (construct.confidence !== ConcurrencyConfidence.Predicted) {
        continue;
      }
      const existing = index.get(construct.line);
      if (!existing || construct.column < existing.column) {
        index.set(construct.line, construct);
      }
    }
    return index;
  }, [visiblePredictedConstructs]);

  const interactionLine = hoveredLine ?? selectedLine;

  const activeHint = useMemo<LensHoverHint | null>(() => {
    if (!workspacePath || !activeFilePath || interactionLine === null) {
      return null;
    }

    // Explicitly consume runtime availability so degraded-mode fallback is part
    // of the hint pipeline contract even when only predicted hints are present.
    if (
      runtimeAvailability !== "available" &&
      runtimeAvailability !== "unavailable" &&
      runtimeAvailability !== "degraded"
    ) {
      return null;
    }

    const match = predictedByLine.get(interactionLine);
    if (!match) {
      return null;
    }

    return {
      kind: match.kind,
      line: match.line,
      column: match.column,
      symbol: match.symbol,
      scopeKey: match.scopeKey,
      confidence: ConcurrencyConfidence.Predicted,
    };
  }, [
    activeFilePath,
    interactionLine,
    runtimeAvailability,
    predictedByLine,
    workspacePath,
  ]);

  return {
    hoveredLine,
    activeHint,
    activeHintLine: activeHint?.line ?? null,
    setHoveredLine,
  };
}
