import { analyzeGoSource } from "./analyzeGoSource";

type SyncedDocument = {
  filePath: string;
  text: string;
  version: number;
};

type WorkerMessage =
  | {
      type: "sync";
      document: SyncedDocument;
    }
  | {
      type: "analyze";
      request: {
        filePath: string;
        version: number;
      };
    };

const documents = new Map<string, SyncedDocument>();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type === "sync") {
    documents.set(event.data.document.filePath, event.data.document);
    return;
  }

  const document = documents.get(event.data.request.filePath);
  if (!document || document.version !== event.data.request.version) {
    return;
  }

  const result = await analyzeGoSource(document);
  self.postMessage({
    type: "result",
    result,
  });
};
