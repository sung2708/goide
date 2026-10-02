import { expect, it, vi } from "vitest";
import { DocumentSession } from "./DocumentSession";
function setup() { const session = new DocumentSession(); session.reset("repo"); return session; }
it("owns independent dirty buffers, selection and viewport without rereading an open file", () => {
  const session = setup(), first = session.open("a.go", "original");
  session.edit(first.id, "valuable"); session.view(first.id, { anchor: 1, head: 5, scrollTop: 120, scrollLeft: 9 });
  session.open("b.go", "other"); session.open("a.go", "new disk data");
  expect(session.active?.text).toBe("valuable"); expect(session.active?.view.scrollTop).toBe(120); expect(session.snapshot().documents).toHaveLength(2); expect(session.dirty).toBe(true);
});
it("does not lose newer edits or advance a failed save's baseline", async () => {
  const session = setup(), document = session.open("a.go", "disk"); session.edit(document.id, "first");
  const writer = vi.fn(async () => { session.edit(document.id, "newer"); return { ok: true }; });
  await session.save(document.id, writer); expect(writer).toHaveBeenCalledWith("repo", "a.go", "first", "disk");
  expect(session.active?.baseline).toBe("first"); expect(session.active?.text).toBe("newer"); expect(session.dirty).toBe(true);
  await expect(session.save(document.id, async () => ({ ok: false, error: { code: "external_file_conflict", message: "Disk changed" } }))).rejects.toThrow("Disk changed");
  expect(session.active?.baseline).toBe("first"); expect(session.active?.text).toBe("newer");
});
it("Save All stops on failure, keeps successful files clean and failed/remaining buffers dirty", async () => {
  const session = setup(); for (const path of ["a.go", "b.go", "c.go"]) { const document = session.open(path, "disk"); session.edit(document.id, "edited"); }
  const writer = vi.fn(async (_root: string, path: string) => path === "b.go" ? { ok: false, error: { code: "denied", message: "Permission denied" } } : { ok: true });
  await expect(session.saveAll(writer)).rejects.toThrow("Permission denied"); expect(writer).toHaveBeenCalledTimes(2);
  expect(session.snapshot().documents.map(document => document.text !== document.baseline)).toEqual([false, true, true]);
});
it("requires explicit discard to close dirty tabs or change workspace and preserves other documents", () => {
  const session = setup(), first = session.open("a.go", "disk"), second = session.open("b.go", "other"); session.edit(first.id, "valuable");
  expect(() => session.close(first.id)).toThrow("explicitly discard"); expect(() => session.reset("other")).toThrow("all dirty");
  session.close(second.id); expect(session.active?.id).toBe(first.id); session.close(first.id, true); expect(session.snapshot().documents).toEqual([]);
});
it("blocks close/reset/remap while a write is pending and rejects duplicate destination identities", async () => {
  const session = setup(), document = session.open("pkg/a.go", "disk"); session.edit(document.id, "edited");
  let finish!: (value: { ok: boolean }) => void;
  const save = session.save(document.id, () => new Promise(resolve => { finish = resolve; }));
  expect(() => session.close(document.id, true)).toThrow("pending"); expect(() => session.reset("new", true)).toThrow("saves"); expect(() => session.remap("pkg", "next")).toThrow("saves");
  finish({ ok: true }); await save; session.remap("pkg", "next"); expect(session.active?.path).toBe("next/a.go");
  session.open("taken.go", "other"); expect(() => session.remap("next/a.go", "taken.go")).toThrow("already exists");
});
