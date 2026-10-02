import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceFsSync } from "./useWorkspaceFsSync";

const { start, stop, listen, dispose } = vi.hoisted(() => ({
  start: vi.fn(), stop: vi.fn(), listen: vi.fn(), dispose: vi.fn(),
}));
vi.mock("../../lib/ipc/client", () => ({ startWorkspaceFsWatch: start, stopWorkspaceFsWatch: stop }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const started = (workspaceRoot = "D:/workspace", watchId = "watch-a") => ({
  ok: true, data: { workspaceRoot, watchId, mode: "watch" as const },
});

describe("workspace filesystem sync lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    start.mockResolvedValue(started());
    stop.mockResolvedValue({ ok: true });
    listen.mockResolvedValue(dispose);
  });

  it("subscribes before starting and stops the backend watcher on unmount", async () => {
    const error = vi.fn();
    const hook = renderHook(() => useWorkspaceFsSync({
      workspacePath: "D:/workspace", workspacePathRef: { current: "D:/workspace" },
      onWorkspaceChanged: vi.fn(), onSyncError: error,
    }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(listen.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0]);
    hook.unmount();
    await waitFor(() => expect(stop).toHaveBeenCalledWith("watch-a"));
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("releases a watcher whose start resolves after unmount", async () => {
    const pending = deferred<ReturnType<typeof started>>();
    start.mockReturnValue(pending.promise);
    const hook = renderHook(() => useWorkspaceFsSync({
      workspacePath: "D:/workspace", workspacePathRef: { current: "D:/workspace" },
      onWorkspaceChanged: vi.fn(), onSyncError: vi.fn(),
    }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    hook.unmount();
    await act(async () => { pending.resolve(started()); });
    await waitFor(() => expect(stop).toHaveBeenCalledWith("watch-a"));
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("stops the previous lease before starting the next workspace", async () => {
    const pending = deferred<ReturnType<typeof started>>();
    start.mockReturnValueOnce(pending.promise).mockResolvedValue(started("D:/next", "watch-b"));
    const root = { current: "D:/workspace" };
    const hook = renderHook(({ path }) => useWorkspaceFsSync({
      workspacePath: path, workspacePathRef: root,
      onWorkspaceChanged: vi.fn(), onSyncError: vi.fn(),
    }), { initialProps: { path: root.current } });
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    root.current = "D:/next";
    hook.rerender({ path: root.current });
    await act(async () => { pending.resolve(started()); });
    await waitFor(() => expect(start).toHaveBeenCalledWith("D:/next"));
    expect(stop).toHaveBeenCalledWith("watch-a");
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[1]);
    hook.unmount();
    await waitFor(() => expect(stop).toHaveBeenCalledWith("watch-b"));
  });

  it("does not start a watcher after a pending listener is disposed", async () => {
    const pending = deferred<() => void>();
    listen.mockReturnValue(pending.promise);
    const hook = renderHook(() => useWorkspaceFsSync({
      workspacePath: "D:/workspace", workspacePathRef: { current: "D:/workspace" },
      onWorkspaceChanged: vi.fn(), onSyncError: vi.fn(),
    }));
    await waitFor(() => expect(listen).toHaveBeenCalled());
    hook.unmount();
    await act(async () => { pending.resolve(dispose); });
    expect(start).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("surfaces failed IPC envelopes and listener failures", async () => {
    const error = vi.fn();
    start.mockResolvedValue({ ok: false, error: { message: "permission denied" } });
    const hook = renderHook(() => useWorkspaceFsSync({
      workspacePath: "D:/workspace", workspacePathRef: { current: "D:/workspace" },
      onWorkspaceChanged: vi.fn(), onSyncError: error,
    }));
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining("permission denied")));
    hook.unmount();
    listen.mockRejectedValue(new Error("events unavailable"));
    const second = renderHook(() => useWorkspaceFsSync({
      workspacePath: "D:/workspace", workspacePathRef: { current: "D:/workspace" },
      onWorkspaceChanged: vi.fn(), onSyncError: error,
    }));
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining("events unavailable")));
    second.unmount();
  });

  it("reports cleanup failure and never claims a malformed start is successful", async () => {
    const error = vi.fn();
    const root = { current: "D:/workspace" };
    const hook = renderHook(() => useWorkspaceFsSync({
      workspacePath: root.current, workspacePathRef: root,
      onWorkspaceChanged: vi.fn(), onSyncError: error,
    }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    stop.mockResolvedValue({ ok: false, error: { message: "cleanup failed" } });
    hook.unmount();
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining("cleanup failed")));
    start.mockResolvedValue({ ok: true, data: { workspaceRoot: root.current, mode: "watch" } });
    const second = renderHook(() => useWorkspaceFsSync({
      workspacePath: root.current, workspacePathRef: root,
      onWorkspaceChanged: vi.fn(), onSyncError: error,
    }));
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining("Unable to start")));
    second.unmount();
  });

  it("filters other roots and late callbacks, and accepts Windows canonical paths", async () => {
    const changed = vi.fn();
    const root = { current: "D:/workspace" };
    const hook = renderHook(() => useWorkspaceFsSync({
      workspacePath: root.current, workspacePathRef: root,
      onWorkspaceChanged: changed, onSyncError: vi.fn(),
    }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    const handle = listen.mock.calls[0][1] as (event: { payload: { workspaceRoot: string } }) => void;
    act(() => handle({ payload: { workspaceRoot: "D:/other" } }));
    expect(changed).not.toHaveBeenCalled();
    act(() => handle({ payload: { workspaceRoot: "//?/D:/workspace/" } }));
    expect(changed).toHaveBeenCalledTimes(1);
    hook.unmount();
    act(() => handle({ payload: { workspaceRoot: "D:/workspace" } }));
    expect(changed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  it("uses the latest callback without restarting the native watcher", async () => {
    const root = { current: "D:/workspace" };
    const first = vi.fn();
    const second = vi.fn();
    const hook = renderHook(({ changed }) => useWorkspaceFsSync({
      workspacePath: root.current, workspacePathRef: root,
      onWorkspaceChanged: changed, onSyncError: vi.fn(),
    }), { initialProps: { changed: first } });
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    hook.rerender({ changed: second });
    act(() => listen.mock.calls[0][1]({ payload: { workspaceRoot: root.current } }));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
    hook.unmount();
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  it("uses the canonical root returned for an aliased workspace", async () => {
    const changed = vi.fn();
    const root = { current: "D:/workspace-alias" };
    start.mockResolvedValue(started("D:/real-workspace"));
    const hook = renderHook(() => useWorkspaceFsSync({
      workspacePath: root.current, workspacePathRef: root,
      onWorkspaceChanged: changed, onSyncError: vi.fn(),
    }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    act(() => listen.mock.calls[0][1]({ payload: { workspaceRoot: "D:/real-workspace" } }));
    expect(changed).toHaveBeenCalledTimes(1);
    root.current = "D:/other";
    act(() => listen.mock.calls[0][1]({ payload: { workspaceRoot: "D:/real-workspace" } }));
    expect(changed).toHaveBeenCalledTimes(1);
    hook.unmount();
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });
});
