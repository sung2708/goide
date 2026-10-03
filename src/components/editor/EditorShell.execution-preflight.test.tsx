import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";
import { settingsStore } from "../../features/settings/SettingsStore";
import { discardConflictDrafts, retainConflictDraft } from "../../features/git/conflictDrafts";
import type { GitConflictContent } from "../../lib/ipc/git";
const { open, read, write, run, debug, tools, mutation } = vi.hoisted(() => ({ open: vi.fn(), read: vi.fn(), write: vi.fn(), run: vi.fn(), debug: vi.fn(), tools: vi.fn(), mutation: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
vi.mock("../../lib/ipc/git", async () => ({ ...await vi.importActual("../../lib/ipc/git"), mutateGit: mutation }));
vi.mock("../panels/BottomPanel", () => ({ default: () => null }));
vi.mock("../../lib/ipc/client", async () => ({
  ...await vi.importActual("../../lib/ipc/client"), readWorkspaceFile: read, writeWorkspaceFile: write,
  configureToolchainPaths: async (paths: import("../../lib/ipc/types").ToolPaths) => ({ ok: true, data: paths }), getToolchainStatus: tools,
  runWorkspaceFile: run, startDebugSession: debug,
}));
vi.mock("../../features/concurrency/useLensSignals", () => ({ useLensSignals: () => ({ detectedConstructs: [], counterpartMappings: [], isAnalyzing: false, analysisError: null }) }));
vi.mock("../sidebar/Explorer", () => ({ default: ({ workspacePath, onOpenFile }: { workspacePath: string | null; onOpenFile: (path: string) => void }) => workspacePath ? <><button onClick={() => onOpenFile("main.go")}>Open Main</button><button onClick={() => onOpenFile("worker.go")}>Open Worker</button></> : null }));
vi.mock("./CodeEditor", () => ({ default: ({ value, onChange, editable }: { value: string; onChange: (text: string) => void; editable: boolean }) => <div><output data-testid="execution-buffer">{value}</output><button disabled={!editable} onClick={() => onChange(value + "\n// retained source\n")}>Edit Source</button></div> }));
const ready = { ok: true, data: { go: { available: true, status: "ready" }, gopls: { available: false, status: "missing" }, delve: { available: true, status: "ready" } } };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); settingsStore.reset(); settingsStore.update("files.autoSave", "off"); discardConflictDrafts("C:/workspace");
  open.mockResolvedValue("C:/workspace"); read.mockImplementation(async (_root, path) => ({ ok: true, data: `package main\n// ${path}\n` })); write.mockReset().mockResolvedValue({ ok: true });
  tools.mockReset().mockResolvedValue(ready); run.mockReset().mockResolvedValue({ ok: true }); debug.mockReset().mockResolvedValue({ ok: true, data: { mode: "deep-trace", scopeKey: "runtime_session" } });
  mutation.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => { cleanup(); discardConflictDrafts("C:/workspace"); });
async function setup() {
  render(<EditorShell />); const user = userEvent.setup();
  await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
  await user.click(await screen.findByRole("button", { name: "Open Main" }));
  return user;
}
it("does not start Run when an inactive dirty tab fails Save All, preserving that buffer", async () => {
  const user = await setup(); await user.click(screen.getByRole("button", { name: "Edit Source" }));
  await user.click(screen.getByRole("button", { name: "Open Worker" })); await user.click(screen.getByRole("button", { name: "Edit Source" }));
  await user.click(screen.getByRole("button", { name: "Open Main" }));
  write.mockImplementation(async (_root, path) => path === "worker.go" ? { ok: false, error: { code: "external_file_conflict", message: "worker baseline changed" } } : { ok: true });
  await user.click(screen.getByRole("button", { name: /run active go file$/i }));
  await waitFor(() => expect(write.mock.calls.some(call => call[1] === "worker.go")).toBe(true));
  expect(run).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit Source" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Open Worker" })); expect(screen.getByTestId("execution-buffer")).toHaveTextContent("retained source");
}, 20000);
it("saves every dirty tab and retained merge result before Debug launches", async () => {
  const user = await setup(); await user.click(screen.getByRole("button", { name: "Edit Source" }));
  await user.click(screen.getByRole("button", { name: "Open Worker" })); await user.click(screen.getByRole("button", { name: "Edit Source" }));
  retainConflictDraft("C:/workspace", { path: "merged.go", indexSignature: "actual-index", result: "old" } as GitConflictContent, "retained merge result");
  await user.click(screen.getByRole("button", { name: /debug active go file/i }));
  await waitFor(() => expect(debug).toHaveBeenCalledOnce());
  expect(write.mock.calls.map(call => call[1])).toEqual(expect.arrayContaining(["main.go", "worker.go"]));
  expect(mutation).toHaveBeenCalledWith("C:/workspace", expect.objectContaining({ kind: "saveConflict", path: "merged.go", expectedIndex: "actual-index", expectedDisk: "old", result: "retained merge result" }));
}, 20000);
it("keeps document ownership through a pending probe and does not launch after cancellation", async () => {
  const user = await setup();
  let finish!: (value: typeof ready) => void;
  tools.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await user.click(screen.getByRole("button", { name: /run active go file$/i }));
  await screen.findByRole("button", { name: "Cancel execution preparation" });
  expect(screen.getByRole("button", { name: "Edit Source" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Close main.go" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel execution preparation" }));
  await act(async () => finish(ready));
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit Source" })).toBeEnabled());
  expect(run).not.toHaveBeenCalled();
}, 20000);
it("reports missing Delve and keeps Debug unstarted", async () => {
  const user = await setup(); tools.mockResolvedValue({ ...ready, data: { ...ready.data, delve: { available: false, status: "missing", error: "Selected Delve is absent" } } });
  await user.click(screen.getByRole("button", { name: /debug active go file/i }));
  expect(await screen.findByRole("dialog", { name: /unable to start debug session/i })).toHaveTextContent("Selected Delve is absent");
  expect(debug).not.toHaveBeenCalled();
}, 20000);
