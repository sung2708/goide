import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { analyzeActiveFileConcurrency } from "../../lib/ipc/client";
import { buildCounterpartMappings } from "./counterpartMapping";
import {
  mapApiConstructToLensConstruct,
  type LensCounterpartMapping,
  type LensConstruct,
} from "./lensTypes";

type UseLensSignalsArgs = {
  workspacePath: string | null;
  activeFilePath: string | null;
  workspacePathRef: MutableRefObject<string | null>;
};

type UseLensSignalsResult = {
  detectedConstructs: LensConstruct[];
  counterpartMappings: LensCounterpartMapping[];
  isAnalyzing: boolean;
  analysisError: string | null;
};

function isGoFile(path: string | null): path is string {
  return typeof path === "string" && path.toLowerCase().endsWith(".go");
}

export function useLensSignals({
  workspacePath,
  activeFilePath,
  workspacePathRef,
}: UseLensSignalsArgs): UseLensSignalsResult {
  const [detectedConstructs, setDetectedConstructs] = useState<LensConstruct[]>(
    []
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspacePath || !isGoFile(activeFilePath)) {
      setDetectedConstructs([]);
      setAnalysisError(null);
      setIsAnalyzing(false);
      return;
    }

    const startingPath = workspacePath;
    let canceled = false;
    setIsAnalyzing(true);
    setAnalysisError(null);

    const run = async () => {
      try {
        const response = await analyzeActiveFileConcurrency({
          workspaceRoot: workspacePath,
          relativePath: activeFilePath,
        });

        if (canceled || workspacePathRef.current !== startingPath) {
          return;
        }

        if (!response.ok || !response.data) {
          setDetectedConstructs([]);
          setAnalysisError(response.error?.message ?? "Analysis failed");
          return;
        }

        setDetectedConstructs(
          response.data.map((item) => mapApiConstructToLensConstruct(item))
        );
      } catch (_error) {
        if (!canceled && workspacePathRef.current === startingPath) {
          setDetectedConstructs([]);
          setAnalysisError("Failed to analyze active Go file.");
        }
      } finally {
        if (!canceled && workspacePathRef.current === startingPath) {
          setIsAnalyzing(false);
        }
      }
    };

    void run();

    return () => {
      canceled = true;
    };
  }, [activeFilePath, workspacePath, workspacePathRef]);

  const counterpartMappings = useMemo(
    () => buildCounterpartMappings(detectedConstructs),
    [detectedConstructs]
  );

  return {
    detectedConstructs,
    counterpartMappings,
    isAnalyzing,
    analysisError,
  };
}
