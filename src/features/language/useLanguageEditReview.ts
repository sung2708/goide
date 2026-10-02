import { useEffect, useRef, useState } from "react";
import { formatWorkspaceDocument, organizeWorkspaceImports, previewWorkspaceRename } from "../../lib/ipc/client";
import type { LanguageEditPlan } from "../../lib/ipc/types";
import type { DocumentSession, DocumentSnapshot } from "../documents/DocumentSession";
import { positionAt } from "./useLanguageQueries";
import { useLanguageCancellation } from "./useLanguageCancellation";

export function useLanguageEditReview(documents: DocumentSession, snapshot: DocumentSnapshot, onApplied: () => void, cursorOffset: number | null = null, onError?: (message: string) => void) {
  const cancellation = useLanguageCancellation(snapshot, onError);
  const [state, setState] = useState<{ operation: "format" | "imports" | "rename"; loading: boolean; plan: LanguageEditPlan | null; error: string | null; expected: DocumentSnapshot; newName?: string; position?: { line: number; column: number } } | null>(null);
  const sequence = useRef(0);
  const current = useRef(snapshot); current.current = snapshot;
  useEffect(() => { sequence.current++; setState(null); }, [snapshot]);
  useEffect(() => () => { sequence.current++; }, []);
  const close = () => { cancellation.cancel(); sequence.current++; setState(null); };
  const prepare = async (operation: "format" | "imports") => {
    const document = snapshot.documents.find(document => document.id === snapshot.activeId);
    if (!snapshot.root || !document || document.readOnly || documents.saving) return;
    const id = ++sequence.current;
    const native = cancellation.begin(snapshot.root);
    setState({ operation, loading: true, plan: null, error: null, expected: snapshot });
    try {
      const response = await (operation === "format" ? formatWorkspaceDocument : organizeWorkspaceImports)({ ...native, relativePath: document.path, buffers: snapshot.documents.filter(document => document.path.endsWith(".go")).map(document => ({ path: document.path, content: document.text })) });
      if (id !== sequence.current || current.current !== snapshot) return;
      setState({ operation, loading: false, plan: response.ok ? response.data ?? null : null, error: response.ok && response.data ? null : response.error?.message ?? "Language server returned no edit plan.", expected: snapshot });
    } catch (error) {
      if (id === sequence.current && current.current === snapshot) setState({ operation, loading: false, plan: null, error: error instanceof Error ? error.message : String(error), expected: snapshot });
    } finally { cancellation.complete(native.requestId); }
  };
  const apply = () => {
    if (!state?.plan || state.loading) return;
    try { documents.applyReviewedEdits(state.expected, state.plan.files); close(); onApplied(); }
    catch (error) { setState({ ...state, error: error instanceof Error ? error.message : String(error) }); }
  };
  const beginRename = () => {
    const document = snapshot.documents.find(document => document.id === snapshot.activeId);
    const position = document && cursorOffset !== null ? positionAt(document.text, cursorOffset) : null;
    if (!snapshot.root || !document || document.readOnly || documents.saving || !position) return;
    cancellation.cancel(); sequence.current++;
    setState({ operation: "rename", loading: false, plan: null, error: null, expected: snapshot, newName: "", position });
  };
  const setRenameName = (newName: string) => {
    if (state?.operation !== "rename" || state.loading) return;
    sequence.current++; setState({ ...state, newName, plan: null, error: null });
  };
  const previewRename = async () => {
    if (state?.operation !== "rename" || !state.newName || !state.position || state.loading) return;
    const expected = state.expected;
    const document = expected.documents.find(document => document.id === expected.activeId);
    if (!expected.root || !document || current.current !== expected) return;
    const id = ++sequence.current;
    const native = cancellation.begin(expected.root);
    setState({ ...state, loading: true, error: null, plan: null });
    try {
      const response = await previewWorkspaceRename({ newName: state.newName, query: { ...native, relativePath: document.path, ...state.position, kind: "references", buffers: expected.documents.filter(document => document.path.endsWith(".go")).map(document => ({ path: document.path, content: document.text })) } });
      if (id !== sequence.current || current.current !== expected) return;
      setState({ ...state, loading: false, plan: response.ok ? response.data ?? null : null, error: response.ok && response.data ? null : response.error?.message ?? "Rename returned no edit plan." });
    } catch (error) {
      if (id === sequence.current && current.current === expected) setState({ ...state, loading: false, plan: null, error: error instanceof Error ? error.message : String(error) });
    } finally { cancellation.complete(native.requestId); }
  };
  return { state, format: () => prepare("format"), organizeImports: () => prepare("imports"), beginRename, previewRename, setRenameName, apply, close };
}
