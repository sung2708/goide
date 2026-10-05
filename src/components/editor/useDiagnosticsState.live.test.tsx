import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useDiagnosticsState } from "./useDiagnosticsState";
import { DocumentSession } from "../../features/documents/DocumentSession";
import type { DiagnosticsResponse, ApiResponse } from "../../lib/ipc/types";
const { fetch, cancel } = vi.hoisted(() => ({ fetch: vi.fn(), cancel: vi.fn(async () => ({ ok: true })) }));
vi.mock("../../lib/ipc/client", () => ({ fetchWorkspaceDiagnostics: fetch, cancelLanguageRequest: cancel }));
beforeEach(() => { fetch.mockReset().mockResolvedValue({ ok: true, data: { diagnostics: [], toolingAvailability: "available" } }); cancel.mockClear(); });
function fixture() {
  const session = new DocumentSession(); session.reset("D:/project"); session.open("main.go", "package main\n// tiếng Việt 👋\n");
  const root = { current: "D:/project" }, path = { current: "main.go" };
  const hook = renderHook(({ snapshot }) => useDiagnosticsState({ workspacePathRef: root, activeFilePathRef: path, documentSnapshot: snapshot }), { initialProps: { snapshot: session.snapshot() } });
  return { session, hook, path };
}
it("requests diagnostics from exact unsaved buffers with native cancellation identity", async () => {
  const { session, hook } = fixture(); await act(async () => hook.result.current.refreshDiagnosticsForFile("D:/project", "main.go"));
  expect(fetch).toHaveBeenCalledWith("D:/project", "main.go", expect.objectContaining({ requestId: expect.any(String), buffers: [{ path: "main.go", content: session.active!.text }] }));
  await waitFor(() => expect(hook.result.current.diagnosticsAvailability).toBe("available"));
});
it("cancels an outdated buffer and rejects its late diagnostic result", async () => {
  let finish!: (value: ApiResponse<DiagnosticsResponse>) => void;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { session, hook } = fixture(); act(() => { void hook.result.current.refreshDiagnosticsForFile("D:/project", "main.go"); }); await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  act(() => { session.edit(session.active!.id, "package main\n// fixed\n"); hook.rerender({ snapshot: session.snapshot() }); });
  await waitFor(() => expect(cancel).toHaveBeenCalledOnce()); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await act(async () => finish({ ok: true, data: { toolingAvailability: "available", diagnostics: [{ severity: "error", message: "obsolete", range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } }] } }));
  expect(hook.result.current.diagnostics).toEqual([]);
});
it("does not request Go diagnostics for Markdown or a closed active document", async () => {
  const { session, hook, path } = fixture(); session.open("README.md", "# title"); path.current = "README.md"; hook.rerender({ snapshot: session.snapshot() });
  await new Promise(resolve => setTimeout(resolve, 250)); expect(fetch).not.toHaveBeenCalled(); session.deactivate(); hook.rerender({ snapshot: session.snapshot() }); await new Promise(resolve => setTimeout(resolve, 250)); expect(fetch).not.toHaveBeenCalled();
});
