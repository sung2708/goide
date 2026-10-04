import { useEffect, useRef, useState } from "react";
import { DraftJournal, DRAFT_JOURNAL_KEY } from "./DraftJournal";
import type { DocumentSession, DocumentSnapshot } from "./DocumentSession";
import Dialog from "../../components/primitives/Dialog";
import { exportDocumentCopy } from "./exportCopy";

export function useDraftRecovery(session: DocumentSession, snapshot: DocumentSnapshot, report: (message: string) => void, keepDrafts = true) {
  const journal = useRef<DraftJournal | null>(null);
  const [revision, setRevision] = useState(0);
  const [managerOpen, setManagerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [discardRoot, setDiscardRoot] = useState<string | null>(null);
  const [invalidJournal, setInvalidJournal] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [storageGeneration, setStorageGeneration] = useState(0);
  const latestReport = useRef(report); latestReport.current = report;
  const enabled = Boolean((globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
  const keepDraftsRef = useRef(keepDrafts); keepDraftsRef.current = keepDrafts;
  useEffect(() => {
    if (!enabled) return;
    try { journal.current = new DraftJournal(localStorage); setRevision(value => value + 1); }
    catch (error) { setInvalidJournal(true); latestReport.current(`Draft recovery unavailable: ${String(error)}`); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previousRoot = session.snapshot().root;
    const flush = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      try { if (keepDraftsRef.current) journal.current?.capture(session.snapshot()); }
      catch (error) { latestReport.current(`Draft recovery could not be saved: ${String(error)}`); }
    };
    let observed = session.snapshot();
    const unsubscribe = session.subscribe(() => {
      const current = session.snapshot();
      // Ignore caret/view updates; recovery writes follow buffer versions only.
      if (current.root === observed.root && current.documents.length === observed.documents.length && current.documents.every((doc, index) => {
        const previous = observed.documents[index];
        return doc.id === previous.id && doc.version === previous.version && doc.baseline === previous.baseline;
      })) return;
      observed = current;
      if (previousRoot && previousRoot !== current.root) {
        try { if (!journal.current?.pending(previousRoot).length) journal.current?.discard(previousRoot); }
        catch (error) { latestReport.current(`Draft cleanup failed: ${String(error)}`); }
      }
      previousRoot = current.root;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(flush, 200);
    });
    flush();
    window.addEventListener("pagehide", flush);
    return () => { flush(); unsubscribe(); window.removeEventListener("pagehide", flush); };
  }, [session, enabled, storageGeneration]);
  const pending = snapshot.root ? journal.current?.pending(snapshot.root) ?? [] : [];
  const decide = (restore: boolean) => {
    try {
      if (restore) journal.current?.restore(session);
      else if (snapshot.root) { journal.current?.discard(snapshot.root); if (keepDrafts) journal.current?.capture(session.snapshot()); }
      setRevision(revision + 1);
    } catch (error) { report(String(error)); }
  };
  const stored = journal.current?.drafts ?? [];
  const banner = invalidJournal || pending.length ? <div role="region" aria-label="Draft recovery" className="border-b border-(--border-muted) bg-(--surface) px-4 py-2 text-sm"><p>{invalidJournal ? "Draft recovery is paused because stored data could not be read or validated." : `${pending.length} unsaved draft(s) from a previous session. Restore into editors to review; files on disk remain unchanged. Recovery stays paused for this workspace until you decide.`}</p><div className="mt-2 flex gap-4">{!invalidJournal && <button onClick={() => decide(true)}>Restore drafts</button>}<button onClick={() => setManagerOpen(true)}>Review stored drafts…</button></div></div> : null;
  const dialog = <Dialog open={managerOpen} ariaLabel="Stored drafts" onOpenChange={open => { if (!exporting) { setManagerOpen(open); setDiscardRoot(null); } }} className="fixed inset-0 z-50 m-0 flex h-dvh w-full items-center justify-center bg-black/50" panelClassName="max-h-[80vh] w-[min(640px,90vw)] overflow-auto rounded border border-(--border-muted) bg-(--base) p-5 text-(--text)">
    <h2 className="font-semibold">Stored drafts</h2><p className="my-3 text-sm">Drafts stay on this device until saved or discarded. You can export a copy even if the original workspace was moved or deleted. Recovery stores plain text; disable new copies in Files settings for sensitive projects.</p>
    {!enabled && <p>Draft recovery requires the desktop app.</p>}
    {invalidJournal && <div className="my-3 text-sm"><p>The stored journal could not be read or validated. Automatic recovery is paused. Export it before resetting if it may contain valuable code.</p><button disabled={exporting} onClick={async () => { setExporting(true); try { const raw = localStorage.getItem(DRAFT_JOURNAL_KEY); if (raw !== null) await exportDocumentCopy("goro-draft-journal.json", raw); } catch (error) { report(String(error)); } finally { setExporting(false); } }}>Export original journal…</button><button disabled={exporting} onClick={() => setConfirmReset(true)}>Reset invalid journal…</button>{confirmReset && <div><p>Permanently delete the invalid recovery data?</p><button onClick={() => { try { localStorage.setItem(DRAFT_JOURNAL_KEY, JSON.stringify({ version: 1, drafts: [] })); setInvalidJournal(false); setConfirmReset(false); setStorageGeneration(value => value + 1); } catch (error) { report(String(error)); } }}>Confirm reset</button><button onClick={() => setConfirmReset(false)}>Keep journal</button></div>}</div>}
    {enabled && !invalidJournal && stored.length === 0 && <p>No stored drafts.</p>}
    {stored.map(draft => <div key={JSON.stringify([draft.root, draft.path])} className="my-3 border-t border-(--border-muted) pt-3 text-sm"><p className="break-all">{draft.root} / {draft.path}</p><p>{new Date(draft.updated).toLocaleString()} · {draft.text.length} characters</p><button disabled={exporting} onClick={async () => { setExporting(true); try { await exportDocumentCopy(draft.path, draft.text); } catch (error) { report(String(error)); } finally { setExporting(false); } }}>Export copy…</button></div>)}
    {pending.length > 0 && <button disabled={exporting} onClick={() => decide(true)}>Restore current workspace drafts</button>}
    {[...new Set(stored.map(draft => draft.root))].map(root => <div key={root} className="my-3 text-sm"><button disabled={exporting} onClick={() => setDiscardRoot(root)}>Discard stored drafts for {root}…</button>{discardRoot === root && <div><p>Delete these recovery copies? Open editor buffers remain unchanged.</p><button onClick={() => { try { journal.current?.discard(root); setDiscardRoot(null); setRevision(value => value + 1); } catch (error) { report(String(error)); } }}>Confirm discard</button><button onClick={() => setDiscardRoot(null)}>Keep drafts</button></div>}</div>)}
    <button disabled={exporting} onClick={() => setManagerOpen(false)}>Close</button>
  </Dialog>;
  const discardCurrent = () => {
    const root = session.snapshot().root;
    if (!enabled || !root) return;
    if (!journal.current) throw new Error("Draft recovery could not be cleared. Review stored drafts before closing without saving.");
    journal.current.discard(root);
    setRevision(value => value + 1);
  };
  return { banner, dialog, open: () => setManagerOpen(true), discardCurrent };
}
