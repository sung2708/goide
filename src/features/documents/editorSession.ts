import type { EditorView } from "@codemirror/view";
import { historyField } from "@codemirror/commands";
export type EditorSessionState = { json: Record<string, unknown>; scrollTop: number; scrollLeft: number };
export const editorSessionFields = { history: historyField };
export function captureEditorSession(view: EditorView): EditorSessionState {
  return { json: view.state.toJSON(editorSessionFields) as Record<string, unknown>, scrollTop: view.scrollDOM.scrollTop, scrollLeft: view.scrollDOM.scrollLeft };
}
export function initialEditorSession(session: EditorSessionState | undefined, text: string) {
  return session?.json.doc === text ? { json: session.json, fields: editorSessionFields } : undefined;
}
