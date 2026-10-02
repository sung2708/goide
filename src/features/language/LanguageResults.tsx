import Dialog from "../../components/primitives/Dialog";
import type { LanguageLocation, LanguageQueryKind, LanguageQueryResult } from "../../lib/ipc/types";
type Props = { state: { kind: LanguageQueryKind; loading: boolean; result: LanguageQueryResult | null; error: string | null } | null; onClose: () => void; onNavigate: (location: LanguageLocation) => void };
export default function LanguageResults({ state, onClose, onNavigate }: Props) {
  const title = state?.kind === "definition" ? "Go to Definition" : state?.kind === "references" ? "Find References" : "Symbol Information";
  return <Dialog open={state !== null} onOpenChange={open => { if (!open) onClose(); }} ariaLabel={title} panelClassName="w-[min(48rem,90vw)] max-h-[80vh] overflow-auto rounded border border-(--border) bg-(--base) p-4 text-(--text)">
    <div className="mb-3 flex items-center justify-between"><h2>{title}</h2><button onClick={onClose}>Close</button></div>
    {state?.loading && <p role="status">Querying gopls…</p>}
    {state?.error && <p role="alert">{state.error}</p>}
    {state?.result && <>
      {state.result.text && <pre className="whitespace-pre-wrap break-words text-sm">{state.result.text}</pre>}
      <ul>{state.result.locations.map((location, index) => <li key={`${location.path}:${location.line}:${location.column}:${index}`}><button className="w-full rounded p-2 text-left hover:bg-(--bg-hover)" onClick={() => onNavigate(location)}>{location.path}:{location.line}:{location.column}</button></li>)}</ul>
      {!state.result.text && state.result.locations.length === 0 && <p>No results in the active workspace.</p>}
      {state.result.outsideWorkspace > 0 && <p role="status">{state.result.outsideWorkspace} locations are outside the workspace and cannot be opened by this view yet.</p>}
    </>}
  </Dialog>;
}
