import { act, renderHook, render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DocumentSession } from "../documents/DocumentSession";
import { useCodeActions } from "./useCodeActions";
import LanguageEditReview from "./LanguageEditReview";
const mocks = vi.hoisted(() => ({ list: vi.fn(), preview: vi.fn(), cancel: vi.fn().mockResolvedValue({ ok: true, data: true }) }));
vi.mock("../../lib/ipc/client", () => ({ listWorkspaceCodeActions: mocks.list, previewWorkspaceCodeAction: mocks.preview, cancelLanguageRequest: mocks.cancel }));
const action = { title: "Actual fix", kind: "quickfix", preferred: true, disabledReason: null };
beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue({ ok: true, data: [action] }); });
it("captures current overlays and diagnostics, previews server edits, and preserves save baselines", async () => {
  const session = new DocumentSession(); session.reset("repo"); const active = session.open("main.go", "disk"); session.edit(active.id, "unsaved");
  const diagnostic = { message: "actual issue", severity: "warning" as const, range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } };
  mocks.preview.mockResolvedValue({ ok: true, data: { files: [{ path: "main.go", before: "unsaved", after: "fixed", readOnly: false }, { path: "other.go", before: "other", after: "changed", readOnly: false }] } });
  const applied = vi.fn(); const hook = renderHook(() => useCodeActions(session, session.snapshot(), 2, applied, undefined, () => [diagnostic]));
  await act(() => hook.result.current.open());
  expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ diagnostics: [diagnostic], query: expect.objectContaining({ line: 1, column: 3, buffers: [{ path: "main.go", content: "unsaved" }] }) }));
  await act(() => hook.result.current.preview(action));
  expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ action, query: expect.objectContaining({ query: expect.objectContaining({ requestId: expect.any(String) }) }) }));
  expect(session.active?.text).toBe("unsaved"); expect(applied).not.toHaveBeenCalled();
  act(() => hook.result.current.apply());
  expect(session.snapshot().documents.map(document => [document.path, document.text, document.baseline])).toEqual([["main.go", "fixed", "disk"], ["other.go", "changed", "other"]]);
  expect(session.dirty).toBe(true); expect(applied).toHaveBeenCalledOnce();
});
it("cancels list work and ignores responses after close or source changes", async () => {
  const session = new DocumentSession(); session.reset("repo"); const active = session.open("main.go", "source");
  let resolve!: (value: unknown) => void; mocks.list.mockImplementation(() => new Promise(complete => { resolve = complete; }));
  const hook = renderHook(({ snapshot }) => useCodeActions(session, snapshot, 0, vi.fn()), { initialProps: { snapshot: session.snapshot() } });
  let pending!: Promise<void>; act(() => { pending = hook.result.current.open(); }); act(() => hook.result.current.close());
  expect(mocks.cancel).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: "repo", requestId: expect.any(String) }));
  await act(async () => { resolve({ ok: true, data: [action] }); await pending; }); expect(hook.result.current.state).toBeNull();
  act(() => { pending = hook.result.current.open(); }); session.edit(active.id, "newer"); hook.rerender({ snapshot: session.snapshot() });
  await act(async () => { resolve({ ok: false, error: { message: "obsolete error" } }); await pending; });
  expect(hook.result.current.state).toBeNull(); expect(session.active?.text).toBe("newer");
});
it("does not preview invented or disabled actions and surfaces genuine preview failures", async () => {
  const session = new DocumentSession(); session.reset("repo"); session.open("main.go", "source");
  const disabled = { ...action, title: "Run a command", disabledReason: "Command workflow unavailable" };
  mocks.list.mockResolvedValue({ ok: true, data: [action, disabled] });
  const hook = renderHook(() => useCodeActions(session, session.snapshot(), 0, vi.fn()));
  await act(() => hook.result.current.open()); await act(() => hook.result.current.preview({ ...action })); await act(() => hook.result.current.preview(disabled));
  expect(mocks.preview).not.toHaveBeenCalled();
  mocks.preview.mockResolvedValue({ ok: false, error: { message: "Read-only affected file" } }); await act(() => hook.result.current.preview(action));
  expect(hook.result.current.state?.error).toBe("Read-only affected file"); act(() => hook.result.current.apply()); expect(session.active?.text).toBe("source");
});
it("invalidates a pending preview on unmount and preserves the draft", async () => {
  const session = new DocumentSession(); session.reset("repo"); session.open("main.go", "source");
  let resolve!: (value: unknown) => void; mocks.preview.mockImplementation(() => new Promise(complete => { resolve = complete; }));
  const hook = renderHook(() => useCodeActions(session, session.snapshot(), 0, vi.fn())); await act(() => hook.result.current.open());
  let pending!: Promise<void>; act(() => { pending = hook.result.current.preview(action); }); hook.unmount();
  expect(mocks.cancel).toHaveBeenCalled(); await act(async () => { resolve({ ok: true, data: { files: [] } }); await pending; }); expect(session.active?.text).toBe("source");
});
it("offers actual actions, explicit disabled reasons, and a before/after review", () => {
  const preview = vi.fn(); const view = render(<LanguageEditReview state={{ operation: "action", actions: [action, { ...action, title: "Unsupported", disabledReason: "Command workflow unavailable" }], loading: false, plan: null, error: null }} onApply={vi.fn()} onClose={vi.fn()} onPreviewAction={preview} />);
  fireEvent.click(screen.getByRole("button", { name: "Actual fix (preferred)" })); expect(preview).toHaveBeenCalledWith(action);
  expect(screen.getByRole("button", { name: "Unsupported (preferred)" })).toBeDisabled(); expect(screen.getByText("Command workflow unavailable")).toBeInTheDocument();
  view.rerender(<LanguageEditReview state={{ operation: "action", actions: [], loading: false, plan: null, error: null }} onApply={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("No code actions returned by gopls");
});