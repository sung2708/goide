import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { searchWorkspaceText, startWorkspaceFsWatch, stopWorkspaceFsWatch } from "./client";

describe("ipc client searchWorkspaceText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("returns an empty successful response when tauri internals are unavailable", async () => {
    await expect(searchWorkspaceText("C:/workspace", "needle")).resolves.toEqual({
      ok: true,
      data: [],
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("invokes the tauri command when tauri internals are available", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({
      ok: true,
      data: [{ relativePath: "main.go", matches: [{ line: 1, preview: "needle" }] }],
    });

    await expect(searchWorkspaceText("C:/workspace", "needle")).resolves.toEqual({
      ok: true,
      data: [{ relativePath: "main.go", matches: [{ line: 1, preview: "needle" }] }],
    });
    expect(invokeMock).toHaveBeenCalledWith("search_workspace_text", {
      workspaceRoot: "C:/workspace",
      query: "needle",
    });
  });
});

describe("filesystem watcher IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("does not claim a live watcher in the browser preview", async () => {
    expect(await startWorkspaceFsWatch("D:/workspace")).toMatchObject({
      ok: false, error: { code: "fs_watch_unavailable" },
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("passes the subscription ID back to native cleanup", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({ ok: true });
    await stopWorkspaceFsWatch("watch-a");
    expect(invokeMock).toHaveBeenCalledWith("stop_workspace_fs_watch", { watchId: "watch-a" });
  });
});
