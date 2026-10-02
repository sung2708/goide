import { useCallback, useEffect, useRef } from "react";
import { cancelLanguageRequest } from "../../lib/ipc/client";
import type { LanguageCancelRequest } from "../../lib/ipc/types";

export function useLanguageCancellation(snapshot: unknown, onError?: (message: string) => void) {
  const report = useRef(onError);
  report.current = onError;
  const context = useRef(snapshot); context.current = snapshot;
  const active = useRef<{ request: LanguageCancelRequest; context: unknown } | null>(null);
  const cancel = useCallback((requestId?: string) => {
    const request = active.current?.request;
    if (requestId && request?.requestId !== requestId) return;
    active.current = null;
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
  useEffect(() => { if (active.current && active.current.context !== snapshot) cancel(); }, [snapshot, cancel]);
  useEffect(() => () => { cancel(); }, [cancel]);
  const begin = useCallback((workspaceRoot: string, capturedContext: unknown = context.current) => {
    cancel();
    const request = { workspaceRoot, requestId: crypto.randomUUID() };
    active.current = { request, context: capturedContext }; return request;
  }, [cancel]);
  const complete = useCallback((requestId: string) => { if (active.current?.request.requestId === requestId) active.current = null; }, []);
  return { begin, complete, cancel };
}
