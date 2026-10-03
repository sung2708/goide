import { useCallback, useEffect, useRef, useState } from "react";
import Dialog from "../primitives/Dialog";
import type { WorkspaceReplacementPlan } from "../../lib/ipc/types";
import type { ReplacementDecision } from "./useWorkspaceSearchState";

export function useReplacementReview(root: string | null) {
  const [plans, setPlans] = useState<WorkspaceReplacementPlan[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const resolver = useRef<((accepted: ReplacementDecision) => void) | null>(null);
  const finish = useCallback((accepted: ReplacementDecision) => { resolver.current?.(accepted); resolver.current = null; setPlans(null); }, []);
  useEffect(() => { finish(false); return () => { resolver.current?.(false); resolver.current = null; }; }, [root, finish]);
  const review = useCallback((next: WorkspaceReplacementPlan[]) => new Promise<ReplacementDecision>((resolve) => {
    if (resolver.current || next.length === 0) { resolve(false); return; }
    resolver.current = resolve; setSelected(0); setExcluded(new Set()); setPlans(next);
  }), []);
  const file = plans?.[selected];
  const included = plans?.filter(plan => !excluded.has(plan.path)) ?? [];
  const dialog = <Dialog open={plans !== null} onOpenChange={(open) => { if (!open) finish(false); }} ariaLabel="Review workspace replacements" closeOnBackdrop={false} className="fixed inset-0 z-50 m-0 h-dvh w-full bg-black/50 p-6" panelClassName="mx-auto flex max-h-[90vh] max-w-5xl flex-col border border-(--border-muted) bg-(--base) p-4 text-(--text)">
    <h2 className="font-semibold">Review workspace replacements</h2>
    <p className="my-2 text-xs">{included.length} files · {included.reduce((count, file) => count + file.occurrences, 0)} replacements. Apply saves the reviewed content to disk. Other matching lines remain unchanged. Literal search keeps replacement text literal; regex uses $1, {"${name}"} and $$ captures.</p>
    <div className="flex min-h-0 flex-1 gap-3"><ul aria-label="Replacement files" className="max-h-[60vh] w-48 shrink-0 overflow-auto text-xs">{plans?.map((plan, index) => <li key={plan.path}><label className="flex items-center gap-2 px-2 pt-2"><input type="checkbox" aria-label={`Include ${plan.path} in replacement`} checked={!excluded.has(plan.path)} onChange={event => { const checked = event.target.checked; setExcluded(previous => { const next = new Set(previous); if (checked) next.delete(plan.path); else next.add(plan.path); return next; }); }} />Include file</label><button aria-pressed={index === selected} className="w-full break-all border-b border-(--border-subtle) px-2 py-2 text-left hover:bg-(--bg-hover)" onClick={() => setSelected(index)}>{plan.path} · {plan.occurrences}</button></li>)}</ul>
      {file && <div className="grid min-h-0 min-w-0 flex-1 gap-2 md:grid-cols-2"><div className="min-w-0"><h3 className="text-xs">Before · {file.path}</h3><pre aria-label="Replacement before" className="max-h-[60vh] overflow-auto border border-(--border-muted) bg-(--crust) p-2 text-xs">{file.before}</pre></div><div className="min-w-0"><h3 className="text-xs">After · {file.path}</h3><pre aria-label="Replacement after" className="max-h-[60vh] overflow-auto border border-(--border-muted) bg-(--crust) p-2 text-xs">{file.after}</pre></div></div>}
    </div>
    <div className="mt-4 flex justify-end gap-3 text-sm"><button autoFocus className="rounded border border-(--border-muted) px-3 py-2" onClick={() => finish(false)}>Cancel replacement</button><button className="rounded border border-(--border-active) px-3 py-2" disabled={included.length === 0} onClick={() => finish(excluded.size ? included : true)}>Apply reviewed replacements</button></div>
  </Dialog>;
  return { review, dialog };
}
