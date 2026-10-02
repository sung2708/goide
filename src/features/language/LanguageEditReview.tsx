import Dialog from "../../components/primitives/Dialog";
import type { LanguageEditPlan } from "../../lib/ipc/types";
type Props = { state: { operation?: "format" | "imports"; loading: boolean; plan: LanguageEditPlan | null; error: string | null } | null; onApply: () => void; onClose: () => void };
export default function LanguageEditReview({ state, onApply, onClose }: Props) {
  const title = state?.operation === "imports" ? "Review Organize Imports" : "Review Format Document";
  return <Dialog open={state !== null} onOpenChange={open => { if (!open) onClose(); }} ariaLabel={title} panelClassName="w-[min(70rem,95vw)] max-h-[85vh] overflow-auto rounded border border-(--border) bg-(--base) p-4 text-(--text)">
    <h2 className="mb-3">{title}</h2>
    {state?.loading && <p role="status">Preparing edits with gopls…</p>}
    {state?.error && <p role="alert">{state.error}</p>}
    {state?.plan?.files.length === 0 && <p role="status">No changes returned by gopls.</p>}
    {state?.plan?.files.map(file => <section key={file.path} aria-label={`Changes to ${file.path}`}><h3>{file.path}</h3><div className="grid grid-cols-1 gap-3 md:grid-cols-2"><div><h4>Before</h4><pre className="overflow-auto whitespace-pre text-xs">{file.before}</pre></div><div><h4>After</h4><pre className="overflow-auto whitespace-pre text-xs">{file.after}</pre></div></div></section>)}
    <div className="mt-4 flex justify-end gap-3"><button onClick={onClose}>Cancel</button><button disabled={state?.loading || !state?.plan?.files.length || !!state.error} onClick={onApply}>Apply to Editor</button></div>
  </Dialog>;
}
