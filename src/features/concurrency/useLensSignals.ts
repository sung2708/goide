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
  analysisRevision?: number;
};

type UseLensSignalsResult = {
  detectedConstructs: LensConstruct[];
  counterpartMappings: LensCounterpartMapping[];
  isAnalyzing: boolean;
  analysisError: string | null;
};

function buildAnalysisCacheKey(
  workspacePath: string,
  filePath: string,
  revision: number
) {
  return `${workspacePath}::${filePath}::${revision}`;
}

function isGoFile(path: string | null): path is string {
  return typeof path === "string" && path.toLowerCase().endsWith(".go");
}

export function useLensSignals({
  workspacePath,
  activeFilePath,
  workspacePathRef,
  analysisRevision = 0,
}: UseLensSignalsArgs): UseLensSignalsResult {
  const [detectedConstructs, setDetectedConstructs] = useState<LensConstruct[]>(
    []
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisCache] = useState(() => new Map<string, LensConstruct[]>());

  useEffect(() => {
    if (!workspacePath || !isGoFile(activeFilePath)) {
      setDetectedConstructs([]);
      setAnalysisError(null);
      setIsAnalyzing(false);
      return;
    }

    const startingPath = workspacePath;
    const cacheKey = buildAnalysisCacheKey(
      workspacePath,
      activeFilePath,
      analysisRevision
    );
    const cached = analysisCache.get(cacheKey);
    if (cached) {
      setDetectedConstructs(cached);
      setAnalysisError(null);
      setIsAnalyzing(false);
      return;
    }
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

        const mapped = response.data.map((item) => mapApiConstructToLensConstruct(item));
        if (analysisCache.size >= 120) {
          const firstKey = analysisCache.keys().next().value;
          if (firstKey) {
            analysisCache.delete(firstKey);
          }
        }
        analysisCache.set(cacheKey, mapped);
        setDetectedConstructs(mapped);
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
  }, [activeFilePath, analysisCache, analysisRevision, workspacePath, workspacePathRef]);

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
