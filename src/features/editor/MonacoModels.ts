import type * as Monaco from "monaco-editor";
import type { DocumentSnapshot } from "../documents/DocumentSession";
import { editorFileUri } from "./uri";

type Entry = { model: Monaco.editor.ITextModel; view: Monaco.editor.ICodeEditorViewState | null };
/** Owns live document models and their undo stacks; tabs own neither editors nor models. */
export class MonacoModels {
  private entries = new Map<string, Entry>();
  constructor(private api: typeof Monaco) {}
  sync(snapshot: DocumentSnapshot, cursor?: { model: Monaco.editor.ITextModel; selections: Monaco.Selection[] }) {
    const current = new Set<string>();
    if (snapshot.root) for (const document of snapshot.documents) {
      const uri = editorFileUri(snapshot.root, document.path);
      current.add(uri);
      const entry = this.entries.get(uri);
      if (!entry) {
        const model = this.api.editor.createModel(editorText(document.text), /\.go$/i.test(document.path) ? "go" : /\.(md|markdown)$/i.test(document.path) ? "markdown" : "plaintext", this.api.Uri.parse(uri));
        this.entries.set(uri, { model, view: null });
      } else if (entry.model.getValue() !== editorText(document.text)) {
        // Reviewed edits and external reloads are undoable; ordinary keystrokes
        // already changed the model and therefore never enter this branch.
        entry.model.pushStackElement();
        entry.model.pushEditOperations(cursor?.model === entry.model ? cursor.selections : [], [{ range: entry.model.getFullModelRange(), text: editorText(document.text) }], () => null);
        const newline = /\r\n|\r|\n/.exec(document.text)?.[0];
        if (newline && newline !== entry.model.getEOL()) entry.model.pushEOL(newline === "\r\n" ? this.api.editor.EndOfLineSequence.CRLF : this.api.editor.EndOfLineSequence.LF);
        entry.model.pushStackElement();
      }
    }
    for (const [uri, entry] of this.entries) if (!current.has(uri)) { entry.model.dispose(); this.entries.delete(uri); }
  }
  get(root: string, path: string) { return this.entries.get(editorFileUri(root, path)) ?? null; }
  dispose() { for (const entry of this.entries.values()) entry.model.dispose(); this.entries.clear(); }
  get size() { return this.entries.size; }
}

/** BOM belongs to file serialization, not Monaco's visible UTF-16 offsets. */
export function editorText(text: string) { return text.startsWith("\uFEFF") ? text.slice(1) : text; }
export function documentText(text: string, baseline: string) { return baseline.startsWith("\uFEFF") ? `\uFEFF${text}` : text; }
