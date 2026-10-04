import { useEffect, useRef, useState } from "react";
import type { DocumentSession, DocumentSnapshot } from "../documents/DocumentSession";
import { WorkspaceHistory, type WorkspaceSession } from "./history";
import { restoreWorkspaceDocuments } from "./restore";
import { getWorkspaceFileInfo, readWorkspaceFile } from "../../lib/ipc/client";

export function useWorkspaceHistory(documents: DocumentSession, snapshot: DocumentSnapshot, openWorkspace: (root: string) => Promise<boolean>, report: (message: string) => void) {
  const enabled = Boolean((globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
  const current = useRef({ openWorkspace, report });
  current.current = { openWorkspace, report };
  const [history] = useState(() => {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Restricted storage leaves editing available. */ }
    return new WorkspaceHistory(storage, message => current.current.report(message));
  });
  const [recent, setRecent] = useState(history.sessions);
  const mounted = useRef(false);
  const started = useRef(false);
  const previousRoot = useRef<string | null>(null);
  const restoring = useRef(false);
  const restore = useRef(async (stored: WorkspaceSession) => {
    restoring.current = true;
    try {
      if (!(await current.current.openWorkspace(stored.root)) || !mounted.current) return;
      const failed = await restoreWorkspaceDocuments(documents, stored, async (root, path) => {
        const info = await getWorkspaceFileInfo(root, path);
        if (!info.ok || !info.data) throw new Error(info.error?.message ?? "Cannot read file metadata.");
        const result = await readWorkspaceFile(root, path);
        if (!result.ok || result.data === undefined) throw new Error(result.error?.message ?? "Cannot read file.");
        return { text: result.data, readOnly: info.data.readOnly };
      }, () => mounted.current);
      if (mounted.current && failed.length) current.current.report(`Session restored with unavailable files: ${failed.join(", ")}. Reopen moved files from Explorer.`);
    } finally {
      restoring.current = false;
      if (mounted.current) {
        const latest = documents.snapshot();
        if (latest.root) history.remember(latest);
        else if (previousRoot.current) history.close();
        previousRoot.current = latest.root;
        setRecent([...history.sessions]);
      }
    }
  });
  // Metadata excludes content/version, so typing does not write storage.
  const metadata = JSON.stringify({ root: snapshot.root, activeId: snapshot.activeId, files: snapshot.documents.map(({ id, path, view }) => ({ id, path, view })) });
  useEffect(() => {
    if (!enabled || restoring.current) return;
    if (snapshot.root) { history.remember(documents.snapshot()); setRecent([...history.sessions]); }
    else if (previousRoot.current) history.close();
    previousRoot.current = snapshot.root;
  }, [metadata, enabled, history, documents]);
  useEffect(() => {
    mounted.current = true;
    // Defer one microtask so StrictMode's disposable first effect cannot start IO.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || started.current || !enabled) return;
      started.current = true;
      const stored = history.consumeStartup();
      if (stored) void restore.current(stored);
    });
    return () => { cancelled = true; mounted.current = false; };
  }, [enabled, history]);
  return { recent, clearStartup: () => {
    if (!history.close()) throw new Error("Workspace startup state could not be cleared. Retry before closing without saving.");
  }, reopen: (root: string) => {
    const stored = history.session(root);
    if (stored && !restoring.current) void restore.current(stored);
  }, forget: (root: string) => { history.forget(root); setRecent([...history.sessions]); } };
}
