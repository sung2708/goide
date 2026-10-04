import { act, fireEvent, render, screen } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentSession } from "./DocumentSession";
import { DraftJournal, DRAFT_JOURNAL_KEY } from "./DraftJournal";
import { useDraftRecovery } from "./useDraftRecovery";
beforeEach(() => { localStorage.clear(); vi.stubGlobal("__TAURI_INTERNALS__", {}); });
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function Harness({ session, report, keep = true }: { session: DocumentSession; report: (message: string) => void; keep?: boolean }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.snapshot);
  const recovery = useDraftRecovery(session, snapshot, report, keep);
  return <>{recovery.banner}{recovery.dialog}<button onClick={recovery.open}>Review recovery</button><button onClick={() => { recovery.discardCurrent(); session.reset(null, true); }}>Discard and exit</button></>;
}
it("does not revive explicitly discarded drafts on exit, including a queued checkpoint, and retains other workspaces", () => {
  vi.useFakeTimers();
  const other = new DocumentSession(); other.reset("C:/other"); const old = other.open("main.go", "disk"); other.edit(old.id, "other draft");
  new DraftJournal(localStorage).capture(other.snapshot());
  const session = new DocumentSession(); session.reset("C:/repo"); const doc = session.open("main.go", "original");
  const view = render(<Harness session={session} report={vi.fn()} />);
  act(() => { session.edit(doc.id, "discard me"); vi.advanceTimersByTime(200); });
  act(() => session.edit(doc.id, "queued edit"));
  fireEvent.click(screen.getByRole("button", { name: "Discard and exit" }));
  act(() => vi.advanceTimersByTime(200)); view.unmount();
  const restarted = new DraftJournal(localStorage);
  expect(restarted.pending("C:/repo")).toEqual([]);
  expect(restarted.pending("C:/other")).toMatchObject([{ text: "other draft" }]);
  expect(session.snapshot().root).toBeNull();
});
it("offers explicit recovery after restart and preserves the original save baseline", () => {
  const prior = new DocumentSession(); prior.reset("C:/repo");
  const old = prior.open("main.go", "old disk"); prior.edit(old.id, "valuable draft");
  new DraftJournal(localStorage).capture(prior.snapshot());
  const restarted = new DocumentSession(); restarted.reset("C:/repo"); restarted.open("main.go", "external disk");
  render(<Harness session={restarted} report={vi.fn()} />);
  expect(screen.getByRole("region", { name: "Draft recovery" })).toBeInTheDocument();
  expect(restarted.active?.text).toBe("external disk");
  fireEvent.click(screen.getByRole("button", { name: "Restore drafts" }));
  expect(restarted.active).toMatchObject({ text: "valuable draft", baseline: "old disk" });
  expect(screen.queryByRole("region", { name: "Draft recovery" })).toBeNull();
});
it("journals edits after 200ms, ignores caret-only updates and honors the privacy switch", () => {
  vi.useFakeTimers();
  const session = new DocumentSession(); session.reset("C:/repo"); const doc = session.open("main.go", "disk");
  const report = vi.fn(); const view = render(<Harness session={session} report={report} />);
  act(() => session.edit(doc.id, "draft"));
  act(() => vi.advanceTimersByTime(199));
  expect(new DraftJournal(localStorage).pending("C:/repo")).toEqual([]);
  act(() => vi.advanceTimersByTime(1));
  expect(new DraftJournal(localStorage).pending("C:/repo")).toMatchObject([{ text: "draft" }]);
  const before = localStorage.getItem(DRAFT_JOURNAL_KEY);
  act(() => { session.view(doc.id, { anchor: 1, head: 1, scrollTop: 1, scrollLeft: 0 }); vi.advanceTimersByTime(500); });
  expect(localStorage.getItem(DRAFT_JOURNAL_KEY)).toBe(before);
  view.rerender(<Harness session={session} report={report} keep={false} />);
  act(() => { session.edit(doc.id, "private"); vi.advanceTimersByTime(200); });
  expect(localStorage.getItem(DRAFT_JOURNAL_KEY)).toBe(before);
});
it("keeps moved-workspace drafts discoverable and requires confirmation to discard them", () => {
  const prior = new DocumentSession(); prior.reset("C:/deleted"); const doc = prior.open("main.go", "disk"); prior.edit(doc.id, "draft");
  new DraftJournal(localStorage).capture(prior.snapshot());
  render(<Harness session={new DocumentSession()} report={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Review recovery" }));
  expect(screen.getByRole("dialog", { name: "Stored drafts" })).toHaveTextContent("C:/deleted / main.go");
  fireEvent.click(screen.getByRole("button", { name: /Discard stored drafts for/ }));
  expect(new DraftJournal(localStorage).pending("C:/deleted")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Confirm discard" }));
  expect(new DraftJournal(localStorage).pending("C:/deleted")).toEqual([]);
});
it("preserves corrupt storage until confirmation, then resumes journaling", () => {
  vi.useFakeTimers(); localStorage.setItem(DRAFT_JOURNAL_KEY, "broken");
  const session = new DocumentSession(); session.reset("C:/repo"); const doc = session.open("main.go", "disk");
  render(<Harness session={session} report={vi.fn()} />);
  expect(localStorage.getItem(DRAFT_JOURNAL_KEY)).toBe("broken");
  fireEvent.click(screen.getByRole("button", { name: "Review recovery" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset invalid journal…" }));
  expect(localStorage.getItem(DRAFT_JOURNAL_KEY)).toBe("broken");
  fireEvent.click(screen.getByRole("button", { name: "Confirm reset" }));
  act(() => { session.edit(doc.id, "new draft"); vi.advanceTimersByTime(200); });
  expect(new DraftJournal(localStorage).pending("C:/repo")).toMatchObject([{ text: "new draft" }]);
});
