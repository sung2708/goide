import { useCallback, useEffect, useRef } from "react";
import { cancelLanguageRequest } from "../../lib/ipc/client";
import type { LanguageCancelRequest } from "../../lib/ipc/types";
import type { DocumentSnapshot } from "../documents/DocumentSession";

export function useLanguageCancellation(snapshot: DocumentSnapshot, onError?: (message: string) => void) {
  const report = useRef(onError);
  report.current = onError;
  const active = useRef<LanguageCancelRequest | null>(null);
  const cancel = useCallback(() => {
    const request = active.current; active.current = null;
    if (!request) return;
    const failed = (message: string) => {
      const detail = `Unable to cancel language request in ${request.workspaceRoot}: ${message}`;
      if (report.current) report.current(detail);
      else console.warn(detail);
    };
    void cancelLanguageRequest(request).then(response => {
      if (!response.ok) failed(response.error?.message ?? "Native cancellation failed.");
    }).catch(error => failed(error instanceof Error ? error.message : String(error)));
  }, []);
  useEffect(() => { cancel(); }, [snapshot, cancel]);
  useEffect(() => () => { cancel(); }, [cancel]);
  const begin = (workspaceRoot: string) => {
    cancel();
    const request = { workspaceRoot, requestId: crypto.randomUUID() };
    active.current = request; return request;
  };
  const complete = (requestId: string) => { if (active.current?.requestId === requestId) active.current = null; };
  return { begin, complete, cancel };
}
