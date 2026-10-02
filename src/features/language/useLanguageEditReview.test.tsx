import { act, renderHook, render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DocumentSession } from "../documents/DocumentSession";
import { useLanguageEditReview } from "./useLanguageEditReview";
import LanguageEditReview from "./LanguageEditReview";
const formatMock = vi.hoisted(() => vi.fn());
const importsMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/ipc/client", () => ({ formatWorkspaceDocument: formatMock, organizeWorkspaceImports: importsMock }));

it("requires review before editing and retains the original save baseline", async () => {
  const session = new DocumentSession(); session.reset("repo"); const doc = session.open("main.go", "disk"); session.edit(doc.id, "unsaved");
  formatMock.mockResolvedValue({ ok: true, data: { files: [{ path: "main.go", before: "unsaved", after: "formatted", readOnly: false }] } });
  const applied = vi.fn(); const hook = renderHook(() => useLanguageEditReview(session, session.snapshot(), applied));
  await act(() => hook.result.current.format());
  expect(session.active?.text).toBe("unsaved"); expect(applied).not.toHaveBeenCalled();
  act(() => hook.result.current.apply());
  expect(session.active?.text).toBe("formatted"); expect(session.active?.baseline).toBe("disk"); expect(session.dirty).toBe(true); expect(applied).toHaveBeenCalledOnce();
});

it("Cancel and late results after edits do not change buffers", async () => {
  const session = new DocumentSession(); session.reset("repo"); const doc = session.open("main.go", "disk");
  let resolve!: (value: unknown) => void; formatMock.mockImplementation(() => new Promise(complete => { resolve = complete; }));
  const hook = renderHook(({ snapshot }) => useLanguageEditReview(session, snapshot, vi.fn()), { initialProps: { snapshot: session.snapshot() } });
  let pending!: Promise<void>; act(() => { pending = hook.result.current.format(); });
  act(() => hook.result.current.close());
  await act(async () => { resolve({ ok: true, data: { files: [{ path: "main.go", before: "disk", after: "obsolete", readOnly: false }] } }); await pending; });
  expect(hook.result.current.state).toBeNull(); expect(session.active?.text).toBe("disk");
  act(() => { pending = hook.result.current.format(); });
  session.edit(doc.id, "newer"); hook.rerender({ snapshot: session.snapshot() });
  await act(async () => { resolve({ ok: false, error: { code: "failed", message: "obsolete error" } }); await pending; });
  expect(hook.result.current.state).toBeNull(); expect(session.active?.text).toBe("newer");
});

it("shows complete before/after and disables Apply for unavailable tooling", () => {
  const apply = vi.fn(); const close = vi.fn();
  const view = render(<LanguageEditReview state={{ loading: false, error: null, plan: { files: [{ path: "main.go", before: "before", after: "after", readOnly: false }] } }} onApply={apply} onClose={close} />);
  expect(screen.getByText("before")).toBeInTheDocument(); expect(screen.getByText("after")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Apply to Editor" })); expect(apply).toHaveBeenCalledOnce();
  view.rerender(<LanguageEditReview state={{ loading: false, error: "gopls unavailable", plan: null }} onApply={apply} onClose={close} />);
  expect(screen.getByRole("alert")).toHaveTextContent("gopls unavailable"); expect(screen.getByRole("button", { name: "Apply to Editor" })).toBeDisabled();
});

it("uses the Organize Imports endpoint and the same reviewed baseline protection", async () => {
  const session = new DocumentSession(); session.reset("repo"); session.open("main.go", "source without import");
  importsMock.mockResolvedValue({ ok: true, data: { files: [{ path: "main.go", before: "source without import", after: "source with import", readOnly: false }] } });
  const hook = renderHook(() => useLanguageEditReview(session, session.snapshot(), vi.fn()));
  await act(() => hook.result.current.organizeImports());
  expect(importsMock).toHaveBeenCalledWith(expect.objectContaining({ relativePath: "main.go" }));
  expect(hook.result.current.state?.operation).toBe("imports"); expect(session.active?.text).toBe("source without import");
  act(() => hook.result.current.apply()); expect(session.active?.text).toBe("source with import"); expect(session.active?.baseline).toBe("source without import");
});
