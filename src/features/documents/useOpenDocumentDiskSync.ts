import { useCallback, useEffect, useRef, useState } from "react";
import { getWorkspaceFileState } from "../../lib/ipc/client";
import type { DocumentSession, DocumentSnapshot } from "./DocumentSession";

type Conflict = { id: number; path: string; exists: boolean };
type Params = { documents: DocumentSession; snapshot: DocumentSnapshot; revision: number; blocked: boolean; busy: () => boolean; onReload: (path: string) => void; onError: (message: string) => void };

/** Watch events carry a workspace revision, so inspect every inactive open
 * document. The active document has its own detailed conflict review. */
export function useOpenDocumentDiskSync(params: Params) {
  const latest = useRef(params); latest.current = params;
  const sequence = useRef(0);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const check = useCallback(async () => {
    const p = latest.current, initial = p.documents.snapshot();
    if (!initial.root || p.busy() || p.documents.saving) return;
    const id = ++sequence.current;
    const found: Conflict[] = [];
    const unchanged = () => id === sequence.current && latest.current.documents === p.documents && p.documents.snapshot().root === initial.root;
    for (const captured of initial.documents) {
      if (!unchanged() || latest.current.busy() || p.documents.saving) return;
      if (captured.id === p.documents.snapshot().activeId) continue;
      try {
        const response = await getWorkspaceFileState(initial.root, captured.path);
        if (!unchanged() || latest.current.busy() || p.documents.saving) return;
        const snapshot = p.documents.snapshot();
        const current = snapshot.documents.find(document => document.id === captured.id);
        if (!current || current.path !== captured.path || current.baseline !== captured.baseline || current.id === snapshot.activeId) continue;
        if (!response.ok || !response.data) {
          if (response.error?.code !== "fs_state_unavailable") latest.current.onError(`${captured.path}: ${response.error?.message ?? "Unable to check external changes."}`);
          // A failed read is not evidence that a conflict disappeared.
          found.push(...previousConflicts.current.filter(conflict => conflict.id === current.id));
          continue;
        }
        const disk = response.data;
        if (disk.exists && disk.content === current.baseline) continue;
        if (disk.exists && disk.content !== null && current.text === current.baseline) {
          p.documents.reload(current.id, disk.content);
          latest.current.onReload(current.path);
        } else found.push({ id: current.id, path: current.path, exists: disk.exists });
      } catch (error) {
        if (!unchanged()) return;
        latest.current.onError(`${captured.path}: ${error instanceof Error ? error.message : String(error)}`);
        found.push(...previousConflicts.current.filter(conflict => conflict.id === captured.id));
      }
    }
    if (unchanged()) setConflicts(found);
  }, []);
  const previousConflicts = useRef(conflicts); previousConflicts.current = conflicts;
  useEffect(() => { sequence.current++; setConflicts([]); }, [params.snapshot.root]);
  useEffect(() => {
    const timer = setTimeout(() => void check(), 100);
    return () => { clearTimeout(timer); sequence.current++; };
  }, [params.snapshot.root, params.snapshot.activeId, params.revision, params.blocked, check]);
  useEffect(() => {
    const focus = () => void check(); window.addEventListener("focus", focus);
    return () => { window.removeEventListener("focus", focus); sequence.current++; };
  }, [check]);
  return conflicts.filter(conflict => params.snapshot.documents.some(document => document.id === conflict.id && document.path === conflict.path) && conflict.id !== params.snapshot.activeId);
}
