import { describe, expect, it, vi } from "vitest";
import {
  createSemanticAnalysisClient,
  type SemanticAnalysisResult,
  type SemanticAnalysisWorker,
} from "./createSemanticAnalysisClient";

function createWorkerStub() {
  const worker: SemanticAnalysisWorker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
  };

  const emitResult = (result: SemanticAnalysisResult) => {
    worker.onmessage?.({
      data: {
        type: "result",
        result,
      },
    } as MessageEvent);
  };

  return { worker, emitResult };
}

describe("createSemanticAnalysisClient", () => {
  it("posts sync and analyze messages with incrementing versions", () => {
    const { worker } = createWorkerStub();
    const client = createSemanticAnalysisClient(() => worker);

    client.syncDocument({
      filePath: "main.go",
      text: "package main\n",
    });
    client.requestAnalysis("main.go");
    client.syncDocument({
      filePath: "main.go",
      text: "package main\nfunc main() {}\n",
    });

    expect(worker.postMessage).toHaveBeenNthCalledWith(1, {
      type: "sync",
      document: {
        filePath: "main.go",
        text: "package main\n",
        version: 1,
      },
    });
    expect(worker.postMessage).toHaveBeenNthCalledWith(2, {
      type: "analyze",
      request: {
        filePath: "main.go",
        version: 1,
      },
    });
    expect(worker.postMessage).toHaveBeenNthCalledWith(3, {
      type: "sync",
      document: {
        filePath: "main.go",
        text: "package main\nfunc main() {}\n",
        version: 2,
      },
    });
  });

  it("ignores stale results and only publishes the latest version", () => {
    const { worker, emitResult } = createWorkerStub();
    const client = createSemanticAnalysisClient(() => worker);
    const listener = vi.fn();

    client.subscribe(listener);
    client.syncDocument({
      filePath: "main.go",
      text: "package main\n",
    });
    client.requestAnalysis("main.go");
    client.syncDocument({
      filePath: "main.go",
      text: "package main\nfunc main() {}\n",
    });
    client.requestAnalysis("main.go");

    emitResult({
      filePath: "main.go",
      version: 1,
      symbols: [
        {
          name: "stale",
          kind: "function",
          range: { from: 0, to: 12 },
        },
      ],
      folds: [],
      selectionRanges: [],
    });
    emitResult({
      filePath: "main.go",
      version: 2,
      symbols: [
        {
          name: "main",
          kind: "function",
          range: { from: 13, to: 26 },
        },
      ],
      folds: [],
      selectionRanges: [],
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      filePath: "main.go",
      version: 2,
      symbols: [
        {
          name: "main",
          kind: "function",
          range: { from: 13, to: 26 },
        },
      ],
      folds: [],
      selectionRanges: [],
    });
  });

  it("terminates the worker when disposed", () => {
    const { worker } = createWorkerStub();
    const client = createSemanticAnalysisClient(() => worker);

    client.dispose();

    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
