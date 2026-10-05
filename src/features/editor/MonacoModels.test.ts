import { describe, expect, it, vi } from "vitest";
import { MonacoModels } from "./MonacoModels";
import { DocumentSession } from "../documents/DocumentSession";
import type * as Monaco from "monaco-editor";

function fixture() {
  const created: Array<{ text: string; disposed: boolean; undo: string[]; getValue: () => string; dispose: ReturnType<typeof vi.fn> }> = [];
  const api = { Uri: { parse: (uri: string) => uri }, editor: { createModel: vi.fn((text: string) => {
    const model = { text, disposed: false, undo: [] as string[], getValue: () => model.text, isDisposed: () => model.disposed, dispose: vi.fn(() => { model.disposed = true; }), pushStackElement: vi.fn(), getFullModelRange: () => ({}), pushEditOperations: vi.fn((_selection, edits) => { model.undo.push(model.text); model.text = edits[0].text; }) };
    created.push(model); return model;
  }) } } as unknown as typeof Monaco;
  const session = new DocumentSession(); session.reset("D:/tiếng Việt");
  return { created, api, session, models: new MonacoModels(api) };
}
describe("workspace Monaco model lifecycle", () => {
  it("keeps one model per document and retains undo across repeated tab switches", () => {
    const { session, models, api } = fixture(); const first = session.open("main.go", "package main\r\n// 👋\r\n"), second = session.open("worker.go", "package main\n");
    models.sync(session.snapshot()); const model = models.get("D:/tiếng Việt", "main.go")!.model;
    for (let index = 0; index < 50; index++) { session.activate(index % 2 ? first.id : second.id); models.sync(session.snapshot()); }
    expect(api.editor.createModel).toHaveBeenCalledTimes(2); expect(models.get("D:/tiếng Việt", "main.go")!.model).toBe(model); expect(model.getValue()).toContain("\r\n");
    models.dispose();
  });
  it("never replaces a matching buffer, and applies reviewed changes as undoable edits", () => {
    const { session, models, created } = fixture(); const document = session.open("main.go", "before"); models.sync(session.snapshot());
    models.sync(session.snapshot()); expect(created[0].undo).toEqual([]);
    session.edit(document.id, "after"); models.sync(session.snapshot()); expect(created[0].text).toBe("after"); expect(created[0].undo).toEqual(["before"]);
    models.sync(session.snapshot()); expect(created[0].undo).toEqual(["before"]); models.dispose();
  });
  it("disposes only closed models and all old models on workspace change", () => {
    const { session, models, created } = fixture(); const first = session.open("main.go", "main"), second = session.open("worker.go", "worker"); models.sync(session.snapshot());
    session.close(first.id); models.sync(session.snapshot()); expect(created[0].dispose).toHaveBeenCalledOnce(); expect(created[1].dispose).not.toHaveBeenCalled();
    session.reset("/different"); models.sync(session.snapshot()); expect(created[1].dispose).toHaveBeenCalledOnce(); expect(models.size).toBe(0);
    session.open("worker.go", "new"); models.sync(session.snapshot()); expect(models.get("/different", "worker.go")!.model.getValue()).toBe("new"); expect(second.path).toBe("worker.go"); models.dispose();
  });
  it("bounds a 50-tab session to 50 models and releases them on disposal", () => {
    const { session, models, created } = fixture(); for (let index = 0; index < 50; index++) session.open(`${index}.go`, "package main\n"); models.sync(session.snapshot()); expect(models.size).toBe(50);
    models.dispose(); expect(models.size).toBe(0); expect(created.every(model => model.dispose.mock.calls.length === 1)).toBe(true); models.dispose(); expect(created.every(model => model.dispose.mock.calls.length === 1)).toBe(true);
  });
});
