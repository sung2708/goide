import { useEffect, useRef, useState } from "react";
import { rankFiles } from "./fileRanking";
type Query = { id: number; index: string[]; query: string; recent: string[] };
/** One in-flight rank plus the latest queued query; intermediate keystrokes are discarded. */
export function useRankedFiles(index: string[], query: string, recent: string[]) {
  const generation = useRef(0), pending = useRef<Query | null>(null), schedule = useRef<(() => void) | null>(null);
  const [failedIndex, setFailedIndex] = useState<string[] | null>(null);
  const [results, setResults] = useState<{ index: string[]; query: string; files: string[] } | null>(null);
  useEffect(() => {
    if (typeof Worker === "undefined" || !index.length) return;
    setFailedIndex(null);
    let owner: Worker;
    try { owner = new Worker(new URL("./fileRanking.worker.ts", import.meta.url), { type: "module" }); }
    catch { setFailedIndex(index); return; }
    let active = true, initialized = false, busy: Query | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = () => { if (!active) return; active = false; clearTimeout(timer); owner.terminate(); setFailedIndex(index); };
    const pump = () => {
      const latest = pending.current;
      if (!active || busy || !latest || latest.index !== index) return;
      busy = latest;
      timer = setTimeout(fail, 5000);
      try { owner.postMessage({ id: latest.id, query: latest.query, recent: latest.recent, ...(initialized ? {} : { files: index }) }); initialized = true; }
      catch { fail(); }
    };
    schedule.current = pump;
    owner.onerror = fail;
    owner.onmessage = event => {
      if (!active || !busy || event.data.id !== busy.id) return;
      clearTimeout(timer); const finished = busy; busy = null;
      if (pending.current?.id === finished.id) setResults({ index, query: finished.query, files: event.data.files });
      else pump();
    };
    return () => { active = false; clearTimeout(timer); owner.terminate(); if (schedule.current === pump) schedule.current = null; };
  }, [index]);
  useEffect(() => { pending.current = { id: ++generation.current, index, query, recent }; schedule.current?.(); }, [index, query, recent]);
  const fallback = typeof Worker === "undefined" || failedIndex === index;
  const files = fallback ? rankFiles(index.slice(0, 2000), query, recent) : results?.index === index && results.query === query ? results.files : [];
  return { files, loading: !fallback && index.length > 0 && (results?.index !== index || results.query !== query),
    notice: fallback && index.length > 2000 ? "File ranking worker unavailable; only the first 2000 indexed files are searchable." : failedIndex === index ? "File ranking worker unavailable; using a bounded local fallback." : null };
}
