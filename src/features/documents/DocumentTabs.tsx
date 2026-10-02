import type { DocumentSnapshot } from "./DocumentSession";
import { isDocumentDirty } from "./DocumentSession";
type Props = { snapshot: DocumentSnapshot; busy: boolean; activate: (path: string) => void; close: (id: number) => void };
export default function DocumentTabs({ snapshot, busy, activate, close }: Props) {
  return <div role="tablist" aria-label="Open documents" onKeyDown={event => {
    if (busy || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const index = snapshot.documents.findIndex(document => document.id === snapshot.activeId);
    const next = event.key === "Home" ? 0 : event.key === "End" ? snapshot.documents.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + snapshot.documents.length) % snapshot.documents.length;
    const document = snapshot.documents[next]; if (!document) return;
    event.preventDefault(); activate(document.path);
    (event.currentTarget.querySelectorAll('[role="tab"]')[next] as HTMLElement | undefined)?.focus();
  }} className="flex shrink-0 overflow-x-auto border-b border-(--border-muted) bg-(--mantle)">{snapshot.documents.map(document => <div key={document.id} className={`flex shrink-0 items-center gap-1 border-r border-(--border-muted) px-2 text-xs ${snapshot.activeId === document.id ? "bg-(--base) text-(--text)" : "text-(--subtext0)"}`}><button role="tab" tabIndex={snapshot.activeId === document.id ? 0 : -1} aria-selected={snapshot.activeId === document.id} title={document.path} disabled={busy} onClick={() => activate(document.path)} className="max-w-64 truncate px-2 py-2.5">{document.path.split("/").pop()}{isDocumentDirty(document) ? " •" : ""}{document.readOnly ? " (read only)" : ""}</button><button aria-label={`Close ${document.path}`} disabled={busy} onClick={() => close(document.id)} className="rounded px-1 hover:bg-(--bg-hover)">×</button></div>)}</div>;
}
