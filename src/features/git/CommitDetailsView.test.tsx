import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CommitDetailsView from "./CommitDetailsView";
const mocks = vi.hoisted(() => ({ details: vi.fn(), diff: vi.fn() }));
vi.mock("../../lib/ipc/git", () => ({ getGitCommitDetails: mocks.details, getGitHistoricalDiff: mocks.diff }));
const details = { hash: "hash", parents: ["first", "second"], selectedParent: "first", author: "A", email: "a@example.invalid", date: "date", message: "subject\n\nfull message", files: [{ path: "new Ω.go", originalPath: "old Ω.go", status: "R100" }] };
describe("Commit details", () => {
  beforeEach(() => { mocks.details.mockReset().mockResolvedValue({ ok: true, data: details }); mocks.diff.mockReset().mockResolvedValue({ ok: true, data: { path: "new Ω.go", originalPath: "old Ω.go", patch: "@@ -1 +1 @@\n-old\n+new", binary: false, limited: false } }); });
  it("shows full messages, rename paths and requests diffs relative to selected parents", async () => {
    render(<CommitDetailsView root="repo" hash="hash" />);
    await screen.findByText(/full message/);
    fireEvent.click(screen.getByRole("button", { name: "R100 old Ω.go → new Ω.go" }));
    await waitFor(() => expect(mocks.diff).toHaveBeenCalledWith("repo", "hash", "first", "new Ω.go"));
    await screen.findByText("+new");
    fireEvent.change(screen.getByLabelText("Compare parent"), { target: { value: "second" } });
    await waitFor(() => expect(mocks.details).toHaveBeenLastCalledWith("repo", "hash", "second"));
  });
  it("discards details that arrive after changing the selected commit", async () => {
    let finish!: (value: unknown) => void;
    mocks.details.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<CommitDetailsView root="repo" hash="stale" />);
    view.rerender(<CommitDetailsView root="repo" hash="current" />);
    await screen.findByText(/full message/);
    finish({ ok: true, data: { ...details, message: "stale message" } });
    await waitFor(() => expect(screen.queryByText("stale message")).not.toBeInTheDocument());
  });
});
