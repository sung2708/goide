import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";

const openMock = vi.fn();
const readMock = vi.fn();
const writeMock = vi.fn();
const availabilityMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: (...args: unknown[]) => openMock(...args) }));
vi.mock("../../lib/ipc/client", async () => ({
  ...await vi.importActual("../../lib/ipc/client"),
  readWorkspaceFile: (...args: unknown[]) => readMock(...args),
  writeWorkspaceFile: (...args: unknown[]) => writeMock(...args),
  fetchWorkspaceDiagnostics: async () => ({ ok: true, data: { diagnostics: [], toolingAvailability: "available" } }),
  getRuntimeAvailability: (...args: unknown[]) => availabilityMock(...args),
}));
vi.mock("../../features/concurrency/useLensSignals", () => ({
  useLensSignals: () => ({ detectedConstructs: [], counterpartMappings: [], isAnalyzing: false, analysisError: null }),
}));
vi.mock("../sidebar/Explorer", () => ({
  default: ({ workspacePath, onOpenFile }: { workspacePath: string | null; onOpenFile: (path: string) => void }) => (
    <div>
      <output data-testid="workspace">{workspacePath}</output>
      <button onClick={() => onOpenFile("main.go")}>Open Main</button>
      <button onClick={() => onOpenFile("other.go")}>Open Other</button>
    </div>
  ),
}));
vi.mock("./CodeEditor", () => ({
  default: ({ value, onChange, onSave }: { value: string; onChange: (value: string) => void; onSave: (value: string) => void }) => (
    <div>
      <textarea aria-label="Document" value={value} onChange={(event) => onChange(event.target.value)} />
      <button onClick={() => onSave(value)}>Save Document</button>
    </div>
  ),
}));

async function openMain() {
  const view = render(<EditorShell />);
  fireEvent.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
  await waitFor(() => expect(screen.getByTestId("workspace")).toHaveTextContent("C:/workspace"));
  fireEvent.click(screen.getByRole("button", { name: "Open Main" }));
  await screen.findByRole("textbox", { name: "Document" });
  return view;
}

function edit(value: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Document" }), { target: { value } });
}

