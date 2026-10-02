import { useEffect, useRef, useState } from "react";
import { queryWorkspaceLanguage } from "../../lib/ipc/client";
import type { LanguageQueryKind, LanguageQueryResult } from "../../lib/ipc/types";
import type { DocumentSnapshot } from "../documents/DocumentSession";
import { useLanguageCancellation } from "./useLanguageCancellation";

export function positionAt(text: string, offset: number) {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return null;
  const preceding = text.slice(0, offset);
  return { line: preceding.split("\n").length, column: offset - preceding.lastIndexOf("\n") };
}

export function useLanguageQueries(snapshot: DocumentSnapshot, cursorOffset: number | null, onError?: (message: string) => void) {
  const cancellation = useLanguageCancellation(snapshot, onError);
  const [state, setState] = useState<{ kind: LanguageQueryKind; loading: boolean; result: LanguageQueryResult | null; error: string | null } | null>(null);
  const sequence = useRef(0);
  const current = useRef(snapshot);
  current.current = snapshot;
  useEffect(() => { sequence.current += 1; setState(null); }, [snapshot]);
  useEffect(() => () => { sequence.current += 1; }, []);
  const close = () => { cancellation.cancel(); sequence.current += 1; setState(null); };
  const query = async (kind: LanguageQueryKind) => {
    const document = snapshot.documents.find(document => document.id === snapshot.activeId);
    const position = document && cursorOffset !== null ? positionAt(document.text, cursorOffset) : null;
    if (!snapshot.root || !document || !position) return;
    const id = ++sequence.current;
    const native = cancellation.begin(snapshot.root);
    setState({ kind, loading: true, result: null, error: null });
    try {
      const response = await queryWorkspaceLanguage({ ...native, relativePath: document.path, ...position, kind, buffers: snapshot.documents.filter(document => document.path.endsWith(".go")).map(document => ({ path: document.path, content: document.text })) });
      if (id !== sequence.current || current.current !== snapshot) return;
      setState({ kind, loading: false, result: response.ok ? response.data ?? null : null, error: response.ok && response.data ? null : response.error?.message ?? "Language server returned no response." });
    } catch (error) {
      if (id === sequence.current && current.current === snapshot) setState({ kind, loading: false, result: null, error: error instanceof Error ? error.message : String(error) });
    } finally { cancellation.complete(native.requestId); }
  };
  return { state, query, close };
}
