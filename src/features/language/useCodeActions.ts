import { useEffect, useRef, useState } from "react";
import { listWorkspaceCodeActions, previewWorkspaceCodeAction } from "../../lib/ipc/client";
import type { LanguageCodeAction, LanguageEditPlan, LanguageQuery, EditorDiagnostic, LanguageCodeActionQuery } from "../../lib/ipc/types";
import type { DocumentSession, DocumentSnapshot } from "../documents/DocumentSession";
import { positionAt } from "./useLanguageQueries";
import { useLanguageCancellation } from "./useLanguageCancellation";
type State = { operation: "action"; actions: LanguageCodeAction[]; title?: string; loading: boolean; error: string | null; plan: LanguageEditPlan | null; expected: DocumentSnapshot; query: LanguageCodeActionQuery };
export function useCodeActions(documents: DocumentSession, snapshot: DocumentSnapshot, cursor: number | null, onApplied: () => void, onError?: (message: string) => void, getDiagnostics: () => EditorDiagnostic[] = () => []) {
  const cancellation = useLanguageCancellation(snapshot, onError);
  const [state, setState] = useState<State | null>(null);
  const sequence = useRef(0); const current = useRef(snapshot); current.current = snapshot;
  useEffect(() => { sequence.current++; setState(null); }, [snapshot]);
  useEffect(() => () => { sequence.current++; }, []);
  const close = () => { cancellation.cancel(); sequence.current++; setState(null); };
  const open = async () => {
    const active = snapshot.documents.find(document => document.id === snapshot.activeId);
    const position = active && cursor !== null ? positionAt(active.text, cursor) : null;
    if (!snapshot.root || !active || active.readOnly || documents.saving || !position) return;
    const id = ++sequence.current; const native = cancellation.begin(snapshot.root);
    const query: LanguageQuery = { ...native, relativePath: active.path, ...position, kind: "hover", buffers: snapshot.documents.filter(document => document.path.endsWith(".go")).map(document => ({ path: document.path, content: document.text })) };
    const next: State = { operation: "action", actions: [], loading: true, error: null, plan: null, expected: snapshot, query: { query, diagnostics: getDiagnostics() } };
    setState(next);
    try {
      const response = await listWorkspaceCodeActions(next.query);
      if (sequence.current !== id || current.current !== snapshot) return;
      setState({ ...next, loading: false, actions: response.ok ? response.data ?? [] : [], error: response.ok && response.data ? null : response.error?.message ?? "gopls returned no code action list." });
    } catch (error) {
      if (sequence.current === id && current.current === snapshot) setState({ ...next, loading: false, error: String(error) });
    } finally { cancellation.complete(native.requestId); }
  };
  const preview = async (action: LanguageCodeAction) => {
    if (!state || state.loading || action.disabledReason || !state.actions.includes(action) || !state.expected.root || current.current !== state.expected) return;
    const id = ++sequence.current; const native = cancellation.begin(state.expected.root);
    const next = { ...state, title: action.title, loading: true, error: null, plan: null };
    setState(next);
    try {
      const response = await previewWorkspaceCodeAction({ query: { ...state.query, query: { ...state.query.query, ...native } }, action });
      if (sequence.current !== id || current.current !== state.expected) return;
      setState({ ...next, loading: false, plan: response.ok ? response.data ?? null : null, error: response.ok && response.data ? null : response.error?.message ?? "gopls returned no code action preview." });
    } catch (error) {
      if (sequence.current === id && current.current === state.expected) setState({ ...next, loading: false, error: String(error) });
    } finally { cancellation.complete(native.requestId); }
  };
  const apply = () => {
    if (!state?.plan || state.loading || state.error) return;
    try { documents.applyReviewedEdits(state.expected, state.plan.files); close(); onApplied(); }
    catch (error) { setState({ ...state, error: String(error) }); }
  };
  return { state, open, preview, apply, close };
}