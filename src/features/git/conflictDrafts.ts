import { mutateGit, type GitConflictContent } from "../../lib/ipc/git";
type Draft = { content: GitConflictContent; result: string };
const drafts = new Map<string, Map<string, Draft>>();
export const getConflictDraft = (root: string, path: string) => drafts.get(root)?.get(path);
export const hasConflictDrafts = (root: string | null) => root !== null && (drafts.get(root)?.size ?? 0) > 0;
export function discardConflictDrafts(root: string | null) { if (root !== null) drafts.delete(root); }
export function hasConflictDraftsAt(root: string | null, path: string): boolean {
  const affected = path.replace(/\\/g, "/").toLowerCase();
  return root !== null && [...(drafts.get(root)?.keys() ?? [])].some(file => {
    const normalized = file.replace(/\\/g, "/").toLowerCase();
    return normalized === affected || normalized.startsWith(`${affected}/`);
  });
}
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
    const current = getConflictDraft(root, path);
    if (current === draft) removeConflictDraft(root, path);
    else if (current && current.content.indexSignature === draft.content.indexSignature && current.content.result === draft.content.result) {
      // The disk baseline advances even when a newer in-memory result survives.
      // Retrying must compare against the version this save actually wrote.
      retainConflictDraft(root, { ...current.content, result: draft.result }, current.result);
    }
  }
  if (hasConflictDrafts(root)) throw new Error("Conflict result changed while saving. Review and save again.");
}
