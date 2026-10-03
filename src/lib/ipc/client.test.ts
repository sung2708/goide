import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { deactivateDeepTrace, debuggerToggleBreakpoint, debuggerContinue, debuggerPause, debuggerStepOver, debuggerStepInto, debuggerStepOut, queryDebuggerInspection, runGoTests, confirmGoTestCleanup, confirmGoModuleCleanup, runGoModuleAction, inspectGoProject, getToolchainStatus, searchWorkspaceText, startWorkspaceFsWatch, stopWorkspaceFsWatch } from "./client";

describe("ipc client searchWorkspaceText", () => {
  it("requires native debugger data and preserves the workspace and observed stop identity", async () => {
    const request = { workspaceRoot: "D:/workspace", stopToken: "session:7", query: { kind: "variables" as const, reference: 19, start: 100, indexed: true } };
    expect(await queryDebuggerInspection(request)).toMatchObject({ ok: false, error: { code: "debugger_native_required" } });
    expect(invokeMock).not.toHaveBeenCalled();
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const data = { kind: "variables", stopToken: request.stopToken, items: [], nextStart: null, limited: false };
    invokeMock.mockResolvedValue({ ok: true, data });
    expect(await queryDebuggerInspection(request)).toEqual({ ok: true, data });
    expect(invokeMock).toHaveBeenCalledWith("query_debugger_inspection", { request });
  });
  it("requires native test execution and preserves the typed target/cancellation identity", async () => {
    delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    invokeMock.mockReset();
    const request = { workspaceRoot: "C:/workspace", relativeDirectory: "a", requestId: "owned-test-id", target: "package" as const, testName: "TestActual" };
    expect(await runGoTests(request)).toMatchObject({ ok: false, error: { code: "go_test_native_required" } });
    expect(await confirmGoTestCleanup(request)).toMatchObject({ ok: false }); expect(invokeMock).not.toHaveBeenCalled();
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({ ok: true, data: true }); await runGoTests(request); await confirmGoTestCleanup(request);
    expect(invokeMock).toHaveBeenCalledWith("run_go_tests", { request }); expect(invokeMock).toHaveBeenCalledWith("confirm_go_test_cleanup", { request });
  });
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


describe("observed debugger control IPC", () => {
  beforeEach(() => { vi.clearAllMocks(); delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__; });
  it("does not invent successful breakpoint registration or Stop in preview and sends captured owners natively", async () => {
    const breakpoint = { workspaceRoot: "D:/workspace", sessionId: "actual-owner", relativePath: "main.go", line: 7 };
    const stop = { sessionId: "actual-owner" };
    expect(await debuggerToggleBreakpoint(breakpoint)).toMatchObject({ ok: false });
    expect(await deactivateDeepTrace(stop)).toMatchObject({ ok: false });
    expect(invokeMock).not.toHaveBeenCalled();
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({ ok: true });
    await debuggerToggleBreakpoint(breakpoint); await deactivateDeepTrace(stop);
    expect(invokeMock).toHaveBeenCalledWith("debugger_toggle_breakpoint", { request: breakpoint });
    expect(invokeMock).toHaveBeenCalledWith("deactivate_deep_trace", { request: stop });
  });
  it.each([
    [debuggerContinue, "debugger_continue"], [debuggerPause, "debugger_pause"],
    [debuggerStepOver, "debugger_step_over"], [debuggerStepInto, "debugger_step_into"], [debuggerStepOut, "debugger_step_out"],
  ] as const)("binds %s to the captured native session and stop", async (operation, command) => {
    const request = { workspaceRoot: "D:/workspace", sessionId: "actual-owner", stopToken: "actual-stop:3" };
    expect(await operation(request)).toMatchObject({ ok: false, error: { code: "debugger_native_required" } });
    expect(invokeMock).not.toHaveBeenCalled();
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({ ok: true });
    await operation(request);
    expect(invokeMock).toHaveBeenCalledWith(command, { request });
  });
});
