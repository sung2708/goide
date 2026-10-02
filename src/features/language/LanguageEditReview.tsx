import Dialog from "../../components/primitives/Dialog";
import type { LanguageEditPlan, LanguageCodeAction } from "../../lib/ipc/types";
type Props = { state: { operation?: "format" | "imports" | "rename" | "action"; newName?: string; title?: string; actions?: LanguageCodeAction[]; loading: boolean; plan: LanguageEditPlan | null; error: string | null } | null; onApply: () => void; onClose: () => void; onRenameNameChange?: (name: string) => void; onPreviewRename?: () => void; onPreviewAction?: (action: LanguageCodeAction) => void };
export default function LanguageEditReview({ state, onApply, onClose, onRenameNameChange, onPreviewRename, onPreviewAction }: Props) {
  const title = state?.operation === "action" ? "Quick Fix / Code Actions" : state?.operation === "rename" ? "Review Rename Symbol" : state?.operation === "imports" ? "Review Organize Imports" : "Review Format Document";
  return <Dialog open={state !== null} onOpenChange={open => { if (!open) onClose(); }} ariaLabel={title} panelClassName="w-[min(70rem,95vw)] max-h-[85vh] overflow-auto rounded border border-(--border) bg-(--base) p-4 text-(--text)">
    <h2 className="mb-3">{title}</h2>
    {state?.operation === "rename" && <div className="mb-3 flex flex-wrap items-center gap-3"><label>New symbol name <input autoFocus aria-label="New symbol name" maxLength={256} disabled={state.loading} value={state.newName ?? ""} onChange={event => onRenameNameChange?.(event.target.value)} className="rounded bg-(--surface0) p-2" /></label><button disabled={state.loading || !state.newName?.trim()} onClick={onPreviewRename}>Preview Rename</button></div>}
    {state?.operation === "action" && <div className="mb-3 space-y-2" aria-label="Available code actions">
      {!state.loading && state.actions?.length === 0 && <p role="status">No code actions returned by gopls at this position.</p>}
      {state.actions?.map((action, index) => <div key={`${action.title}:${action.kind}:${index}`}><button disabled={state.loading || !!action.disabledReason} onClick={() => onPreviewAction?.(action)}>{action.title}{action.preferred ? " (preferred)" : ""}</button>{action.disabledReason && <p className="text-xs text-(--subtext0)">{action.disabledReason}</p>}</div>)}
      {state.title && <h3>Review: {state.title}</h3>}
    </div>}
    {state?.loading && <p role="status">Preparing edits with gopls…</p>}
    {state?.error && <p role="alert">{state.error}</p>}
    {state?.plan?.rename && <p>{state.plan.rename.oldName} → {state.plan.rename.newName} · {state.plan.files.length} files</p>}
    {state?.plan?.files.length === 0 && <p role="status">No changes returned by gopls.</p>}
    {state?.plan?.files.map(file => <section key={file.path} aria-label={`Changes to ${file.path}`}><h3>{file.path}</h3><div className="grid grid-cols-1 gap-3 md:grid-cols-2"><div><h4>Before</h4><pre className="overflow-auto whitespace-pre text-xs">{file.before}</pre></div><div><h4>After</h4><pre className="overflow-auto whitespace-pre text-xs">{file.after}</pre></div></div></section>)}
    <div className="mt-4 flex justify-end gap-3"><button onClick={onClose}>Cancel</button><button disabled={state?.loading || !state?.plan?.files.length || !!state.error} onClick={onApply}>Apply to Editor</button></div>
  </Dialog>;
}
