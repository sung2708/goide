import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExternalFileState } from "./useExternalFileState";
const read = vi.hoisted(() => vi.fn());
vi.mock("../../lib/ipc/client", () => ({ getWorkspaceFileState: read }));
function setup(buffer = "base") {
  const saved = { current: "base" as string | null }, current = { current: buffer as string | null };
  const apply = vi.fn((content: string) => { saved.current = content; current.current = content; });
  const params = { root: "repo", path: "main.go", revision: 0, saved, buffer: current, busy: { current: false }, saving: { current: false }, apply, onError: vi.fn() };
  return { ...renderHook((p) => useExternalFileState(p), { initialProps: params }), params, apply };
}
describe("external document changes", () => {
  beforeEach(() => { read.mockReset(); });
  it("reloads clean buffers but retains dirty editor and disk separately", async () => {
    read.mockResolvedValue({ ok: true, data: { exists: true, content: "disk" } });
    const clean = setup();
    await act(async () => { await clean.result.current.check(); });
    expect(clean.apply).toHaveBeenCalledWith("disk"); expect(clean.result.current.conflict).toBeNull();
    clean.unmount();
    const dirty = setup("valuable");
    await act(async () => { await dirty.result.current.check(); });
    expect(dirty.apply).not.toHaveBeenCalled();
    expect(dirty.params.buffer.current).toBe("valuable");
    expect(dirty.result.current.conflict?.content).toBe("disk");
  });
  it("retains deleted buffers and never mistakes permission errors for deletion", async () => {
    read.mockResolvedValueOnce({ ok: true, data: { exists: false, content: null } });
    const view = setup("valuable");
    await act(async () => { await view.result.current.check(); });
    expect(view.result.current.conflict?.exists).toBe(false); expect(view.apply).not.toHaveBeenCalled();
    read.mockResolvedValueOnce({ ok: false, error: { code: "fs_read_failed", message: "permission denied" } });
    await act(async () => { await view.result.current.check(); });
    expect(view.params.onError).toHaveBeenCalledWith("permission denied"); expect(view.params.buffer.current).toBe("valuable");
  });
  it("ignores stale reads after file switches and edits arriving during a read", async () => {
    let finish!: (value: unknown) => void;
    read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = setup();
    let pending!: Promise<void>;
    act(() => { pending = view.result.current.check(); });
    view.params.buffer.current = "typed during read";
    await act(async () => { finish({ ok: true, data: { exists: true, content: "disk" } }); await pending; });
    expect(view.apply).not.toHaveBeenCalled(); expect(view.result.current.conflict?.content).toBe("disk");
    read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    act(() => { pending = view.result.current.check(); });
    view.rerender({ ...view.params, path: "other.go" });
    await act(async () => { finish({ ok: true, data: { exists: false, content: null } }); await pending; });
    await waitFor(() => expect(view.result.current.conflict).toBeNull());
  });
});
