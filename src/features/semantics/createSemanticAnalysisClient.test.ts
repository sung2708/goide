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
  it("coalesces typing bursts, skips duplicate analysis and cancels queued work on disposal", () => {
    vi.useFakeTimers();
    try {
      const { worker } = createWorkerStub();
      const client = createSemanticAnalysisClient(() => worker);
      client.syncDocument({ filePath: "main.go", text: "package main" });
      client.requestAnalysis("main.go");
      client.requestAnalysis("main.go");
      for (let index = 0; index < 10; index++) {
        client.syncDocument({ filePath: "main.go", text: `package main\n// ${index}` });
        client.requestAnalysis("main.go");
        vi.advanceTimersByTime(10);
      }
      const analyses = () => vi.mocked(worker.postMessage).mock.calls.map(call => call[0]).filter((message: any) => message.type === "analyze");
      expect(analyses()).toHaveLength(1);
      vi.advanceTimersByTime(120);
      expect(analyses()).toEqual([
        { type: "analyze", request: { filePath: "main.go", version: 1 } },
        { type: "analyze", request: { filePath: "main.go", version: 11 } },
      ]);
      client.syncDocument({ filePath: "main.go", text: "package main\n// pending" });
      client.requestAnalysis("main.go");
      client.dispose();
      vi.runAllTimers();
      expect(analyses()).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });
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
      sourceText: "package main\nfunc main() {}\n",
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

  it("replays the current result to late editor subscribers but never replays an edited buffer", () => {
    const { worker, emitResult } = createWorkerStub();
    const client = createSemanticAnalysisClient(() => worker);
    client.syncDocument({ filePath: "main.go", text: "package main" });
    client.requestAnalysis("main.go");
    emitResult({ filePath: "main.go", version: 1, symbols: [], folds: [], selectionRanges: [] });
    const late = vi.fn();
    client.subscribe(late);
    expect(late).toHaveBeenCalledWith(expect.objectContaining({ version: 1, sourceText: "package main" }));
    client.syncDocument({ filePath: "main.go", text: "package main\n// newer" });
    const afterEdit = vi.fn();
    client.subscribe(afterEdit);
    expect(afterEdit).not.toHaveBeenCalled();
    client.dispose();
  });
});
