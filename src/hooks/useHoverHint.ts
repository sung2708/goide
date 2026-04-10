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
  runtimeAvailability: "available" | "unavailable";
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

  const activeHint = useMemo<LensHoverHint | null>(() => {
    if (!workspacePath || !activeFilePath || hoveredLine === null) {
      return null;
    }

    // Explicitly consume runtime availability so degraded-mode fallback is part
    // of the hint pipeline contract even when only predicted hints are present.
    if (runtimeAvailability !== "available" && runtimeAvailability !== "unavailable") {
      return null;
    }

    const match = visiblePredictedConstructs.find(
      (construct) =>
        construct.line === hoveredLine &&
        construct.confidence === ConcurrencyConfidence.Predicted
    );
    if (!match) {
      return null;
    }

    return {
      kind: match.kind,
      line: match.line,
      column: match.column,
      symbol: match.symbol,
      confidence: ConcurrencyConfidence.Predicted,
    };
  }, [
    activeFilePath,
    hoveredLine,
    runtimeAvailability,
    visiblePredictedConstructs,
    workspacePath,
  ]);

  return {
    hoveredLine,
    activeHint,
    activeHintLine: activeHint?.line ?? null,
    setHoveredLine,
  };
}

