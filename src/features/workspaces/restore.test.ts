import { describe, expect, it, vi } from "vitest";
import { DocumentSession } from "../documents/DocumentSession";
import { restoreWorkspaceDocuments } from "./restore";
import type { WorkspaceSession } from "./history";
const stored: WorkspaceSession = { root: "C:/project", active: "a.go", files: ["a.go", "b.go"].map(path => ({ path, view: { anchor: 100, head: 200, scrollTop: 20, scrollLeft: 0 } })) };
function session() { const documents = new DocumentSession(); documents.reset(stored.root); return documents; }
describe("session restore", () => {
  it("reads current disk content/permissions, clamps selection and restores active tab", async () => {
    const documents = session(); const load = vi.fn(async (_root: string, path: string) => ({ text: path, readOnly: path === "b.go" }));
    expect(await restoreWorkspaceDocuments(documents, stored, load)).toEqual([]);
    expect(load).toHaveBeenCalledTimes(2); expect(documents.active?.path).toBe("a.go");
    expect(documents.active?.view.anchor).toBe(4); expect(documents.dirty).toBe(false);
    expect(documents.snapshot().documents[1].readOnly).toBe(true);
  });
  it("reports each unavailable file and continues restoring accessible files", async () => {
    const documents = session();
    expect(await restoreWorkspaceDocuments(documents, stored, async (_root, path) => { if (path === "a.go") throw Error("missing"); return { text: "fresh", readOnly: false }; })).toEqual(["a.go"]);
    expect(documents.active?.path).toBe("b.go");
  });
  it("cannot overwrite a user edit made while the next file is loading", async () => {
    const documents = session();
    await restoreWorkspaceDocuments(documents, stored, async (_root, path) => {
      if (path === "b.go") documents.edit(documents.active!.id, "user edit");
      return { text: "disk", readOnly: false };
    });
    expect(documents.snapshot().documents).toHaveLength(1); expect(documents.active?.text).toBe("user edit");
  });
  it("drops pending results after workspace switch or unmount", async () => {
    const documents = session(); await restoreWorkspaceDocuments(documents, stored, async () => {
      documents.reset("C:/other"); return { text: "stale", readOnly: false };
    });
    expect(documents.snapshot().documents).toEqual([]);
    documents.reset(stored.root);
    const load = vi.fn(); await restoreWorkspaceDocuments(documents, stored, load, () => false);
    expect(load).not.toHaveBeenCalled();
  });
});
