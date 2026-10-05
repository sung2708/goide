import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";

const openMock = vi.fn();
const readMock = vi.fn();
const writeMock = vi.fn();
const branchesMock = vi.fn();
const switchMock = vi.fn();
const runMock = vi.fn();
const branchSnapshot = {
  currentBranch: "develop", isDetachedHead: false, detachedHeadRef: null,
  hasUncommittedChanges: false, changedFilesSummary: [],
  branches: [{ name: "main", kind: "local", isCurrent: false, upstream: null, isRemoteTrackingCandidate: false }],
};

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: (...args: unknown[]) => openMock(...args) }));
vi.mock("../../lib/ipc/client", async () => ({
  ...await vi.importActual("../../lib/ipc/client"),
  listWorkspaceEntries: async () => ({ ok: true, data: [] }),
  configureToolchainPaths: async (paths: import("../../lib/ipc/types").ToolPaths) => ({ ok: true, data: paths }),
  getToolchainStatus: async () => ({ ok: true, data: { go: { available: true, status: "ready" }, gopls: { available: false, status: "missing" }, delve: { available: true, status: "ready" } } }),
  readWorkspaceFile: (...args: unknown[]) => readMock(...args),
  writeWorkspaceFile: (...args: unknown[]) => writeMock(...args),
  getWorkspaceBranches: (...args: unknown[]) => branchesMock(...args),
  switchWorkspaceBranch: (...args: unknown[]) => switchMock(...args),
  runWorkspaceFile: (...args: unknown[]) => runMock(...args),
  getWorkspaceGitSnapshot: async () => ({ ok: true, data: { branch: "develop", changedFiles: [], commits: [] } }),
  fetchWorkspaceDiagnostics: async () => ({ ok: true, data: { diagnostics: [], toolingAvailability: "available" } }),
  getRuntimeAvailability: async () => ({ ok: true, data: { runtimeAvailability: "unavailable" } }),
}));
vi.mock("../../features/concurrency/useLensSignals", () => ({
  useLensSignals: () => ({ detectedConstructs: [], counterpartMappings: [], isAnalyzing: false, analysisError: null }),
}));
vi.mock("../sidebar/Explorer", () => ({
  default: ({ onOpenFile }: { onOpenFile: (path: string) => void }) => (
    <button onClick={() => onOpenFile("main.go")}>Open Main</button>
  ),
}));
vi.mock("./CodeEditor", () => ({
  default: ({ value, onChange, editable }: { value: string; onChange: (value: string) => void; editable: boolean }) => (
    <textarea aria-label="Document" readOnly={!editable} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

async function openDocument() {
  render(<EditorShell />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open workspace folder" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open Main" })); });
  return screen.findByRole("textbox", { name: "Document" });
}

async function selectMain() {
  fireEvent.click(screen.getByRole("button", { name: "Switch branch" }));
  const picker = await screen.findByRole("dialog", { name: /branch picker/i });
  await act(async () => { fireEvent.click(within(picker).getByRole("button", { name: /main/i })); });
}

