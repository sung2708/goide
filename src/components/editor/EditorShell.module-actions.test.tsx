import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";
import { settingsStore } from "../../features/settings/SettingsStore";
import { discardConflictDrafts, hasConflictDrafts, retainConflictDraft } from "../../features/git/conflictDrafts";
import type { GitConflictContent } from "../../lib/ipc/git";
const { open, read, write, native, cancel, mutation } = vi.hoisted(() => ({ open: vi.fn(), read: vi.fn(), write: vi.fn(), native: vi.fn(), cancel: vi.fn(), mutation: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open }));
vi.mock("../../lib/ipc/git", async () => ({ ...await vi.importActual("../../lib/ipc/git"), mutateGit: mutation }));
vi.mock("../../lib/ipc/client", async () => ({
  ...await vi.importActual("../../lib/ipc/client"),
  listWorkspaceEntries: async () => ({ ok: true, data: [] }), readWorkspaceFile: read, writeWorkspaceFile: write,
  configureToolchainPaths: async () => ({ ok: true, data: {} }), cancelLanguageRequest: cancel, runGoModuleAction: native,
  inspectGoProject: async () => ({ ok: true, data: { directory: "C:/workspace", mode: "module", workFile: null, workError: null, limited: false, environment: {}, modules: [{ directory: "C:/workspace", relativeDirectory: ".", modFile: "C:/workspace/go.mod", insideWorkspace: true, modulePath: "example.test/main", goVersion: "1.21", error: null }] } }),
}));
vi.mock("../../features/concurrency/useLensSignals", () => ({ useLensSignals: () => ({ detectedConstructs: [], counterpartMappings: [], isAnalyzing: false, analysisError: null }) }));
vi.mock("../sidebar/Explorer", () => ({ default: ({ workspacePath, onOpenFile }: { workspacePath: string | null; onOpenFile: (path: string) => void }) => workspacePath ? <button onClick={() => onOpenFile("main.go")}>Open Main</button> : null }));
vi.mock("./CodeEditor", () => ({ default: ({ value, onChange, editable }: { value: string; onChange: (text: string) => void; editable: boolean }) => <div><output data-testid="module-buffer">{value}</output><button disabled={!editable} onClick={() => onChange("package main\n// retained draft\n")}>Edit Source</button></div> }));
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); settingsStore.reset(); settingsStore.update("files.autoSave", "off"); discardConflictDrafts("C:/workspace");
  open.mockResolvedValue("C:/workspace"); read.mockResolvedValue({ ok: true, data: "package main\n" }); write.mockReset().mockResolvedValue({ ok: true });
  native.mockReset().mockResolvedValue({ ok: true, data: { action: "tidy", directory: "C:/workspace", success: true, exitCode: 0, stdout: "", stderr: "" } });
  cancel.mockResolvedValue({ ok: true, data: true }); mutation.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => { cleanup(); discardConflictDrafts("C:/workspace"); });
async function setup() {
  render(<EditorShell />); const user = userEvent.setup();
  await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
  await user.click(await screen.findByRole("button", { name: "Open Main" }));
  return user;
}
async function inspect() {
  fireEvent.keyDown(document.body, { key: "P", ctrlKey: true, shiftKey: true });
  const input = await screen.findByRole("textbox", { name: "Search commands" });
  fireEvent.change(input, { target: { value: "Go: Inspect Project and Environment" } }); fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(screen.getByRole("button", { name: "Save All and Tidy Module" })).toBeEnabled());
}
it("blocks module startup after a failed canonical Save All and retains the dirty source", async () => {
  const user = await setup(); await user.click(screen.getByRole("button", { name: "Edit Source" }));
  write.mockResolvedValue({ ok: false, error: { code: "external_file_conflict", message: "external baseline changed" } });
  await inspect(); await user.click(screen.getByRole("button", { name: "Save All and Tidy Module" }));
  await waitFor(() => expect(screen.getByText(/save failed or the buffer changed/i)).toBeInTheDocument());
  expect(native).not.toHaveBeenCalled(); expect(screen.getByTestId("module-buffer")).toHaveTextContent("retained draft");
}, 20000);
it("keeps editing/close blocked until cancelled native module work acknowledges cleanup", async () => {
  const user = await setup(); await user.click(screen.getByRole("button", { name: "Edit Source" }));
  let finish!: (value: unknown) => void; native.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await inspect(); await user.click(screen.getByRole("button", { name: "Save All and Tidy Module" }));
  await waitFor(() => expect(native).toHaveBeenCalledOnce()); expect(write).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Edit Source" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Cancel module command" })); expect(cancel).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Edit Source" })).toBeDisabled();
  await act(async () => { finish({ ok: false, error: { message: "Native module command cancelled" } }); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Edit Source" })).toBeEnabled()); expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
}, 20000);
it("protects retained merge-result drafts and never starts a module action after failed conflict preservation", async () => {
  const user = await setup();
  retainConflictDraft("C:/workspace", { path: "go.mod", result: "original", indexSignature: "captured-index" } as GitConflictContent, "retained merge result");
  mutation.mockResolvedValue({ ok: false, error: { code: "git_failed", message: "Conflict baseline changed" } });
  await inspect(); await user.click(screen.getByRole("button", { name: "Save All and Tidy Module" }));
  await waitFor(() => expect(mutation).toHaveBeenCalledWith("C:/workspace", expect.objectContaining({ kind: "saveConflict", path: "go.mod", result: "retained merge result" })));
  await waitFor(() => expect(screen.getByText(/save failed or the buffer changed/i)).toBeInTheDocument());
  expect(native).not.toHaveBeenCalled(); expect(hasConflictDrafts("C:/workspace")).toBe(true);
}, 20000);
