import type { SemanticAnalysisResult } from "./types";

export type SemanticAnalysisWorkerMessage =
  | {
      type: "result";
      result: SemanticAnalysisResult;
    };

export type SemanticAnalysisWorker = {
  postMessage: (message: unknown) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<SemanticAnalysisWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

export type SemanticDocumentSync = {
  filePath: string;
  text: string;
};

export type SemanticAnalysisClient = {
  syncDocument: (document: SemanticDocumentSync) => void;
  requestAnalysis: (filePath: string) => void;
  subscribe: (listener: (result: SemanticAnalysisResult) => void) => () => void;
  dispose: () => void;
};

type VersionByFile = Map<string, number>;

export { type SemanticAnalysisResult } from "./types";

export function createSemanticAnalysisClient(
  createWorker: () => SemanticAnalysisWorker
): SemanticAnalysisClient {
  const worker = createWorker();
  const versionsByFile: VersionByFile = new Map();
  const sourcesByFile = new Map<string, string>();
  const analyzedVersions = new Map<string, number>();
  const pendingAnalysis = new Map<string, ReturnType<typeof setTimeout>>();
  const latestResults = new Map<string, SemanticAnalysisResult>();
  const listeners = new Set<(result: SemanticAnalysisResult) => void>();

  const analyze = (filePath: string) => {
    pendingAnalysis.delete(filePath);
    const version = versionsByFile.get(filePath);
    if (version === undefined || analyzedVersions.get(filePath) === version) return;
    analyzedVersions.set(filePath, version);
    worker.postMessage({ type: "analyze", request: { filePath, version } });
  };

  worker.onmessage = (event) => {
    if (event.data.type !== "result") {
      return;
    }

    const currentVersion = versionsByFile.get(event.data.result.filePath);
    if (currentVersion !== event.data.result.version) {
      return;
    }

    const result = { ...event.data.result, sourceText: sourcesByFile.get(event.data.result.filePath) };
    latestResults.set(result.filePath, result);
    for (const listener of listeners) listener(result);
  };

  return {
    syncDocument(document) {
      const nextVersion = (versionsByFile.get(document.filePath) ?? 0) + 1;
      versionsByFile.set(document.filePath, nextVersion);
      latestResults.delete(document.filePath);
      sourcesByFile.set(document.filePath, document.text);
      worker.postMessage({
        type: "sync",
        document: {
          ...document,
          version: nextVersion,
        },
      });
    },
    requestAnalysis(filePath) {
      const version = versionsByFile.get(filePath);
      if (version === undefined || analyzedVersions.get(filePath) === version) {
        return;
      }
      // Open files immediately; let typing settle before rebuilding outline,
      // folds and entry lenses. Sync still invalidates stale results at once.
      if (!analyzedVersions.has(filePath)) {
        analyze(filePath);
        return;
      }
      const previous = pendingAnalysis.get(filePath);
      if (previous !== undefined) clearTimeout(previous);
      pendingAnalysis.set(filePath, setTimeout(() => analyze(filePath), 120));
    },
    subscribe(listener) {
      listeners.add(listener);
      for (const result of latestResults.values()) listener(result);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      for (const timer of pendingAnalysis.values()) clearTimeout(timer);
      pendingAnalysis.clear();
      latestResults.clear();
      analyzedVersions.clear();
      listeners.clear();
      sourcesByFile.clear();
      versionsByFile.clear();
      worker.terminate();
    },
  };
}
