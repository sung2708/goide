import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ConflictEditor from "./ConflictEditor";
import { removeConflictDraft } from "./conflictDrafts";
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../lib/ipc/git", () => ({ getGitConflictContent: read }));
const transaction = vi.fn(async (operation: () => Promise<void>) => { await operation(); return true; });
beforeEach(() => { removeConflictDraft("repo", "main.go"); vi.clearAllMocks(); read.mockResolvedValue({ ok: true, data: { path: "main.go", indexSignature: "stages", base: "base", current: "ours", incoming: "theirs", result: "markers" } }); vi.spyOn(window, "confirm").mockReturnValue(true); });
it("saves without staging then stages only the separately reviewed saved result", async () => {
  const mutate = vi.fn().mockResolvedValue(true); const close = vi.fn();
  render(<ConflictEditor root="repo" path="main.go" busy={false} transaction={transaction} mutate={mutate} onClose={close} />);
  const result = await screen.findByLabelText("Conflict result");
  expect(screen.getByLabelText("Conflict base")).toHaveTextContent("base");
  fireEvent.click(screen.getByText("Accept Incoming")); expect(result).toHaveValue("theirs");
  expect(screen.getByText("Stage resolved")).toBeDisabled();
  await act(async () => { fireEvent.click(screen.getByText("Save result (keep unresolved)")); });
  expect(mutate).toHaveBeenCalledWith({ kind: "saveConflict", path: "main.go", expectedIndex: "stages", expectedDisk: "markers", result: "theirs" });
  expect(mutate).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByText("Stage resolved")); });
  expect(mutate).toHaveBeenLastCalledWith({ kind: "stageResolved", path: "main.go", expectedIndex: "stages", expectedDisk: "theirs" }); expect(close).toHaveBeenCalledOnce();
});
it("retains editable result and prevents staging after failed save", async () => {
  const mutate = vi.fn().mockResolvedValue(false);
  render(<ConflictEditor root="repo" path="main.go" busy={false} transaction={transaction} mutate={mutate} onClose={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("Conflict result"), { target: { value: "valuable edits" } });
  await act(async () => { fireEvent.click(screen.getByText("Save result (keep unresolved)")); });
  expect(screen.getByLabelText("Conflict result")).toHaveValue("valuable edits"); expect(screen.getByText("Stage resolved")).toBeDisabled();
});
it("does not fetch conflict content when preserving the editor fails", async () => {
  render(<ConflictEditor root="repo" path="main.go" busy={false} transaction={async () => { throw new Error("Save failed"); }} mutate={vi.fn()} onClose={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Save failed")); expect(read).not.toHaveBeenCalled();
});
it("retains unsaved conflict results when switching away from the Source Control panel", async () => {
  const props = { root: "repo", path: "main.go", busy: false, transaction, mutate: vi.fn(), onClose: vi.fn() };
  const view = render(<ConflictEditor {...props} />);
  fireEvent.change(await screen.findByLabelText("Conflict result"), { target: { value: "valuable unresolved draft" } }); view.unmount();
  render(<ConflictEditor {...props} />);
  expect(await screen.findByLabelText("Conflict result")).toHaveValue("valuable unresolved draft");
});
