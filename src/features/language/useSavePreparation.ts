import { useCallback, useEffect, useRef, useState } from "react";
import { formatWorkspaceDocument, organizeWorkspaceImports } from "../../lib/ipc/client";
import type { DocumentSession, DocumentSnapshot, SavePreparation } from "../documents/DocumentSession";
import type { Settings } from "../settings/model";
import { useLanguageCancellation } from "./useLanguageCancellation";
const sourceKey = (snapshot: DocumentSnapshot) => JSON.stringify([snapshot.root, snapshot.documents.filter(document => document.path.endsWith(".go")).map(document => [document.id, document.path, document.version, document.readOnly])]);
export function useSavePreparation(documents: DocumentSession, snapshot: DocumentSnapshot, settings: Readonly<Settings>, onError?: (message: string) => void) {
  const sourceIdentity = sourceKey(snapshot);
  const cancellation = useLanguageCancellation(sourceIdentity, onError);
  const epoch = useRef(0);
  const [isPreparing, setIsPreparing] = useState(false);
  useEffect(() => () => { epoch.current++; }, []);
  const cancel = useCallback(() => { epoch.current++; cancellation.cancel(); }, [cancellation.cancel]);
  const imports = settings["go.organizeImportsOnSave"], format = settings["go.formatOnSave"];
  const prepare = useCallback<SavePreparation>(async (document, root) => {
    if (!document.path.endsWith(".go")) return document.text;
    const expected = documents.snapshot();
    const capturedEpoch = epoch.current;
    const sources = expected.documents.filter(document => document.path.endsWith(".go"));
    const verifyCurrent = () => {
      if (epoch.current !== capturedEpoch) throw new Error("Save preparation cancelled. The draft is retained.");
      const current = documents.snapshot();
      if (current.root !== root || sources.some(source => {
        const live = current.documents.find(document => document.id === source.id);
        return !live || live.path !== source.path || live.version !== source.version || live.text !== source.text || live.readOnly !== source.readOnly;
      })) throw new Error("Go buffers changed during save preparation. Save again.");
    };
    verifyCurrent(); let content = document.text;
    for (const operation of [imports ? organizeWorkspaceImports : null, format ? formatWorkspaceDocument : null]) {
      if (!operation) continue;
      const native = cancellation.begin(root, sourceKey(expected));
      setIsPreparing(true);
      try {
        const response = await operation({ ...native, relativePath: document.path, buffers: sources.map(source => ({ path: source.path, content: source.id === document.id ? content : source.text })) });
        verifyCurrent();
        if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Save preparation returned no edit plan.");
        if (response.data.files.length > 1) throw new Error("Save preparation returned edits outside the saved document.");
        const edit = response.data.files[0];
        if (edit) {
          if (edit.path !== document.path || edit.before !== content || edit.readOnly) throw new Error("Save preparation returned an invalid or stale edit.");
          content = edit.after;
        }
      } finally { cancellation.complete(native.requestId); setIsPreparing(false); }
    }
    verifyCurrent(); return content;
  }, [documents, imports, format, cancellation.begin, cancellation.complete]);
  return { prepare: imports || format ? prepare : undefined, isPreparing, cancel };
}