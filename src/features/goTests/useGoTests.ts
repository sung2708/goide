import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelLanguageRequest, confirmGoTestCleanup, runGoTests } from "../../lib/ipc/client";
import type { GoTestOutput, GoTestRequest } from "../../lib/ipc/types";
import type { GitTransaction } from "../git/useSourceControl";
import { useSettings } from "../settings/useSettings";
import { configureInOrder } from "../settings/toolchainConfiguration";
type Params = { root: string | null; transaction: GitTransaction; cancelPreparation: () => void; onChanged: (root: string) => void };
export function useGoTests(params: Params) {
  const { values } = useSettings();
  const paths = useMemo(() => ({ go: values["go.executablePath"], gopls: values["go.goplsPath"], dlv: values["debug.delvePath"] }), [values["go.executablePath"], values["go.goplsPath"], values["debug.delvePath"]]);
  const latest = useRef(params); latest.current = params;
  const pending = useRef(false), mounted = useRef(true), cancelled = useRef(false), active = useRef<GoTestRequest | null>(null);
  const recovery = useRef<{ request: GoTestRequest; done: () => void } | null>(null), recovering = useRef(false);
  const [busy, setBusy] = useState(false), [needsCleanup, setNeedsCleanup] = useState(false);
  const [output, setOutput] = useState<GoTestOutput | null>(null), [error, setError] = useState<string | null>(null), [status, setStatus] = useState("not run");
  const retryCleanup = useCallback(async () => {
    if (!recovery.current || recovering.current) return;
    const owner = recovery.current; recovering.current = true;
    try {
      const result = await confirmGoTestCleanup(owner.request);
      if (result.ok && result.data === true) { recovery.current = null; owner.done(); if (mounted.current) setNeedsCleanup(false); }
      else if (mounted.current) setError(result.error?.message ?? "Test cleanup is still pending; retry before editing or closing.");
    } catch (failure) { if (mounted.current) setError(String(failure)); }
    finally { recovering.current = false; }
  }, []);
  const cancel = useCallback(() => {
    cancelled.current = true;
    if (!active.current) { latest.current.cancelPreparation(); return; }
    void cancelLanguageRequest(active.current).then(result => { if (!result.ok && mounted.current) setError(result.error?.message ?? "Cancellation failed; waiting for native cleanup."); }).catch(failure => { if (mounted.current) setError(String(failure)); });
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (pending.current) cancel(); }; }, [cancel]);
  useEffect(() => { setOutput(null); setError(null); setStatus("not run"); if (pending.current) cancel(); }, [params.root, cancel]);
  const run = useCallback(async (target: GoTestRequest["target"], directory: string, testName: string | null = null) => {
    if (pending.current || !latest.current.root) return;
    const owner = latest.current, root = owner.root!;
    pending.current = true; cancelled.current = false; setBusy(true); setOutput(null); setError(null); setStatus("running");
    let started = false;
    try {
      const accepted = await owner.transaction(async () => {
        if (cancelled.current || latest.current.root !== root) throw new Error("Test startup cancelled before execution.");
        const configured = await configureInOrder(paths, () => !cancelled.current && latest.current.root === root && mounted.current);
        if (cancelled.current || latest.current.root !== root || !mounted.current) throw new Error("Test startup cancelled before execution.");
        if (!configured?.ok) throw new Error(configured?.error?.message ?? "Tool configuration failed; correct Settings before testing.");
        const request: GoTestRequest = { workspaceRoot: root, relativeDirectory: directory, requestId: crypto.randomUUID(), target, testName };
        active.current = request; started = true;
        let response;
        try { response = await runGoTests(request); }
        catch (failure) {
          const confirmation = new Promise<void>(done => { recovery.current = { request, done }; });
          if (mounted.current) { setNeedsCleanup(true); setError("Test IPC failed; waiting for native cleanup confirmation."); }
          void retryCleanup(); await confirmation;
          throw new Error(`Test outcome unavailable; native cleanup is confirmed. ${String(failure)}`);
        }
        if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Go test failed.");
        if (mounted.current && latest.current.root === root) { setOutput(response.data); setStatus(response.data.success ? "passed" : "failed"); }
      }, true, true);
      if (!accepted) throw new Error("Test startup cancelled during document preservation.");
    } catch (failure) {
      if (mounted.current && latest.current.root === root) { setError(String(failure)); setStatus(cancelled.current ? "cancelled" : "failed"); }
    } finally {
      active.current = null; pending.current = false;
      try { if (started) owner.onChanged(root); } finally { if (mounted.current) setBusy(false); }
    }
  }, [retryCleanup, paths]);
  return { busy, status, output, error, run, cancel, needsCleanup, retryCleanup };
}
