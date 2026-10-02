import { mutateGit, type GitConflictContent } from "../../lib/ipc/git";
type Draft = { content: GitConflictContent; result: string };
const drafts = new Map<string, Map<string, Draft>>();
export const getConflictDraft = (root: string, path: string) => drafts.get(root)?.get(path);
export const hasConflictDrafts = (root: string | null) => root !== null && (drafts.get(root)?.size ?? 0) > 0;
export function retainConflictDraft(root: string, content: GitConflictContent, result: string) {
  if (result === content.result) { removeConflictDraft(root, content.path); return; }
  let files = drafts.get(root); if (!files) { files = new Map(); drafts.set(root, files); }
  files.set(content.path, { content, result });
}
export function removeConflictDraft(root: string, path: string) { const files = drafts.get(root); files?.delete(path); if (files?.size === 0) drafts.delete(root); }
export async function saveConflictDrafts(root: string) {
  for (const [path, draft] of [...(drafts.get(root)?.entries() ?? [])]) {
    const response = await mutateGit(root, { kind: "saveConflict", path, expectedIndex: draft.content.indexSignature, expectedDisk: draft.content.result, result: draft.result });
    if (!response.ok) throw new Error(response.error?.message ?? `Cannot save conflict result ${path}.`);
    // A changed draft remains dirty even when an earlier version saved successfully.
    if (getConflictDraft(root, path) === draft) removeConflictDraft(root, path);
  }
  if (hasConflictDrafts(root)) throw new Error("Conflict result changed while saving. Review and save again.");
}
