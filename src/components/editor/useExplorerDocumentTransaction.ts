import { useCallback, type MutableRefObject } from "react";
import { hasConflictDraftsAt } from "../../features/git/conflictDrafts";
export type ExplorerTransaction = <T>(operation: () => Promise<T>, affectedPath?: string) => Promise<T | null>;
type Params = { root: MutableRefObject<string | null>; path: MutableRefObject<string | null>; lock: MutableRefObject<boolean>; mutation: MutableRefObject<boolean>; preserve: () => Promise<boolean>; isPreserved: () => boolean; setBusy: (busy: boolean) => void; onError: (message: string) => void };
const normalized = (path: string) => path.replace(/\\/g, "/");
export function useExplorerDocumentTransaction(p: Params): ExplorerTransaction {
  return useCallback(async <T,>(operation: () => Promise<T>, affectedPath?: string) => {
    if (!p.root.current || p.lock.current) { p.onError("Another workspace operation is in progress."); return null; }
    const root = p.root.current;
    const active = p.path.current && normalized(p.path.current);
    const affected = affectedPath && normalized(affectedPath);
    const touchesDocument = active && affected && (active === affected || active.startsWith(`${affected}/`));
    p.lock.current = true; p.setBusy(true);
    try {
      if (affected && hasConflictDraftsAt(root, affected)) {
        p.onError("Save or explicitly discard the retained Git conflict result before moving or deleting this path.");
        return null;
      }
      if (touchesDocument && (!(await p.preserve()) || !p.isPreserved())) return null;
      if (p.root.current !== root) return null;
      p.mutation.current = true;
      return await operation();
    } catch (error) { p.onError(error instanceof Error ? error.message : "Explorer operation failed."); return null; }
    finally { p.mutation.current = false; p.lock.current = false; p.setBusy(false); }
  }, [p.root, p.path, p.lock, p.mutation, p.preserve, p.isPreserved, p.setBusy, p.onError]);
}
