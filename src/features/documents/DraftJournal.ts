import type { DocumentSession, DocumentSnapshot } from "./DocumentSession";

export const DRAFT_JOURNAL_KEY = "goro.drafts.v1";
export type RecoveredDraft = { root: string; path: string; text: string; baseline: string; updated: number };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const LIMIT = 2_000_000;
const validPath = (path: string) => path.length > 0 && path.length <= 4096 && !/[\\\0]/.test(path) && !path.startsWith("/") && !/^[A-Za-z]:/.test(path) && !path.split("/").some(part => !part || part === "." || part === "..");
/** Local recovery only. Startup records are protected until explicit review. */
export class DraftJournal {
  private records: RecoveredDraft[];
  private protectedRoots: Set<string>;
  constructor(private storage: Storage) {
    const raw = storage.getItem(DRAFT_JOURNAL_KEY);
    if (raw && (raw.length > LIMIT || new TextEncoder().encode(raw).length > LIMIT)) throw new Error("Invalid draft journal: size limit exceeded.");
    let parsed: unknown;
    try { parsed = raw ? JSON.parse(raw) : { version: 1, drafts: [] }; }
    catch { throw new Error("Invalid draft journal. Stored data was preserved."); }
    const value = parsed as { version?: number; drafts?: RecoveredDraft[] } | null;
    if (!value || value.version !== 1 || !Array.isArray(value.drafts) || value.drafts.length > 100 || value.drafts.some(draft => !draft || typeof draft.root !== "string" || draft.root.length > 4096 || !(/^[A-Za-z]:[\\/]/.test(draft.root) || draft.root.startsWith("/")) || draft.root.includes("\0") || typeof draft.path !== "string" || !validPath(draft.path) || typeof draft.text !== "string" || typeof draft.baseline !== "string" || !Number.isFinite(draft.updated))) throw new Error("Invalid draft journal. Stored data was preserved.");
    const keys = value.drafts.map(draft => JSON.stringify([draft.root, draft.path]));
    if (new Set(keys).size !== keys.length) throw new Error("Invalid draft journal: duplicate files.");
    this.records = value.drafts;
    this.protectedRoots = new Set(this.records.map(draft => draft.root));
  }
  pending(root: string) { return this.protectedRoots.has(root) ? this.records.filter(draft => draft.root === root) : []; }
  get drafts(): readonly RecoveredDraft[] { return this.records; }
  private write(records: RecoveredDraft[]) {
    const raw = JSON.stringify({ version: 1, drafts: records });
    if (records.length > 100 || raw.length > LIMIT || new TextEncoder().encode(raw).length > LIMIT) throw new Error("Draft recovery exceeds its 2 MB / 100 file limit. Export or save your drafts.");
    this.storage.setItem(DRAFT_JOURNAL_KEY, raw);
    this.records = records;
  }
  capture(snapshot: DocumentSnapshot) {
    if (!snapshot.root || this.protectedRoots.has(snapshot.root)) return;
    const root = snapshot.root;
    const drafts = snapshot.documents.filter(document => document.text !== document.baseline).map(({ path, text, baseline }) => {
      if (!validPath(path)) throw new Error("Invalid draft path.");
      return { root, path, text, baseline, updated: Date.now() };
    });
    this.write([...this.records.filter(draft => draft.root !== root), ...drafts]);
  }
  discard(root: string) {
    this.write(this.records.filter(draft => draft.root !== root));
    this.protectedRoots.delete(root);
  }
  restore(session: DocumentSession) {
    const root = session.snapshot().root;
    if (!root) throw new Error("Open the original workspace before recovering drafts.");
    const drafts = this.pending(root);
    if (!drafts.length) return;
    session.restoreDrafts(drafts);
    this.protectedRoots.delete(root);
    try { this.capture(session.snapshot()); }
    catch (error) { this.protectedRoots.add(root); throw error; }
  }
}
