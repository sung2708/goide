import { expect, it, vi } from "vitest";
import { DraftJournal, DRAFT_JOURNAL_KEY } from "./DraftJournal";
import { DocumentSession } from "./DocumentSession";

function setup() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const session = new DocumentSession(); session.reset("C:/repo");
  const doc = session.open("main.go", "disk"); session.edit(doc.id, "valuable");
  return { data, storage, session, doc };
}
it("retains dirty text and original baseline across restart, never replaces pending recovery with clean startup", () => {
  const { storage, session } = setup();
  new DraftJournal(storage).capture(session.snapshot());
  const restarted = new DraftJournal(storage);
  session.reload(session.active!.id, "external", true);
  restarted.capture(session.snapshot());
  expect(restarted.pending("C:/repo")).toMatchObject([{ path: "main.go", text: "valuable", baseline: "disk" }]);
  restarted.restore(session);
  expect(session.active).toMatchObject({ text: "valuable", baseline: "disk" });
  expect(session.dirty).toBe(true);
});
it("never overwrites a dirty open buffer or removes pending recovery after a failed restore", () => {
  const { storage, session, doc } = setup(); new DraftJournal(storage).capture(session.snapshot());
  const restarted = new DraftJournal(storage);
  session.edit(doc.id, "newer");
  expect(() => restarted.restore(session)).toThrow(/dirty/i);
  expect(session.active?.text).toBe("newer");
  expect(restarted.pending("C:/repo")).toHaveLength(1);
});
it("clears saved/discarded drafts, retains other workspaces and reports quota failure without replacing stored data", async () => {
  const { data, storage, session } = setup(); const journal = new DraftJournal(storage);
  journal.capture(session.snapshot());
  await session.saveAll(async () => ({ ok: true })); journal.capture(session.snapshot());
  expect(new DraftJournal(storage).pending("C:/repo")).toEqual([]);
  session.edit(session.active!.id, "dirty"); journal.capture(session.snapshot());
  const before = data.get(DRAFT_JOURNAL_KEY);
  const failed = new DraftJournal({ ...storage, setItem: vi.fn(() => { throw new Error("quota"); }) });
  expect(() => failed.discard("C:/repo")).toThrow(/quota/i);
  expect(data.get(DRAFT_JOURNAL_KEY)).toBe(before);
  expect(failed.pending("C:/repo")).toHaveLength(1);
});
it("rejects corrupt/unbounded journals without silently overwriting them", () => {
  const storage = { getItem: () => '{"version":2}', setItem: vi.fn() };
  expect(() => new DraftJournal(storage)).toThrow(/invalid/i);
  expect(storage.setItem).not.toHaveBeenCalled();
});
