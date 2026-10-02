import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DocumentSession, isDocumentDirty } from "./DocumentSession";
export function useDocumentSession() {
  const session = useMemo(() => new DocumentSession(), []);
  const snapshot = useSyncExternalStore(session.subscribe, session.snapshot);
  const active = snapshot.documents.find(document => document.id === snapshot.activeId) ?? null;
  const setWorkspacePath = useCallback((root: string | null) => session.reset(root), [session]);
  const setActiveFilePath = useCallback((path: string | null) => {
    if (path === null) session.deactivate();
    else session.open(path, "");
  }, [session]);
  const setActiveFileContent = useCallback((text: string | null) => {
    if (session.active && text !== null) session.edit(session.active.id, text);
  }, [session]);
  // Existing lifecycle hooks consume refs. These adapters read/write the session
  // directly instead of maintaining a second copy of its active buffer.
  const refs = useMemo(() => ({
    path: { get current() { return session.active?.path ?? null; }, set current(path: string | null) { setActiveFilePath(path); } },
    saved: { get current() { return session.active?.baseline ?? null; }, set current(text: string | null) { if (session.active && text !== null) session.acknowledge(session.active.id, text); } },
    buffer: { get current() { return session.active?.text ?? null; }, set current(text: string | null) { if (session.active?.readOnly && text !== null && text === session.active.baseline) session.reload(session.active.id, text, true); else setActiveFileContent(text); } },
  }), [session, setActiveFilePath, setActiveFileContent]);
  return { session, snapshot, active, workspacePath: snapshot.root, setWorkspacePath,
    activeFilePath: active?.path ?? null, setActiveFilePath, activeFileContent: active?.text ?? null, setActiveFileContent,
    isDirty: active !== null && isDocumentDirty(active), activeFilePathRef: refs.path, savedContentRef: refs.saved, latestEditorContentRef: refs.buffer };
}
