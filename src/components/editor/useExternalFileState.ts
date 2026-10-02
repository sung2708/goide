import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { getWorkspaceFileState } from "../../lib/ipc/client";

type DiskState = { exists: boolean; content: string | null };
type Params = {
  root: string | null; path: string | null; revision: number;
  saved: MutableRefObject<string | null>; buffer: MutableRefObject<string | null>;
  busy: MutableRefObject<boolean>; saving: MutableRefObject<boolean>;
  apply: (content: string) => void; onError: (message: string) => void;
};
export function useExternalFileState(params: Params) {
  const latest = useRef(params); latest.current = params;
  const [conflict, setConflict] = useState<DiskState | null>(null);
  const request = useRef(0);
  useEffect(() => { request.current++; setConflict(null); }, [params.root, params.path]);
  const check = useCallback(async () => {
    const p = latest.current;
    if (!p.root || !p.path || p.busy.current || p.saving.current || p.saved.current === null) return;
    const id = ++request.current;
    try {
      const response = await getWorkspaceFileState(p.root, p.path);
      if (id !== request.current || latest.current.root !== p.root || latest.current.path !== p.path || p.busy.current || p.saving.current) return;
      if (!response.ok || !response.data) {
        if (response.error?.code !== "fs_state_unavailable") p.onError(response.error?.message ?? "Unable to check external file changes.");
        return;
      }
      const disk = response.data;
      if (disk.content === p.saved.current) { setConflict(null); return; }
      if (disk.exists && disk.content !== null && p.buffer.current === p.saved.current) {
        p.apply(disk.content); setConflict(null);
      } else { setConflict(disk); }
    } catch (error) { if (id === request.current) p.onError(error instanceof Error ? error.message : "Unable to check external file changes."); }
  }, []);
  useEffect(() => {
    if (!params.revision) return;
    const timer = setTimeout(() => void check(), 100);
    return () => clearTimeout(timer);
  }, [params.revision, check]);
  useEffect(() => {
    const focus = () => void check();
    window.addEventListener("focus", focus);
    return () => { window.removeEventListener("focus", focus); request.current++; };
  }, [check]);
  return { conflict, check, clear: () => setConflict(null) };
}
