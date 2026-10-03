import { useEffect, useRef, useState } from "react";
import { queryDebuggerInspection } from "../../lib/ipc/client";
import type { DebuggerVariable } from "../../lib/ipc/types";
import { contextKey, type InspectionContext } from "./useDebuggerInspector";

type Props = { context: InspectionContext; reference: number; indexedCount?: number | null; depth?: number; budget: { remaining: number } };
export default function VariablesTree({ context, reference, indexedCount, depth = 0, budget }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DebuggerVariable[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [limited, setLimited] = useState(false);
  const current = useRef(contextKey(context)); current.current = contextKey(context);
  const mounted = useRef(false);
  const sequence = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current += 1; }; }, []);
  const load = async (start = 0) => {
    if (busy || depth >= 20) return;
    if (budget.remaining <= 0) { setError("Visible value budget reached; select another frame or refresh inspection."); return; }
    const request = ++sequence.current;
    const expected = contextKey(context);
    setBusy(true); setError(null);
    try {
      const response = await queryDebuggerInspection({ workspaceRoot: context.root, stopToken: context.token, query: { kind: "variables", reference, start, indexed: (indexedCount ?? 0) > 0 } });
      if (!mounted.current || sequence.current !== request || current.current !== expected) return;
      if (!response.ok || response.data?.kind !== "variables" || response.data.stopToken !== context.token) throw new Error(response.error?.message ?? "Values are unavailable for this debugger stop.");
      const data = response.data;
      const accepted = data.items.slice(0, budget.remaining);
      budget.remaining -= accepted.length;
      setItems(previous => start === 0 ? accepted : [...(previous ?? []), ...accepted]);
      setNext(budget.remaining > 0 ? data.nextStart : null);
      setLimited(data.limited);
      if (accepted.length < data.items.length) setError("Visible value budget reached; select another frame or refresh inspection.");
    } catch (error) { if (mounted.current && sequence.current === request && current.current === expected) setError(error instanceof Error ? error.message : String(error)); }
    finally { if (mounted.current && sequence.current === request && current.current === expected) setBusy(false); }
  };
  if (reference === 0) return <span>No expandable values in this scope.</span>;
  if (depth >= 20) return <span>Inspection depth limit reached.</span>;
  return <div className="ml-2 border-l border-[var(--border-subtle)] pl-2">
    <button type="button" aria-expanded={open} disabled={busy} onClick={() => { setOpen(value => !value); if (!open && items === null) void load(); }}>{open ? "Collapse values" : "Expand values"}</button>
    {open && <div>
      {busy && <p role="status">Loading values...</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Retry values</button></p>}
      {items?.length === 0 && <p>No values returned by Delve.</p>}
      {items?.map((variable, index) => <div key={`${index}:${variable.name}`} className="my-1">
        <div className="break-words"><strong>{variable.name}</strong>{variable.variableType && <span> : {variable.variableType}</span>} = <span>{variable.value}</span>{variable.truncated && <span> (value truncated)</span>}</div>
        {variable.reference > 0 && <VariablesTree key={`${context.token}:${reference}:${index}:${variable.reference}`} context={context} reference={variable.reference} indexedCount={variable.indexedVariables} depth={depth + 1} budget={budget} />}
      </div>)}
      {limited && <p>Showing the first 200 values returned in this page.</p>}
      {next !== null && <button type="button" disabled={busy || budget.remaining <= 0} onClick={() => void load(next)}>Load next 100 indexed entries</button>}
      {budget.remaining <= 0 && <p>Visible value budget reached; select another frame or refresh inspection.</p>}
    </div>}
  </div>;
}
