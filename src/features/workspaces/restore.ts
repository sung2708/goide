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
      const opened = documents.open(file.path, loaded.text, loaded.readOnly);
      documents.view(opened.id, file.view);
      expected = documents.snapshot();
    } catch { failures.push(file.path); }
  }
  if (alive() && documents.snapshot() === expected) {
    const active = expected.documents.find(document => document.path === stored.active);
    if (active) documents.activate(active.id);
    else if (stored.active === null) documents.deactivate();
  }
  return failures;
}
