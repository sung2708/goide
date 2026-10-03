import { LiveTestOutput } from "./liveOutput";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelLanguageRequest, confirmGoTestCleanup, runGoTests, subscribeGoTestOutput } from "../../lib/ipc/client";
import type { GoTestOutput, GoTestRequest } from "../../lib/ipc/types";
import type { GitTransaction } from "../git/useSourceControl";
import { useSettings } from "../settings/useSettings";
import { configureInOrder } from "../settings/toolchainConfiguration";
type Params = { root: string | null; transaction: GitTransaction; cancelPreparation: () => void; onChanged: (root: string) => void };
export function useGoTests(params: Params) {
  const { values } = useSettings();
  const paths = useMemo(() => ({ go: values["go.executablePath"], gopls: values["go.goplsPath"], dlv: values["debug.delvePath"] }), [values["go.executablePath"], values["go.goplsPath"], values["debug.delvePath"]]);
  const latest = useRef(params); latest.current = params;
  const latestPaths = useRef(paths); latestPaths.current = paths;
  const workspaceGeneration = useRef(0);
  const pending = useRef(false), mounted = useRef(true), cancelled = useRef(false), active = useRef<GoTestRequest | null>(null);
  const recovery = useRef<{ request: GoTestRequest; done: () => void } | null>(null), recovering = useRef(false);
  const [busy, setBusy] = useState(false), [needsCleanup, setNeedsCleanup] = useState(false);
  const [live, setLive] = useState<ReturnType<LiveTestOutput["snapshot"]> | null>(null);
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
  useEffect(() => { workspaceGeneration.current++; setOutput(null); setLive(null); setError(null); setStatus("not run"); if (pending.current) cancel(); }, [params.root, cancel]);
  const run = useCallback(async (target: GoTestRequest["target"], directory: string, testName: string | null = null) => {
    if (pending.current || !latest.current.root) return;
    const owner = latest.current, root = owner.root!, generation = workspaceGeneration.current;
    const current = () => mounted.current && latest.current.root === root && workspaceGeneration.current === generation;
    const prepared = () => current() && !cancelled.current && (["go", "gopls", "dlv"] as const).every(tool => latestPaths.current[tool] === paths[tool]);
    pending.current = true; cancelled.current = false; setBusy(true); setOutput(null); setLive(null); setError(null); setStatus("running");
    let started = false;
    const stream = { unlisten: null as (() => void) | null, timer: null as ReturnType<typeof setInterval> | null, preview: null as LiveTestOutput | null };
    let changed = false;
    const publish = () => { if (changed && stream.preview && current()) { changed = false; setLive(stream.preview.snapshot()); } };
    try {
      const accepted = await owner.transaction(async () => {
        if (!prepared()) throw new Error("Test startup cancelled or tool preferences changed before execution.");
        const configured = await configureInOrder(paths, prepared);
        if (!prepared()) throw new Error("Test startup cancelled or tool preferences changed before execution.");
        if (!configured?.ok) throw new Error(configured?.error?.message ?? "Tool configuration failed; correct Settings before testing.");
        const request: GoTestRequest = { workspaceRoot: root, relativeDirectory: directory, requestId: crypto.randomUUID(), target, testName };
        active.current = request;
        stream.preview = new LiveTestOutput(request);
        stream.unlisten = await subscribeGoTestOutput(request, event => {
          if (active.current !== request || !current()) return;
          changed = stream.preview!.consume(event) || changed;
        });
        if (!prepared()) throw new Error("Test startup cancelled or tool preferences changed before execution.");
        stream.timer = setInterval(publish, 100);
        started = true;
        let response;
        try {
          response = await runGoTests(request);
          if (response.error?.code === "go_test_cleanup_pending") throw new Error(response.error.message);
        }
        catch (failure) {
          const confirmation = new Promise<void>(done => { recovery.current = { request, done }; });
          if (mounted.current) { setNeedsCleanup(true); setError("Test completion/cleanup is unconfirmed; waiting for native cleanup confirmation."); }
          void retryCleanup(); await confirmation;
          throw new Error(`Test outcome unavailable; native cleanup is confirmed. ${String(failure)}`);
        }
        if (!response.ok || !response.data) throw new Error(response.error?.message ?? "Go test failed.");
        if (current()) { setOutput(response.data); setStatus(response.data.success ? "passed" : "failed"); }
      }, true, true);
      if (!accepted) throw new Error("Test startup cancelled during document preservation.");
    } catch (failure) {
      if (current()) { setError(String(failure)); setStatus(cancelled.current ? "cancelled" : "failed"); }
    } finally {
      if (stream.timer !== null) clearInterval(stream.timer);
      changed = stream.preview?.finish() || changed; publish();
      try { stream.unlisten?.(); } catch (failure) { if (current()) setError(`Live output subscription cleanup failed: ${String(failure)}`); }
      active.current = null; pending.current = false;
      try { if (started) owner.onChanged(root); } finally { if (mounted.current) setBusy(false); }
    }
  }, [retryCleanup, paths]);
  return { busy, status, output, live, error, run, cancel, needsCleanup, retryCleanup };
}
