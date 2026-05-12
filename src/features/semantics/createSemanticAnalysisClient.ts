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
  const listeners = new Set<(result: SemanticAnalysisResult) => void>();

  worker.onmessage = (event) => {
    if (event.data.type !== "result") {
      return;
    }

    const currentVersion = versionsByFile.get(event.data.result.filePath);
    if (currentVersion !== event.data.result.version) {
      return;
    }

    for (const listener of listeners) {
      listener(event.data.result);
    }
  };

  return {
    syncDocument(document) {
      const nextVersion = (versionsByFile.get(document.filePath) ?? 0) + 1;
      versionsByFile.set(document.filePath, nextVersion);
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
      if (version === undefined) {
        return;
      }

      worker.postMessage({
        type: "analyze",
        request: {
          filePath,
          version,
        },
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      listeners.clear();
      worker.terminate();
    },
  };
}
