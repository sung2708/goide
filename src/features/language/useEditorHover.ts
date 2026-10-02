import { useCallback, useRef } from "react";
import type { DocumentSnapshot } from "../documents/DocumentSession";
import { queryWorkspaceLanguage } from "../../lib/ipc/client";
import { positionAt } from "./useLanguageQueries";
import { useLanguageCancellation } from "./useLanguageCancellation";

export type EditorHoverRequest = { offset: number; content: string; signal: AbortSignal };
export type EditorHoverResult = { text: string; error?: boolean } | null;

export function useEditorHover(snapshot: DocumentSnapshot, onError?: (message: string) => void) {
  const current = useRef(snapshot); current.current = snapshot;
  const latest = useRef<string | null>(null);
  const cancellation = useLanguageCancellation(snapshot, onError);
  return useCallback(async (request: EditorHoverRequest): Promise<EditorHoverResult> => {
    const expected = current.current;
    const document = expected.documents.find(item => item.id === expected.activeId);
    if (request.signal.aborted || !expected.root || !document?.path.endsWith(".go")) return null;
    const position = positionAt(request.content, request.offset);
    if (!position) return null;
    const native = cancellation.begin(expected.root);
    latest.current = native.requestId;
    const abort = () => cancellation.cancel(native.requestId);
    request.signal.addEventListener("abort", abort, { once: true });
    try {
      const response = await queryWorkspaceLanguage({
        ...native, relativePath: document.path, ...position, kind: "hover",
        buffers: expected.documents.filter(item => item.path.endsWith(".go")).map(item => ({
          path: item.path, content: item.id === document.id ? request.content : item.text,
        })),
      });
      if (request.signal.aborted || current.current !== expected || latest.current !== native.requestId) return null;
      if (!response.ok) return { text: response.error?.message ?? "Language information is unavailable.", error: true };
      return response.data?.text ? { text: response.data.text } : null;
    } catch (error) {
      if (request.signal.aborted || current.current !== expected || latest.current !== native.requestId) return null;
      return { text: error instanceof Error ? error.message : String(error), error: true };
    } finally {
      request.signal.removeEventListener("abort", abort);
      cancellation.complete(native.requestId);
      if (latest.current === native.requestId) latest.current = null;
    }
  }, [cancellation.begin, cancellation.cancel, cancellation.complete]);
}
