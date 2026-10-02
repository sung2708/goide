import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DocumentSession } from "../documents/DocumentSession";
import { DEFAULT_SETTINGS } from "../settings/model";
import { useSavePreparation } from "./useSavePreparation";
const mocks = vi.hoisted(() => ({ format: vi.fn(), imports: vi.fn(), cancel: vi.fn().mockResolvedValue({ ok: true, data: true }) }));
vi.mock("../../lib/ipc/client", () => ({ formatWorkspaceDocument: mocks.format, organizeWorkspaceImports: mocks.imports, cancelLanguageRequest: mocks.cancel }));
it("runs imports then formatting once and writes against the original baseline", async () => {
  const documents = new DocumentSession(); documents.reset("repo"); const document = documents.open("main.go", "disk"); documents.edit(document.id, "source");
  mocks.imports.mockResolvedValue({ ok: true, data: { files: [{ path: "main.go", before: "source", after: "with imports", readOnly: false }] } });
  mocks.format.mockResolvedValue({ ok: true, data: { files: [{ path: "main.go", before: "with imports", after: "formatted", readOnly: false }] } });
  const hook = renderHook(() => useSavePreparation(documents, documents.snapshot(), { ...DEFAULT_SETTINGS, "go.formatOnSave": true, "go.organizeImportsOnSave": true }));
  const writer = vi.fn().mockResolvedValue({ ok: true });
  await act(() => documents.save(document.id, writer, hook.result.current.prepare));
  expect(mocks.imports).toHaveBeenCalledOnce(); expect(mocks.format).toHaveBeenCalledOnce();
  expect(mocks.format).toHaveBeenCalledWith(expect.objectContaining({ requestId: expect.any(String), buffers: [{ path: "main.go", content: "with imports" }] }));
  expect(writer).toHaveBeenCalledWith("repo", "main.go", "formatted", "disk"); expect(documents.active?.text).toBe("formatted"); expect(documents.dirty).toBe(false);
});
it("aborts changed source, cancels pending queries, and preserves the newer draft", async () => {
  const documents = new DocumentSession(); documents.reset("repo"); const document = documents.open("main.go", "disk"); documents.edit(document.id, "source");
  let resolve!: (value: unknown) => void; mocks.format.mockImplementation(() => new Promise(complete => { resolve = complete; }));
  const hook = renderHook(({ snapshot }) => useSavePreparation(documents, snapshot, { ...DEFAULT_SETTINGS, "go.formatOnSave": true }), { initialProps: { snapshot: documents.snapshot() } });
  const writer = vi.fn(); let pending!: Promise<void>;
  act(() => { pending = documents.save(document.id, writer, hook.result.current.prepare); });
  documents.edit(document.id, "newer"); hook.rerender({ snapshot: documents.snapshot() });
  expect(mocks.cancel).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: "repo", requestId: expect.any(String) }));
  await act(async () => { resolve({ ok: true, data: { files: [] } }); await expect(pending).rejects.toThrow("Go buffers changed"); });
  expect(writer).not.toHaveBeenCalled(); expect(documents.active?.text).toBe("newer"); expect(documents.active?.baseline).toBe("disk");
});
it("keeps the canonical editor draft dirty when native persistence fails", async () => {
  const documents = new DocumentSession(); documents.reset("repo"); const document = documents.open("main.go", "disk"); documents.edit(document.id, "source");
  mocks.format.mockResolvedValue({ ok: true, data: { files: [{ path: "main.go", before: "source", after: "formatted", readOnly: false }] } });
  const hook = renderHook(() => useSavePreparation(documents, documents.snapshot(), { ...DEFAULT_SETTINGS, "go.formatOnSave": true }));
  await act(async () => { await expect(documents.save(document.id, vi.fn().mockResolvedValue({ ok: false, error: { code: "external_file_conflict", message: "Disk changed" } }), hook.result.current.prepare)).rejects.toThrow("Disk changed"); });
  expect(documents.active?.text).toBe("formatted"); expect(documents.active?.baseline).toBe("disk"); expect(documents.dirty).toBe(true);
});
it("does not write when tooling fails or returns edits outside the saved document", async () => {
  const documents = new DocumentSession(); documents.reset("repo"); const document = documents.open("main.go", "source");
  const hook = renderHook(() => useSavePreparation(documents, documents.snapshot(), { ...DEFAULT_SETTINGS, "go.formatOnSave": true }));
  const writer = vi.fn(); mocks.format.mockResolvedValue({ ok: false, error: { message: "gopls unavailable" } });
  await act(async () => { await expect(documents.save(document.id, writer, hook.result.current.prepare)).rejects.toThrow("gopls unavailable"); });
  mocks.format.mockResolvedValue({ ok: true, data: { files: [{ path: "other.go", before: "source", after: "wrong", readOnly: false }] } });
  await act(async () => { await expect(documents.save(document.id, writer, hook.result.current.prepare)).rejects.toThrow("invalid or stale"); }); expect(writer).not.toHaveBeenCalled(); expect(documents.active?.text).toBe("source");
});
it("explicit cancellation and unmount prevent late preparation from starting a disk write", async () => {
  for (const unmount of [false, true]) {
    const documents = new DocumentSession(); documents.reset("repo"); const document = documents.open("main.go", "source");
    let resolve!: (value: unknown) => void; mocks.format.mockImplementation(() => new Promise(complete => { resolve = complete; }));
    const hook = renderHook(() => useSavePreparation(documents, documents.snapshot(), { ...DEFAULT_SETTINGS, "go.formatOnSave": true }));
    const writer = vi.fn(); let pending!: Promise<void>; act(() => { pending = documents.save(document.id, writer, hook.result.current.prepare); });
    if (unmount) hook.unmount(); else act(() => hook.result.current.cancel());
    await act(async () => { resolve({ ok: true, data: { files: [] } }); await expect(pending).rejects.toThrow("cancelled"); });
    expect(writer).not.toHaveBeenCalled(); expect(documents.active?.text).toBe("source");
  }
});