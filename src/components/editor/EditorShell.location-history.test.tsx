import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";
const read = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: async () => "C:/repo" }));
vi.mock("../../lib/ipc/client", async () => ({
  ...await vi.importActual("../../lib/ipc/client"),
  listWorkspaceEntries: async () => ({ ok: true, data: [] }),
  readWorkspaceFile: read,
  getWorkspaceFileInfo: async () => ({ ok: true, data: { sizeBytes: 100, readOnly: false } }),
  fetchWorkspaceDiagnostics: async () => ({ ok: true, data: { diagnostics: [], toolingAvailability: "available" } }),
}));
vi.mock("../../features/concurrency/useLensSignals", () => ({ useLensSignals: () => ({ detectedConstructs: [], counterpartMappings: [], isAnalyzing: false, analysisError: null }) }));
vi.mock("../sidebar/Explorer", () => ({ default: ({ workspacePath, onOpenFile }: any) => <><output data-testid="root">{workspacePath}</output><button onClick={() => onOpenFile("main.go")}>Open Main</button></> }));
vi.mock("../../features/language/LanguageResults", () => ({ default: ({ onNavigate }: any) => <button onClick={() => onNavigate({ path: "other.go", line: 2, column: 3 })}>Definition in other</button> }));
vi.mock("./CodeEditor", () => ({ default: ({ value, jumpRequest }: any) => <><textarea aria-label="Document" readOnly value={value} /><output data-testid="jump">{jumpRequest?.line}:{jumpRequest?.column}</output></> }));
beforeEach(() => { localStorage.clear(); read.mockReset().mockImplementation(async (_root: string, path: string) => ({ ok: true, data: `${path}\nsecond line\nthird line` })); });
async function open() {
  render(<EditorShell />);
  fireEvent.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
  await waitFor(() => expect(screen.getByTestId("root")).toHaveTextContent("C:/repo"));
  fireEvent.click(screen.getByRole("button", { name: "Open Main" }));
  await screen.findByRole("textbox", { name: "Document" });
  fireEvent.click(screen.getByRole("button", { name: "Definition in other" }));
  await waitFor(() => expect(screen.getByTestId("jump")).toHaveTextContent("2:3"));
}
it("returns to the source location, moves forward to the definition and preserves buffers", async () => {
  await open();
  fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true });
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("main.go\nsecond line\nthird line");
    expect(screen.getByTestId("jump")).toHaveTextContent("1:1");
  });
  fireEvent.keyDown(document.body, { key: "ArrowRight", altKey: true });
  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("other.go\nsecond line\nthird line");
    expect(screen.getByTestId("jump")).toHaveTextContent("2:3");
  });
  expect(read).toHaveBeenCalledTimes(2);
});
it("retains the back entry when its closed file cannot be read, so retry still works", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Close main.go" }));
  await waitFor(() => expect(screen.queryByRole("tab", { name: /main.go/ })).toBeNull());
  read.mockResolvedValueOnce({ ok: false, error: { message: "History file denied" } });
  fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true });
  await screen.findByText("History file denied");
  expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("other.go\nsecond line\nthird line");
  fireEvent.keyDown(document.body, { key: "ArrowLeft", altKey: true });
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Document" })).toHaveValue("main.go\nsecond line\nthird line"));
});
