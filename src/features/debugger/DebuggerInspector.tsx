import { useMemo } from "react";
import type { DebuggerFrame, DebuggerState } from "../../lib/ipc/types";
import { contextKey, useDebuggerInspector } from "./useDebuggerInspector";
import VariablesTree from "./VariablesTree";
import { ownsDebuggerWorkspace } from "./workspace";
type Props = { root: string | null; state: DebuggerState | null; navigate: (frame: DebuggerFrame) => void };
export default function DebuggerInspector({ root, state, navigate }: Props) {
  const context = root && ownsDebuggerWorkspace(root, state) && state?.sessionActive && state.paused && !state.cleanupPending && state.stopToken ? { root, token: state.stopToken } : null;
  const inspection = useDebuggerInspector(context, navigate);
  const budget = useMemo(() => ({ remaining: 2000 }), [contextKey(context), inspection.frame, inspection.scopes]);
  if (!context) return <p className="text-[11px] text-[var(--subtext0)]">Pause at an observed Delve stop to inspect goroutines, frames and variables.</p>;
  return <div className="space-y-3 text-[11px] text-[var(--text)]">
    <button type="button" disabled={inspection.busy} onClick={() => void inspection.refresh()}>Refresh inspection</button>
    {inspection.busy && <p role="status">Loading debugger inspection...</p>}
    {inspection.error && <p role="alert">{inspection.error}</p>}
    {inspection.notice && <p role="status">{inspection.notice}</p>}
    <section aria-label="Goroutines"><h4 className="font-semibold">Goroutines</h4>
      {inspection.threads.length === 0 && !inspection.busy && !inspection.error && <p>No goroutines returned by Delve.</p>}
      <div className="max-h-48 overflow-auto">{inspection.threads.map((thread, index) => <button type="button" key={`${thread.id}:${index}`} className="block w-full break-words text-left aria-pressed:bg-[var(--surface0)] aria-pressed:text-[var(--blue)]" aria-pressed={thread.id !== null && inspection.thread === thread.id} disabled={thread.id === null} onClick={() => { if (thread.id !== null) void inspection.selectThread(thread.id); }}>{thread.id !== null ? `Go ${thread.id}: ` : "ID unavailable: "}{thread.name}</button>)}</div>
    </section>
    <section aria-label="Call Stack"><h4 className="font-semibold">Call Stack</h4>
      {inspection.frames.length === 0 && !inspection.busy && !inspection.error && <p>No frames returned by Delve.</p>}
      <div className="max-h-48 overflow-auto">{inspection.frames.map(frame => <button type="button" key={frame.id} className="block w-full break-words text-left aria-pressed:bg-[var(--surface0)] aria-pressed:text-[var(--blue)]" aria-pressed={inspection.frame === frame.id} onClick={() => void inspection.selectFrame(frame)}>{frame.name}<span className="block text-[var(--subtext0)]">{frame.relativePath ?? frame.source ?? "Source unavailable"}{frame.line ? `:${frame.line}` : ""}{!frame.relativePath && frame.source ? " (workspace navigation unavailable)" : ""}</span></button>)}</div>
    </section>
    <section aria-label="Variables"><h4 className="font-semibold">Variables</h4>
      {inspection.scopes.length === 0 && !inspection.busy && !inspection.error && <p>No variable scopes returned by Delve.</p>}
      {inspection.scopes.map((scope, index) => <div key={`${contextKey(context)}:${inspection.frame}:${scope.reference}:${index}`}><h5>{scope.name}{scope.expensive ? " (expensive; loaded on expansion)" : ""}</h5><VariablesTree context={context} reference={scope.reference} budget={budget} /></div>)}
    </section>
  </div>;
}
