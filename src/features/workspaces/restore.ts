import { DocumentSession } from "../documents/DocumentSession";
import type { WorkspaceSession } from "./history";
type Loaded = { text: string; readOnly: boolean };

/** Reads current disk contents, never retained buffers. Any intervening user
 * document change cancels the remainder without replacing that user's state. */
export async function restoreWorkspaceDocuments(documents: DocumentSession, stored: WorkspaceSession, load: (root: string, path: string) => Promise<Loaded>, alive: () => boolean = () => true) {
  let expected = documents.snapshot();
  const failures: string[] = [];
  if (expected.root !== stored.root || expected.documents.length) return failures;
  for (const file of stored.files) {
    if (!alive() || documents.snapshot() !== expected) return failures;
    try {
      const loaded = await load(stored.root, file.path);
      if (!alive() || documents.snapshot() !== expected) return failures;
      // Restore tab order without showing every file in the editor in turn.
      const opened = documents.open(file.path, loaded.text, loaded.readOnly, false);
      documents.view(opened.id, file.view);
      if (file.path === stored.active) documents.activate(opened.id);
      expected = documents.snapshot();
    } catch { failures.push(file.path); }
  }
  if (alive() && documents.snapshot() === expected) {
    if (stored.active !== null && expected.activeId === null) {
      const fallback = expected.documents[expected.documents.length - 1];
      if (fallback) documents.activate(fallback.id);
    }
  }
  return failures;
}
