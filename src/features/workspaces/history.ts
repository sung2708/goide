import type { DocumentSnapshot, DocumentView } from "../documents/DocumentSession";

export const WORKSPACE_HISTORY_KEY = "goide.workspaceHistory.v1";
export type WorkspaceSession = { root: string; files: { path: string; view: DocumentView }[]; active: string | null };
type History = { version: 1; last: string | null; sessions: WorkspaceSession[] };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const empty = (): History => ({ version: 1, last: null, sessions: [] });
const validRoot = (root: unknown): root is string => typeof root === "string" && root.length <= 4096 && !root.includes("\0") && (/^[A-Za-z]:[\\/]/.test(root) || root.startsWith("/") || root.startsWith("\\\\"));
const validPath = (path: unknown): path is string => typeof path === "string" && path.length > 0 && path.length <= 4096 && !/[\\\0]/.test(path) && !path.startsWith("/") && !/^[A-Za-z]:/.test(path) && !path.split("/").some(part => !part || part === "." || part === "..");
function view(value: unknown): DocumentView {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = (key: string) => typeof record[key] === "number" && Number.isFinite(record[key]) ? Math.max(0, Math.min(record[key] as number, 1e8)) : 0;
  return { anchor: number("anchor"), head: number("head"), scrollTop: number("scrollTop"), scrollLeft: number("scrollLeft") };
}
function parse(raw: string | null): History {
  if (!raw || raw.length > 2_000_000) return empty();
  const value = JSON.parse(raw) as Partial<History>;
  if (!value || value.version !== 1 || !Array.isArray(value.sessions)) return empty();
  const roots = new Set<string>();
  const sessions: WorkspaceSession[] = [];
  for (const entry of value.sessions.slice(0, 10)) {
    if (!entry || !validRoot(entry.root) || roots.has(entry.root)) continue;
    roots.add(entry.root);
    const paths = new Set<string>();
    const files: WorkspaceSession["files"] = [];
    if (Array.isArray(entry.files)) for (const file of entry.files.slice(0, 100)) {
      if (!file || !validPath(file.path) || paths.has(file.path)) continue;
      paths.add(file.path); files.push({ path: file.path, view: view(file.view) });
    }
    sessions.push({ root: entry.root, files, active: paths.has(entry.active ?? "") ? entry.active : null });
  }
  return { version: 1, sessions, last: sessions.some(session => session.root === value.last) ? value.last! : null };
}
/** Stores only bounded navigation metadata. Buffers and runtime state never enter storage. */
export class WorkspaceHistory {
  private history: History;
  private storageFailureReported = false;
  constructor(private storage: Storage | null, private failed: (message: string) => void = () => {}) {
    try { this.history = parse(storage?.getItem(WORKSPACE_HISTORY_KEY) ?? null); }
    catch { this.history = empty(); }
  }
  get sessions() { return this.history.sessions; }
  session(root: string) { return this.history.sessions.find(session => session.root === root); }
  private write(history: History) {
    this.history = history;
    try { this.storage?.setItem(WORKSPACE_HISTORY_KEY, JSON.stringify(history)); return true; }
    catch {
      if (!this.storageFailureReported) { this.storageFailureReported = true; this.failed("Workspace history could not be saved. Editing can continue."); }
      return false;
    }
  }
  consumeStartup() {
    const root = this.history.last;
    // A failed startup is never retried automatically on the next launch.
    if (root && !this.write({ ...this.history, last: null })) return undefined;
    return root ? this.session(root) : undefined;
  }
  remember(snapshot: DocumentSnapshot) {
    if (!validRoot(snapshot.root)) return;
    const files = snapshot.documents.filter(document => validPath(document.path)).slice(0, 100).map(document => ({ path: document.path, view: view(document.view) }));
    const active = snapshot.documents.find(document => document.id === snapshot.activeId)?.path ?? null;
    const session = { root: snapshot.root, files, active: files.some(file => file.path === active) ? active : null };
    this.write({ version: 1, last: snapshot.root, sessions: [session, ...this.history.sessions.filter(entry => entry.root !== snapshot.root)].slice(0, 10) });
  }
  close() { this.write({ ...this.history, last: null }); }
  forget(root: string) { this.write({ ...this.history, last: this.history.last === root ? null : this.history.last, sessions: this.history.sessions.filter(entry => entry.root !== root) }); }
}
