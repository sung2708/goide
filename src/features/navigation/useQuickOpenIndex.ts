import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { indexWorkspace, rankFiles, type FileIndex } from "./quickOpen";

type Cache = FileIndex & { root: string; revision: number };
export function useQuickOpenIndex(root: string | null, revision: number, open: boolean, query: string) {
  const cache = useRef<Cache | null>(null);
  const epoch = useRef(0);
  const [index, setIndex] = useState<FileIndex & { root?: string }>({ files: [], notice: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    setIndex({ files: [], notice: null }); setError(null); setRecent([]);
    if (root) {
      try {
        const value: unknown = JSON.parse(localStorage.getItem(`goide.recentFiles:${root}`) ?? "[]");
        if (Array.isArray(value)) setRecent(value.filter((path): path is string => typeof path === "string").slice(0, 30));
      } catch { /* Recent files are optional; a corrupt setting must not prevent navigation. */ }
    }
  }, [root]);
  useEffect(() => {
    const request = ++epoch.current;
    if (!open || !root) { setLoading(false); return; }
    if (cache.current?.root === root && cache.current.revision === revision) {
      setIndex(cache.current); setLoading(false); setError(null); return;
    }
    setLoading(true); setError(null);
    void indexWorkspace(root, () => epoch.current !== request).then(value => {
      if (epoch.current !== request) return;
      cache.current = { ...value, root, revision }; setIndex({ ...value, root });
    }).catch((failure: unknown) => {
      if (epoch.current === request) { setIndex({ files: [], notice: null }); setError(failure instanceof Error ? failure.message : "File indexing failed."); }
    }).finally(() => { if (epoch.current === request) setLoading(false); });
    return () => { if (epoch.current === request) ++epoch.current; };
  }, [root, revision, open]);
  const remember = useCallback((path: string) => {
    setRecent(previous => {
      const next = [path, ...previous.filter(item => item !== path)].slice(0, 30);
      if (root) { try { localStorage.setItem(`goide.recentFiles:${root}`, JSON.stringify(next)); } catch { /* Optional preference storage. */ } }
      return next;
    });
  }, [root]);
  const files = useMemo(() => root === index.root ? rankFiles(index.files, query, recent) : [], [root, index, query, recent]);
  return { files, loading, error, notice: index.notice, remember };
}
