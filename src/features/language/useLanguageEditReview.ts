import { useEffect, useRef, useState } from "react";
import { formatWorkspaceDocument, organizeWorkspaceImports } from "../../lib/ipc/client";
import type { LanguageEditPlan } from "../../lib/ipc/types";
import type { DocumentSession, DocumentSnapshot } from "../documents/DocumentSession";

export function useLanguageEditReview(documents: DocumentSession, snapshot: DocumentSnapshot, onApplied: () => void) {
  const [state, setState] = useState<{ operation: "format" | "imports"; loading: boolean; plan: LanguageEditPlan | null; error: string | null; expected: DocumentSnapshot } | null>(null);
  const sequence = useRef(0);
  const current = useRef(snapshot); current.current = snapshot;
  useEffect(() => { sequence.current++; setState(null); }, [snapshot]);
  useEffect(() => () => { sequence.current++; }, []);
  const close = () => { sequence.current++; setState(null); };
  const prepare = async (operation: "format" | "imports") => {
    const document = snapshot.documents.find(document => document.id === snapshot.activeId);
    if (!snapshot.root || !document || document.readOnly || documents.saving) return;
    const id = ++sequence.current;
    setState({ operation, loading: true, plan: null, error: null, expected: snapshot });
    try {
      const response = await (operation === "format" ? formatWorkspaceDocument : organizeWorkspaceImports)({ workspaceRoot: snapshot.root, relativePath: document.path, buffers: snapshot.documents.filter(document => document.path.endsWith(".go")).map(document => ({ path: document.path, content: document.text })) });
      if (id !== sequence.current || current.current !== snapshot) return;
      setState({ operation, loading: false, plan: response.ok ? response.data ?? null : null, error: response.ok && response.data ? null : response.error?.message ?? "Language server returned no edit plan.", expected: snapshot });
    } catch (error) {
      if (id === sequence.current && current.current === snapshot) setState({ operation, loading: false, plan: null, error: error instanceof Error ? error.message : String(error), expected: snapshot });
    }
  };
  const apply = () => {
    if (!state?.plan || state.loading) return;
    try { documents.applyReviewedEdits(state.expected, state.plan.files); close(); onApplied(); }
    catch (error) { setState({ ...state, error: error instanceof Error ? error.message : String(error) }); }
  };
  return { state, format: () => prepare("format"), organizeImports: () => prepare("imports"), apply, close };
}