describe("EditorShell document safety", () => {
  afterEach(() => { vi.useRealTimers(); });
  beforeEach(() => {
    vi.useRealTimers();
    openMock.mockReset().mockResolvedValue("C:/workspace");
    readMock.mockReset().mockImplementation(async (_root: string, path: string) => ({ ok: true, data: path === "main.go" ? "original" : "other" }));
    writeMock.mockReset().mockResolvedValue({ ok: true });
    availabilityMock.mockReset().mockResolvedValue({ ok: true, data: { runtimeAvailability: "available" } });
  });

  it("persists the old buffer before switching files and cancels its autosave", async () => {
    await openMain();
    vi.useFakeTimers();
    edit("unsaved main");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open Other" })); });
    expect(writeMock).toHaveBeenCalledWith("C:/workspace", "main.go", "unsaved main", "original");
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("other");
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the current buffer when saving before a file switch fails", async () => {
    await openMain();
    writeMock.mockResolvedValue({ ok: false, error: { code: "write_failed", message: "Permission denied" } });
    edit("valuable edits");
    fireEvent.click(screen.getByRole("button", { name: "Open Other" }));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("valuable edits");
    expect(screen.getByText(/save.*before.*switch/i)).toBeInTheDocument();
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
  });

  it("keeps the current document when the requested file cannot be read", async () => {
    await openMain();
    readMock.mockResolvedValue({ ok: false, error: { code: "read_failed", message: "Permission denied" } });
    fireEvent.click(screen.getByRole("button", { name: "Open Other" }));
    await screen.findByText("Permission denied");
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("original");
  });

  it("blocks workspace switching after a failed save", async () => {
    await openMain();
    openMock.mockResolvedValue("C:/other-workspace");
    writeMock.mockResolvedValue({ ok: false });
    edit("valuable edits");
    fireEvent.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    expect(screen.getByTestId("workspace")).toHaveTextContent("C:/workspace");
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("valuable edits");
  });

  it("does not overwrite edits made while a transition save is pending", async () => {
    await openMain();
    let finishSave!: (result: { ok: boolean }) => void;
    writeMock.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    edit("first edit");
    fireEvent.click(screen.getByRole("button", { name: "Open Other" }));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    edit("newer edit");
    await act(async () => { finishSave({ ok: true }); });
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("newer edit");
  });

  it("preserves edits made while another file is being read", async () => {
    await openMain();
    let finishRead!: (result: { ok: boolean; data: string }) => void;
    readMock.mockImplementation(() => new Promise((resolve) => { finishRead = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Open Other" }));
    await waitFor(() => expect(readMock).toHaveBeenCalledTimes(2));
    edit("edited during read");
    await act(async () => { finishRead({ ok: true, data: "other" }); });
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("edited during read");
  });

  it("does not replay an older autosave after a manual save", async () => {
    await openMain();
    vi.useFakeTimers();
    edit("saved content");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save Document" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("saves newer edits when their debounce expires during an earlier write", async () => {
    await openMain();
    vi.useFakeTimers();
    let finishSave!: (result: { ok: boolean }) => void;
    writeMock.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
    edit("first edit");
    fireEvent.click(screen.getByRole("button", { name: "Save Document" }));
    edit("newer edit");
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(writeMock).toHaveBeenCalledTimes(1);
    await act(async () => { finishSave({ ok: true }); });
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("newer edit");
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(writeMock).toHaveBeenLastCalledWith("C:/workspace", "main.go", "newer edit", "first edit");
    expect(writeMock).toHaveBeenCalledTimes(2);
  });

  it("persists the buffer before changing workspace and clears the old autosave", async () => {
    await openMain();
    vi.useFakeTimers();
    openMock.mockResolvedValue("C:/other-workspace");
    edit("saved before workspace switch");
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /open workspace/i })[0]); });
    expect(writeMock).toHaveBeenCalledWith("C:/workspace", "main.go", "saved before workspace switch", "original");
    expect(screen.getByTestId("workspace")).toHaveTextContent("C:/other-workspace");
    expect(screen.queryByRole("textbox", { name: "Document" })).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("preserves the buffer when a transition write rejects", async () => {
    await openMain();
    writeMock.mockRejectedValue(new Error("Disk unavailable"));
    edit("valuable edits");
    fireEvent.click(screen.getByRole("button", { name: "Open Other" }));
    await screen.findByText(/disk unavailable/i);
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("valuable edits");
    expect(readMock).toHaveBeenCalledTimes(1);
  });

  it("preserves the buffer when a file read rejects", async () => {
    await openMain();
    readMock.mockRejectedValue(new Error("Disk unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Open Other" }));
    await screen.findByText(/unexpected error.*loading/i);
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("original");
  });

  it("allows only one file transition while a read is pending", async () => {
    await openMain();
    let finishRead!: (result: { ok: boolean; data: string }) => void;
    readMock.mockImplementation(() => new Promise((resolve) => { finishRead = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Open Other" }));
    await waitFor(() => expect(readMock).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Open Main" }));
    expect(readMock).toHaveBeenCalledTimes(2);
    await act(async () => { finishRead({ ok: true, data: "other" }); });
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("other");
  });

  it("does not schedule another autosave when a pending write finishes after unmount", async () => {
    const view = await openMain();
    vi.useFakeTimers();
    let finishSave!: (result: { ok: boolean }) => void;
    writeMock.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
    edit("first edit");
    fireEvent.click(screen.getByRole("button", { name: "Save Document" }));
    edit("newer edit");
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    view.unmount();
    await act(async () => { finishSave({ ok: true }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("reports an initial read failure when no document is open", async () => {
    readMock.mockResolvedValue({ ok: false, error: { code: "read_failed", message: "Permission denied" } });
    render(<EditorShell />);
    fireEvent.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
    await waitFor(() => expect(screen.getByTestId("workspace")).toHaveTextContent("C:/workspace"));
    fireEvent.click(screen.getByRole("button", { name: "Open Main" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Permission denied");
    expect(screen.queryByRole("textbox", { name: "Document" })).not.toBeInTheDocument();
  });

  it("allows file switching during a pending toolchain probe and ignores its stale result", async () => {
    let finishProbe!: (result: { ok: boolean; data: { runtimeAvailability: string } }) => void;
    availabilityMock.mockImplementationOnce(() => new Promise((resolve) => { finishProbe = resolve; }));
    await openMain();
    availabilityMock.mockResolvedValue({ ok: true, data: { runtimeAvailability: "unavailable" } });
    fireEvent.click(screen.getByRole("button", { name: "Open Other" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("other"));
    edit("edited other");
    await act(async () => { finishProbe({ ok: true, data: { runtimeAvailability: "available" } }); });
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("edited other");
    expect(screen.getByTitle(/Runtime: Runtime Off/i)).toBeInTheDocument();
  });
});
