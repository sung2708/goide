import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DocumentSession } from "./DocumentSession";
import { useOpenDocumentDiskSync } from "./useOpenDocumentDiskSync";
const read = vi.hoisted(() => vi.fn());
vi.mock("../../lib/ipc/client", () => ({ getWorkspaceFileState: read }));
beforeEach(() => { read.mockReset(); });
function setup(dirty = false) {
  const documents = new DocumentSession(); documents.reset("repo");
  const other = documents.open("other.go", "base"); if (dirty) documents.edit(other.id, "valuable");
  documents.open("active.go", "active");
  const params = { documents, snapshot: documents.snapshot(), revision: 0, blocked: false, busy: () => false, onReload: vi.fn(), onError: vi.fn() };
  return { documents, other, params, ...renderHook(p => useOpenDocumentDiskSync(p), { initialProps: params }) };
}
it("reloads inactive clean files and preserves dirty buffers for review", async () => {
  read.mockResolvedValue({ ok: true, data: { exists: true, content: "disk" } });
  const clean = setup();
  await waitFor(() => expect(clean.params.onReload).toHaveBeenCalledWith("other.go"));
  expect(clean.documents.snapshot().documents[0].text).toBe("disk");
  expect(read).toHaveBeenCalledWith("repo", "other.go"); expect(read).not.toHaveBeenCalledWith("repo", "active.go");
  clean.unmount();
  const dirty = setup(true);
  await waitFor(() => expect(dirty.result.current).toEqual([{ id: dirty.other.id, path: "other.go", exists: true }]));
  expect(dirty.documents.snapshot().documents[0].text).toBe("valuable"); expect(dirty.params.onReload).not.toHaveBeenCalled();
});
it("retains deleted clean buffers and does not clear a conflict on permission failure", async () => {
  read.mockResolvedValue({ ok: true, data: { exists: false, content: null } });
  const view = setup();
  await waitFor(() => expect(view.result.current[0]?.exists).toBe(false));
  expect(view.documents.snapshot().documents[0].text).toBe("base");
  read.mockResolvedValue({ ok: false, error: { code: "fs_read_failed", message: "permission denied" } });
  act(() => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(view.params.onError).toHaveBeenCalledWith("other.go: permission denied"));
  expect(view.result.current[0]?.exists).toBe(false);
});
it("does not overwrite typing or a newer save baseline while the read is pending", async () => {
  let finish!: (value: unknown) => void;
  read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = setup(); await waitFor(() => expect(read).toHaveBeenCalled());
  view.documents.edit(view.other.id, "new edit");
  await act(async () => { finish({ ok: true, data: { exists: true, content: "disk" } }); });
  expect(view.documents.snapshot().documents[0].text).toBe("new edit"); expect(view.result.current[0]?.path).toBe("other.go");
  act(() => window.dispatchEvent(new Event("focus")));
  view.documents.acknowledge(view.other.id, "new edit");
  await act(async () => { finish({ ok: true, data: { exists: true, content: "obsolete" } }); });
  expect(view.documents.snapshot().documents[0].baseline).toBe("new edit"); expect(view.params.onReload).not.toHaveBeenCalled();
});
it("discards reads on workspace switches and rescans after a blocked operation", async () => {
  let finish!: (value: unknown) => void;
  read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const view = setup(); await waitFor(() => expect(read).toHaveBeenCalled());
  view.documents.reset("next", true);
  view.rerender({ ...view.params, snapshot: view.documents.snapshot() });
  await act(async () => { finish({ ok: true, data: { exists: false, content: null } }); });
  expect(view.result.current).toEqual([]); expect(view.params.onReload).not.toHaveBeenCalled();
  view.unmount(); read.mockReset(); read.mockResolvedValue({ ok: true, data: { exists: true, content: "disk" } });
  const blocked = setup(); blocked.rerender({ ...blocked.params, blocked: true, busy: () => true });
  await new Promise(resolve => setTimeout(resolve, 150)); expect(read).not.toHaveBeenCalled();
  blocked.rerender(blocked.params); await waitFor(() => expect(blocked.params.onReload).toHaveBeenCalled());
});
