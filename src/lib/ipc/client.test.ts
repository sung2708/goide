import { describe, expect, it, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { searchWorkspaceText } from "./client";

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
