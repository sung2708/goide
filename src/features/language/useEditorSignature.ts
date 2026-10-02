import { useCallback, useRef } from "react";
import type { DocumentSnapshot } from "../documents/DocumentSession";
import type { SignatureHelp } from "../../lib/ipc/types";
import { queryWorkspaceSignature } from "../../lib/ipc/client";
import { positionAt } from "./useLanguageQueries";
import { useLanguageCancellation } from "./useLanguageCancellation";
import type { EditorHoverRequest } from "./useEditorHover";
export type EditorSignatureResult = SignatureHelp | { error: string } | null;

export function useEditorSignature(snapshot: DocumentSnapshot, onError?: (message: string) => void) {
  const current = useRef(snapshot); current.current = snapshot;
  const latest = useRef<string | null>(null);
  const cancellation = useLanguageCancellation(snapshot, onError);
  return useCallback(async (request: EditorHoverRequest): Promise<EditorSignatureResult> => {
    const expected = current.current;
    const document = expected.documents.find(item => item.id === expected.activeId);
    if (request.signal.aborted || !expected.root || !document?.path.endsWith(".go")) return null;
    const position = positionAt(request.content, request.offset);
    if (!position) return null;
    const native = cancellation.begin(expected.root); latest.current = native.requestId;
    const abort = () => cancellation.cancel(native.requestId);
    request.signal.addEventListener("abort", abort, { once: true });
    const obsolete = () => request.signal.aborted || current.current !== expected || latest.current !== native.requestId;
    try {
      const response = await queryWorkspaceSignature({
        ...native, relativePath: document.path, ...position, kind: "hover",
        buffers: expected.documents.filter(item => item.path.endsWith(".go")).map(item => ({ path: item.path, content: item.id === document.id ? request.content : item.text })),
      });
      if (obsolete()) return null;
      return response.ok ? response.data ?? null : { error: response.error?.message ?? "Signature help is unavailable." };
    } catch (error) {
      if (obsolete()) return null;
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      request.signal.removeEventListener("abort", abort);
      cancellation.complete(native.requestId);
      if (latest.current === native.requestId) latest.current = null;
    }
  }, [cancellation.begin, cancellation.cancel, cancellation.complete]);
}