describe("Release gate: branch switching document safety", () => {
  afterEach(() => { vi.useRealTimers(); });
  beforeEach(() => {
    openMock.mockReset().mockResolvedValue("C:/workspace");
    readMock.mockReset().mockResolvedValue({ ok: true, data: "develop original" });
    writeMock.mockReset().mockResolvedValue({ ok: true });
    branchesMock.mockReset().mockResolvedValue({ ok: true, data: branchSnapshot });
    switchMock.mockReset().mockResolvedValue({ ok: true, data: { ...branchSnapshot, currentBranch: "main" } });
    runMock.mockReset();
  });

  it("does not overwrite the target branch with a dirty buffer from the previous branch", async () => {
    let diskContent = "develop original";
    const writesAfterSwitch: string[] = [];
    let switched = false;
    readMock.mockImplementation(async () => ({ ok: true, data: diskContent }));
    writeMock.mockImplementation(async (_root: string, _path: string, content: string) => {
      if (switched) writesAfterSwitch.push(content);
      diskContent = content;
      return { ok: true };
    });
    switchMock.mockImplementation(async () => {
      switched = true;
      diskContent = "main branch original";
      return { ok: true, data: { ...branchSnapshot, currentBranch: "main" } };
    });

    render(<EditorShell />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open workspace folder" })); });
    screen.getByRole("button", { name: "Switch branch" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open Main" })); });
    const document = await screen.findByRole("textbox", { name: "Document" });
    fireEvent.change(document, { target: { value: "unsaved develop edits" } });
    fireEvent.click(screen.getByRole("button", { name: "Switch branch" }));
    const picker = await screen.findByRole("dialog", { name: /branch picker/i });
    fireEvent.click(within(picker).getByRole("button", { name: /main/i }));

    await waitFor(() => expect(switchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(readMock).toHaveBeenCalledTimes(2));
    expect(writesAfterSwitch, "Previous-branch edits must be saved or protected before checkout").toEqual([]);
    expect(diskContent).toBe("main branch original");
    expect(writeMock).toHaveBeenCalledWith("C:/workspace", "main.go", "unsaved develop edits", "develop original");
    expect(writeMock.mock.invocationCallOrder[0]).toBeLessThan(switchMock.mock.invocationCallOrder[0]);
  });

  it("rechecks Git after saving and requires a decision when that save dirties the worktree", async () => {
    const editor = await openDocument();
    writeMock.mockImplementation(async () => {
      branchesMock.mockResolvedValue({ ok: true, data: { ...branchSnapshot, hasUncommittedChanges: true } });
      return { ok: true };
    });
    fireEvent.change(editor, { target: { value: "valuable edits" } });
    await selectMain();
    await screen.findByRole("dialog", { name: "Branch switch confirmation" });
    expect(switchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(editor).toHaveValue("valuable edits");
    expect(switchMock).not.toHaveBeenCalled();
  });

  it.each(["commit", "stash", "discard"] as const)("saves before the explicit %s decision and never replays edits after checkout", async (action) => {
    let disk = "develop original";
    let checkedOut = false;
    const replayed: string[] = [];
    readMock.mockImplementation(async () => ({ ok: true, data: disk }));
    writeMock.mockImplementation(async (_root, _path, content: string) => {
      if (checkedOut) replayed.push(content);
      disk = content;
      return { ok: true };
    });
    switchMock.mockImplementation(async () => {
      checkedOut = true;
      disk = "main branch original";
      return { ok: true, data: { ...branchSnapshot, currentBranch: "main" } };
    });
    branchesMock.mockResolvedValue({ ok: true, data: { ...branchSnapshot, hasUncommittedChanges: true } });
    const editor = await openDocument();
    fireEvent.change(editor, { target: { value: "first edits" } });
    await selectMain();
    const dialog = await screen.findByRole("dialog", { name: "Branch switch confirmation" });
    // A buffer may change while a modal is open (for example via editor commands).
    fireEvent.change(editor, { target: { value: "latest edits" } });
    fireEvent.click(within(dialog).getByRole("button", { name: `${action[0].toUpperCase()}${action.slice(1)} changes` }));
    if (action === "commit") fireEvent.change(within(dialog).getByRole("textbox", { name: "Commit message" }), { target: { value: "Save work" } });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Confirm branch switch" })); });
    expect(writeMock).toHaveBeenLastCalledWith("C:/workspace", "main.go", "latest edits", "first edits");
    expect(switchMock).toHaveBeenCalledWith(expect.objectContaining({ preSwitchAction: action }));
    expect(replayed).toEqual([]);
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("main branch original");
  });

  it("blocks checkout and retains the dirty buffer when saving fails", async () => {
    const editor = await openDocument();
    writeMock.mockResolvedValue({ ok: false, error: { message: "Permission denied" } });
    fireEvent.change(editor, { target: { value: "valuable edits" } });
    await selectMain();
    expect(switchMock).not.toHaveBeenCalled();
    expect(editor).toHaveValue("valuable edits");
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
  });

  it("blocks checkout when newer edits arrive while the transition save is pending", async () => {
    const editor = await openDocument();
    let finish!: (value: { ok: boolean }) => void;
    writeMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.change(editor, { target: { value: "first edit" } });
    await selectMain();
    fireEvent.change(editor, { target: { value: "newer edit" } });
    await act(async () => { finish({ ok: true }); });
    expect(switchMock).not.toHaveBeenCalled();
    expect(editor).toHaveValue("newer edit");
  });

  it("locks editor/file navigation during checkout and cancels the old autosave", async () => {
    const editor = await openDocument();
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    switchMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.change(editor, { target: { value: "saved before switch" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Switch branch" })); });
    const picker = screen.getByRole("dialog", { name: /branch picker/i });
    await act(async () => { fireEvent.click(within(picker).getByRole("button", { name: /main/i })); });
    expect(editor).toHaveAttribute("readonly");
    fireEvent.change(editor, { target: { value: "late callback" } });
    fireEvent.click(screen.getByRole("button", { name: "Open Main" }));
    expect(readMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(writeMock).toHaveBeenCalledTimes(1);
    readMock.mockResolvedValue({ ok: true, data: "target content" });
    await act(async () => { finish({ ok: true, data: { ...branchSnapshot, currentBranch: "main" } }); });
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("target content");
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("retires the old document if the file is absent on the new branch", async () => {
    const editor = await openDocument();
    fireEvent.change(editor, { target: { value: "saved before switch" } });
    readMock.mockResolvedValue({ ok: false, error: { message: "File not found" } });
    await selectMain();
    expect(screen.queryByRole("textbox", { name: "Document" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("File not found");
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("reloads disk after a failed checkout because an earlier stash/discard may already have changed files", async () => {
    const editor = await openDocument();
    branchesMock.mockResolvedValue({ ok: true, data: { ...branchSnapshot, hasUncommittedChanges: true } });
    fireEvent.change(editor, { target: { value: "valuable edits" } });
    await selectMain();
    const dialog = screen.getByRole("dialog", { name: "Branch switch confirmation" });
    switchMock.mockImplementation(async () => {
      readMock.mockResolvedValue({ ok: true, data: "disk after stash" });
      return { ok: false, error: { message: "Checkout denied" } };
    });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Confirm branch switch" })); });
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("disk after stash");
    expect(screen.getByRole("button", { name: "Show application error" })).toHaveTextContent("Checkout denied");
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("blocks branch switching during an active Go run", async () => {
    await openDocument();
    let finish!: (value: { ok: boolean }) => void;
    runMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Run active Go file" })); });
    await waitFor(() => expect(runMock).toHaveBeenCalledOnce());
    // Startup acknowledges ownership before document preparation releases its lock.
    await act(async () => { finish({ ok: true }); });
    await selectMain();
    expect(switchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/stop the active run or debug session/i)).toBeInTheDocument();
  });

  it("does not lose an edit made in the microtask gap after a clean save check", async () => {
    const editor = await openDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch branch" }));
    const picker = screen.getByRole("dialog", { name: /branch picker/i });
    await act(async () => {
      fireEvent.click(within(picker).getByRole("button", { name: /main/i }));
      fireEvent.change(editor, { target: { value: "last moment edit" } });
    });
    expect(switchMock).not.toHaveBeenCalled();
    expect(editor).toHaveValue("last moment edit");
    expect(screen.getByText(/file changed while preparing/i)).toBeInTheDocument();
  });

  it("keeps confirmation open after a failed resave and allows retry without losing edits", async () => {
    branchesMock.mockResolvedValue({ ok: true, data: { ...branchSnapshot, hasUncommittedChanges: true } });
    const editor = await openDocument();
    await selectMain();
    const dialog = screen.getByRole("dialog", { name: "Branch switch confirmation" });
    fireEvent.change(editor, { target: { value: "edits during confirmation" } });
    writeMock.mockResolvedValue({ ok: false, error: { message: "Disk unavailable" } });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Confirm branch switch" })); });
    expect(switchMock).not.toHaveBeenCalled();
    expect(editor).toHaveValue("edits during confirmation");
    expect(dialog).toBeInTheDocument();
    writeMock.mockResolvedValue({ ok: true });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Confirm branch switch" })); });
    expect(switchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a clean-looking buffer while an older autosave is still writing", async () => {
    const editor = await openDocument();
    vi.useFakeTimers();
    let finish!: (value: { ok: boolean }) => void;
    writeMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.change(editor, { target: { value: "earlier edits" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    fireEvent.change(editor, { target: { value: "develop original" } });
    fireEvent.click(screen.getByRole("button", { name: "Switch branch" }));
    const picker = screen.getByRole("dialog", { name: /branch picker/i });
    await act(async () => { fireEvent.click(within(picker).getByRole("button", { name: /main/i })); });
    expect(switchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/saving is still in progress/i)).toBeInTheDocument();
    await act(async () => { finish({ ok: true }); });
    expect(editor).toHaveValue("develop original");
  });

  it("releases the transition after rejected Git IPC and permits another attempt", async () => {
    await openDocument();
    switchMock.mockRejectedValueOnce(new Error("Git transport unavailable"));
    await selectMain();
    expect(screen.getByRole("button", { name: "Show application error" })).toHaveTextContent("Git transport unavailable");
    expect(screen.getByRole("textbox", { name: "Document" })).not.toHaveAttribute("readonly");
    await selectMain();
    expect(switchMock).toHaveBeenCalledTimes(2);
  });

  it("does not apply a previous workspace's branch confirmation to a different root", async () => {
    branchesMock.mockResolvedValue({ ok: true, data: { ...branchSnapshot, hasUncommittedChanges: true } });
    await openDocument();
    await selectMain();
    openMock.mockResolvedValue("C:/another-workspace");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open workspace folder" })); });
    const dialog = screen.getByRole("dialog", { name: "Branch switch confirmation" });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Confirm branch switch" })); });
    expect(switchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/workspace changed.*select the branch again/i)).toBeInTheDocument();
  });
});
