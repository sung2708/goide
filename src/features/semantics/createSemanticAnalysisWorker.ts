import type { SemanticAnalysisWorker } from "./createSemanticAnalysisClient";

export function createSemanticAnalysisWorker(): SemanticAnalysisWorker {
  return new Worker(new URL("./semanticAnalysisWorker.ts", import.meta.url), {
    type: "module",
  }) as SemanticAnalysisWorker;
}
