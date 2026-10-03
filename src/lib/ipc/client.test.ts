import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { confirmGoModuleCleanup, runGoModuleAction, inspectGoProject, getToolchainStatus, searchWorkspaceText, startWorkspaceFsWatch, stopWorkspaceFsWatch } from "./client";

describe("ipc client searchWorkspaceText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });
  it("reports desktop-only toolchain inspection instead of invented availability", async () => {
    await expect(getToolchainStatus()).resolves.toMatchObject({ ok: false, error: { code: "toolchain_native_required" } });
    expect(invokeMock).not.toHaveBeenCalled();
  });
  it("requires native Go project inspection and forwards the typed directory/cancellation identity", async () => {
    const request = { workspaceRoot: "C:/workspace", relativeDirectory: "a", requestId: "actual-id" };
    expect(await inspectGoProject(request)).toMatchObject({ ok: false, error: { code: "go_project_native_required" } });
    expect(invokeMock).not.toHaveBeenCalled();
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({ ok: true, data: {} });
    expect(await inspectGoProject(request)).toEqual({ ok: true, data: {} });
    expect(invokeMock).toHaveBeenCalledWith("inspect_go_project", { request });
  });
  it("requires native module execution/cleanup and forwards the owned request identity", async () => {
    const request = { workspaceRoot: "C:/workspace", relativeDirectory: ".", requestId: "actual-id", action: "tidy" as const, expectedWorkFile: null };
    expect(await runGoModuleAction(request)).toMatchObject({ ok: false, error: { code: "go_module_native_required" } });
    expect(await confirmGoModuleCleanup(request)).toMatchObject({ ok: false, error: { code: "go_module_native_required" } });
    expect(invokeMock).not.toHaveBeenCalled();
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({ ok: true, data: true });
    await confirmGoModuleCleanup(request);
    expect(invokeMock).toHaveBeenCalledWith("confirm_go_module_cleanup", { request });
  });

  it("reports native search unavailable in browser preview", async () => {
    await expect(searchWorkspaceText("C:/workspace", "needle")).resolves.toEqual({
      ok: false,
      error: { code: "search_native_required", message: "Workspace search requires the desktop app." },
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("invokes the tauri command when tauri internals are available", async () => {
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({
      ok: true,
      data: { files: [{ relativePath: "main.go", matches: [{ line: 1, preview: "needle" }] }], limited: true, reason: "Result budget", scannedFiles: 200 },
    });

    await expect(searchWorkspaceText("C:/workspace", "needle")).resolves.toEqual({
      ok: true,
      data: [{ relativePath: "main.go", matches: [{ line: 1, preview: "needle" }] }],
      error: undefined,
      limited: true,
      reason: "Result budget",
    });
    expect(invokeMock).toHaveBeenCalledWith("search_workspace_text_v2", {
      workspaceRoot: "C:/workspace",
      query: "needle",
      options: { matchCase: false, wholeWord: false, useRegex: false, include: [], exclude: [] },
      requestId: expect.any(String),
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
