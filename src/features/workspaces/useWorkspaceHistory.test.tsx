import { StrictMode, useSyncExternalStore } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentSession } from "../documents/DocumentSession";
import { WorkspaceHistory, WORKSPACE_HISTORY_KEY } from "./history";
import { useWorkspaceHistory } from "./useWorkspaceHistory";
const native = vi.hoisted(() => ({ info: vi.fn(), read: vi.fn() }));
vi.mock("../../lib/ipc/client", () => ({ getWorkspaceFileInfo: native.info, readWorkspaceFile: native.read }));
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); vi.clearAllMocks(); });
function setup() {
  localStorage.clear(); vi.stubGlobal("__TAURI_INTERNALS__", {});
  const old = new DocumentSession(); old.reset("C:/saved"); old.open("main.go", "old content");
  new WorkspaceHistory(localStorage).remember(old.snapshot());
  native.info.mockResolvedValue({ ok: true, data: { readOnly: false } });
  native.read.mockResolvedValue({ ok: true, data: "current disk" });
  const documents = new DocumentSession(); const report = vi.fn();
  return { documents, report };
}
describe("desktop workspace restoration", () => {
  it("restores once in StrictMode and stops automatic retry after an unavailable root", async () => {
    const { documents, report } = setup(); const open = vi.fn(async () => false);
    const hook = renderHook(() => useWorkspaceHistory(documents, documents.snapshot(), open, report), { wrapper: StrictMode });
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(native.read).not.toHaveBeenCalled(); hook.unmount();
    renderHook(() => useWorkspaceHistory(documents, documents.snapshot(), open, report));
    await act(async () => { await Promise.resolve(); });
    expect(open).toHaveBeenCalledTimes(1);
    expect(new WorkspaceHistory(localStorage).sessions).toHaveLength(1);
  });
  it("restores current buffers and lets an explicit recent-workspace request retry safely", async () => {
    const { documents, report } = setup(); const open = vi.fn(async (root: string) => { documents.reset(root); return true; });
    const hook = renderHook(() => useWorkspaceHistory(documents, useSyncExternalStore(documents.subscribe, documents.snapshot), open, report));
    await waitFor(() => expect(documents.active?.text).toBe("current disk"));
    expect(documents.dirty).toBe(false); expect(report).not.toHaveBeenCalled();
    act(() => { documents.reset(null); });
    act(() => { hook.result.current.reopen("C:/saved"); });
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(native.read).toHaveBeenCalledTimes(2));
    expect(localStorage.getItem(WORKSPACE_HISTORY_KEY)).not.toContain("current disk");
  });
  it("drops disk results when the component unmounts during loading", async () => {
    const { documents, report } = setup(); let resolve!: (value: unknown) => void;
    native.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    const open = vi.fn(async (root: string) => { documents.reset(root); return true; });
    const hook = renderHook(() => useWorkspaceHistory(documents, documents.snapshot(), open, report));
    await waitFor(() => expect(native.read).toHaveBeenCalled()); hook.unmount();
    await act(async () => { resolve({ ok: true, data: "stale" }); });
    expect(documents.snapshot().documents).toEqual([]);
  });
});
