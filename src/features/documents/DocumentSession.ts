import type { ApiResponse } from "../../lib/ipc/types";
import type { EditorSessionState } from "./editorSession";

export type DocumentView = { anchor: number; head: number; scrollTop: number; scrollLeft: number };
export type OpenDocument = Readonly<{
  id: number; path: string; text: string; baseline: string; version: number;
  readOnly: boolean; view: Readonly<DocumentView>;
}>;
export type DocumentSnapshot = { root: string | null; activeId: number | null; documents: readonly OpenDocument[] };
export type ReviewedDocumentEdit = { path: string; before: string; after: string; readOnly?: boolean };
type Writer = (root: string, path: string, text: string, baseline: string) => Promise<ApiResponse<unknown>>;
export const isDocumentDirty = (document: OpenDocument) => document.text !== document.baseline;

/** Owns document buffers; React and CodeMirror render this session's snapshots. */
export class DocumentSession {
  private state: DocumentSnapshot = { root: null, activeId: null, documents: [] };
  private listeners = new Set<() => void>();
  private pending = new Set<number>();
  private nextId = 0;
  private editors = new Map<number, EditorSessionState>();
  editor(id: number) { return this.editors.get(id); }
  retainEditor(id: number, state: EditorSessionState) {
    if (this.state.documents.some(document => document.id === id)) this.editors.set(id, state);
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private publish(state: DocumentSnapshot) { this.state = state; this.listeners.forEach(listener => listener()); }
  get active() { return this.state.documents.find(document => document.id === this.state.activeId) ?? null; }
  get dirty() { return this.state.documents.some(isDocumentDirty); }
  get saving() { return this.pending.size > 0; }
  reset(root: string | null, discard = false) {
    if (this.saving) throw new Error("Wait for document saves before changing workspace.");
    if (this.dirty && !discard) throw new Error("Save or explicitly discard all dirty documents before changing workspace.");
    this.editors.clear(); this.publish({ root, activeId: null, documents: [] });
  }
  open(path: string, text: string, readOnly = false) {
    if (!this.state.root) throw new Error("Open a workspace first.");
    const existing = this.state.documents.find(document => document.path === path);
    if (existing) { this.activate(existing.id); return existing; }
    if (this.state.documents.length >= 100) throw new Error("Close an editor tab before opening more than 100 documents.");
    const document: OpenDocument = { id: ++this.nextId, path, text, baseline: text, version: 0, readOnly, view: { anchor: 0, head: 0, scrollTop: 0, scrollLeft: 0 } };
    this.publish({ ...this.state, activeId: document.id, documents: [...this.state.documents, document] });
    return document;
  }
  activate(id: number) {
    if (!this.state.documents.some(document => document.id === id)) throw new Error("Document is no longer open.");
    this.publish({ ...this.state, activeId: id });
  }
  deactivate() { this.publish({ ...this.state, activeId: null }); }
  acknowledge(id: number, baseline: string) { this.update(id, document => ({ ...document, baseline })); }
  setReadOnly(id: number, readOnly: boolean) { this.update(id, document => ({ ...document, readOnly })); }
  private update(id: number, change: (document: OpenDocument) => OpenDocument) {
    this.publish({ ...this.state, documents: this.state.documents.map(document => document.id === id ? change(document) : document) });
  }
  edit(id: number, text: string) {
    const document = this.state.documents.find(item => item.id === id);
    if (!document) throw new Error("Document is no longer open.");
    if (document.text === text) return;
    if (document.readOnly) throw new Error("Document is read only.");
    this.update(id, current => ({ ...current, text, version: current.version + 1 }));
  }
  /** Validate the complete review before publishing any changed buffers. Disk
   * writes remain explicit Save/Save All operations with the original baseline. */
  applyReviewedEdits(expected: DocumentSnapshot, changes: readonly ReviewedDocumentEdit[]) {
    if (!this.state.root || this.state !== expected) throw new Error("Documents changed after this edit was prepared. Request a new preview.");
    if (this.saving) throw new Error("Wait for document saves before applying workspace edits.");
    const unique = new Map<string, ReviewedDocumentEdit>();
    for (const change of changes) {
      if (!change.path || change.path.startsWith("/") || /^[A-Za-z]:/.test(change.path) || change.path.includes("\\") || change.path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Workspace edit contains an invalid relative path.");
      if (unique.has(change.path)) throw new Error("Workspace edit contains a duplicate file.");
      const document = this.state.documents.find(document => document.path === change.path);
      if (change.readOnly || document?.readOnly) throw new Error(`Cannot edit read-only file: ${change.path}`);
      if (document && document.text !== change.before) throw new Error(`Document changed after preview: ${change.path}`);
      unique.set(change.path, change);
    }
    const unopened = changes.filter(change => !this.state.documents.some(document => document.path === change.path));
    if (this.state.documents.length + unopened.length > 100) throw new Error("Workspace edit exceeds the 100 document limit.");
    const documents = this.state.documents.map(document => {
      const change = unique.get(document.path);
      return !change || change.after === document.text ? document : { ...document, text: change.after, version: document.version + 1 };
    });
    for (const change of unopened) {
      documents.push({ id: ++this.nextId, path: change.path, text: change.after, baseline: change.before, version: 1, readOnly: false, view: { anchor: 0, head: 0, scrollTop: 0, scrollLeft: 0 } });
    }
    this.publish({ ...this.state, documents });
  }
  view(id: number, view: DocumentView) {
    this.update(id, document => ({ ...document, view: { anchor: Math.max(0, Math.min(view.anchor, document.text.length)), head: Math.max(0, Math.min(view.head, document.text.length)), scrollTop: Math.max(0, view.scrollTop), scrollLeft: Math.max(0, view.scrollLeft) } }));
  }
  reload(id: number, text: string, discard = false) {
    const document = this.state.documents.find(item => item.id === id);
    if (!document) throw new Error("Document is no longer open.");
    if (this.pending.has(id)) throw new Error("Wait for the pending document save.");
    if (isDocumentDirty(document) && !discard) throw new Error("Review external changes before discarding the editor buffer.");
    this.update(id, current => ({ ...current, text, baseline: text, version: current.version + 1 }));
  }
  close(id: number, discard = false) {
    const document = this.state.documents.find(item => item.id === id);
    if (!document) return;
    if (this.pending.has(id)) throw new Error("Wait for the pending document save.");
    if (isDocumentDirty(document) && !discard) throw new Error("Save or explicitly discard this document before closing.");
    const documents = this.state.documents.filter(item => item.id !== id);
    this.editors.delete(id);
    this.publish({ ...this.state, documents, activeId: this.state.activeId === id ? documents[documents.length - 1]?.id ?? null : this.state.activeId });
  }
  async save(id: number, writer: Writer): Promise<void> {
    const document = this.state.documents.find(item => item.id === id), root = this.state.root;
    if (!document || !root) throw new Error("Document is no longer open.");
    if (!isDocumentDirty(document)) return;
    if (document.readOnly) throw new Error(`Cannot save read-only document ${document.path}.`);
    if (this.pending.has(id)) throw new Error(`Save already in progress for ${document.path}.`);
    this.pending.add(id);
    try {
      const response = await writer(root, document.path, document.text, document.baseline);
      if (!response.ok) throw new Error(response.error?.message ?? `Cannot save ${document.path}.`);
      if (this.state.root !== root || !this.state.documents.some(item => item.id === id)) throw new Error("Document context changed while saving.");
      // Acknowledge only the written snapshot; newer edits remain dirty.
      this.update(id, current => ({ ...current, baseline: document.text }));
    } finally { this.pending.delete(id); }
  }
  async saveAll(writer: Writer) {
    const documents = this.state.documents.filter(isDocumentDirty);
    for (const document of documents) await this.save(document.id, writer);
    if (this.dirty) throw new Error("Documents changed while saving. Save again before continuing.");
  }
  remap(previous: string, next: string) {
    if (this.saving) throw new Error("Wait for document saves before moving files.");
    const mapping = this.state.documents.map(document => document.path === previous || document.path.startsWith(`${previous}/`) ? { ...document, path: next + document.path.slice(previous.length) } : document);
    if (new Set(mapping.map(document => document.path)).size !== mapping.length) throw new Error("An open destination document already exists.");
    this.publish({ ...this.state, documents: mapping });
  }
}
