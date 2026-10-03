import { useCallback, useEffect, useRef, useState } from "react";
import { cancelLanguageRequest, confirmGoModuleCleanup, runGoModuleAction } from "../../lib/ipc/client";
import type { GoModuleAction, GoModuleOutput, GoModuleRequest, GoProjectInfo } from "../../lib/ipc/types";
import type { GitTransaction } from "../git/useSourceControl";
type Params = { root: string | null; info: GoProjectInfo | null; transaction?: GitTransaction; cancelPreparation?: () => void; onChanged?: (root: string) => void; onBusy?: (busy: boolean) => void };
export function useGoModuleAction(params: Params) {
  const latest = useRef(params); latest.current = params;
  const pending = useRef(false), mounted = useRef(true), cancelled = useRef(false), active = useRef<GoModuleRequest | null>(null);
  const recovery = useRef<{ request: GoModuleRequest; done: () => void } | null>(null), recovering = useRef(false);
  const [needsCleanup, setNeedsCleanup] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [output, setOutput] = useState<GoModuleOutput | null>(null);
  const retryCleanup = useCallback(async () => {
    const current = recovery.current;
    if (!current || recovering.current) return;
    recovering.current = true;
    try {
      const result = await confirmGoModuleCleanup(current.request);
      if (result.ok && result.data === true) { recovery.current = null; if (mounted.current) setNeedsCleanup(false); current.done(); }
      else if (mounted.current) setError(`Module outcome unavailable; cleanup remains unconfirmed. ${result.error?.message ?? "Retry cleanup before editing or closing."}`);
    } catch (failure) { if (mounted.current) setError(`Module cleanup remains unconfirmed: ${failure instanceof Error ? failure.message : String(failure)}. Retry cleanup before editing or closing.`); }
    finally { recovering.current = false; }
  }, []);
  const cancel = useCallback(() => {
    cancelled.current = true;
    if (!active.current) { latest.current.cancelPreparation?.(); return; }
    void cancelLanguageRequest(active.current).then(result => {
      if (!result.ok && mounted.current) setError(result.error?.message ?? "Module cancellation failed; waiting for native cleanup.");
    }).catch(failure => { if (mounted.current) setError(String(failure)); });
    // The transaction stays locked until the owned native operation acknowledges its end.
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (pending.current) cancel(); }; }, [cancel]);
  useEffect(() => { setError(null); setOutput(null); if (pending.current) cancel(); }, [params.root, cancel]);
  const run = useCallback(async (action: GoModuleAction, relativeDirectory: string) => {
    if (pending.current) return;
    const owner = latest.current;
    if (!owner.root || !owner.info || !owner.transaction) { setError("Open a Go project with document safety available first."); return; }
    pending.current = true; cancelled.current = false; setBusy(true); owner.onBusy?.(true); setError(null); setOutput(null);
    let started = false;
    try {
      const accepted = await owner.transaction(async () => {
        if (cancelled.current) throw new Error("Module action cancelled before startup.");
        if (latest.current.root !== owner.root) throw new Error("Workspace changed; module action was not started.");
        const request = { workspaceRoot: owner.root!, relativeDirectory, action, expectedWorkFile: owner.info!.workFile, requestId: crypto.randomUUID() };
        active.current = request; started = true;
        let response;
        try {
          response = await runGoModuleAction(request);
          if (response.error?.code === "go_module_cleanup_pending") throw new Error(response.error.message);
        }
        catch (failure) {
          const confirmed = new Promise<void>(done => { recovery.current = { request, done }; });
          if (mounted.current) { setNeedsCleanup(true); setError("Module completion/cleanup is unconfirmed; waiting for native cleanup confirmation before editing or closing."); }
          void retryCleanup();
          await confirmed;
          throw new Error(`Module command outcome unavailable; native cleanup is confirmed. ${failure instanceof Error ? failure.message : String(failure)}`);
        }
        if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Go module command failed.");
        if (mounted.current && latest.current.root === owner.root) {
          setOutput(response.data);
          if (!response.data.success) setError(`go mod ${action} exited with ${response.data.exitCode ?? "an unknown status"}. Review the command output.`);
        }
      }, true, true);
      if (!accepted) throw new Error("Document preservation was cancelled; module command was not started.");
    } catch (failure) { if (mounted.current && latest.current.root === owner.root) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally {
      active.current = null; pending.current = false;
      try { if (started) owner.onChanged?.(owner.root); }
      finally { owner.onBusy?.(false); if (mounted.current) setBusy(false); }
    }
  }, [retryCleanup]);
  return { busy, error, output, run, cancel, needsCleanup, retryCleanup };
}
