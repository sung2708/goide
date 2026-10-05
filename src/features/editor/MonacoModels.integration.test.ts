import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as Monaco from "monaco-editor";
import { MonacoModels, documentText } from "./MonacoModels";
import { DocumentSession } from "../documents/DocumentSession";
let api: typeof Monaco;
beforeAll(async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
  api = await import("monaco-editor/esm/vs/editor/editor.api");
  await import("monaco-editor/esm/vs/editor/browser/coreCommands");
  await import("monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2");
}, 60000);
afterAll(() => vi.unstubAllGlobals());
describe("actual Monaco text models", () => {
  it("applies external EOL changes once and restores original EOL with Undo", () => {
    const session = new DocumentSession(); session.reset("/qa-eol");
    const file = session.open("main.go", "package main\r\n"); const models = new MonacoModels(api); models.sync(session.snapshot());
    const model = models.get("/qa-eol", "main.go")!.model;
    const host = document.createElement("div"); document.body.append(host); const editor = api.editor.create(host, { model });
    try {
      session.edit(file.id, "package main\n// external\n"); models.sync(session.snapshot());
      expect(model.getValue()).toBe("package main\n// external\n"); expect(model.getEOL()).toBe("\n");
      const version = model.getVersionId(); models.sync(session.snapshot()); expect(model.getVersionId()).toBe(version);
      editor.trigger("qa", "undo", null); expect(model.getValue()).toBe("package main\r\n");
    } finally { editor.dispose(); host.remove(); models.dispose(); }
  });
  it("preserves the file BOM through typing, reconciliation, save serialization and undo", () => {
    const session = new DocumentSession(); session.reset("/qa-bom");
    const original = "\uFEFFpackage main\r\n// tiếng Việt 👋\r\n";
    const file = session.open("main.go", original);
    const models = new MonacoModels(api); models.sync(session.snapshot());
    const model = models.get("/qa-bom", "main.go")!.model;
    const host = document.createElement("div"); document.body.append(host);
    const editor = api.editor.create(host, { model });
    try {
      expect(model.getValue()).toBe(original.slice(1)); expect(model.getEOL()).toBe("\r\n");
      model.pushStackElement(); model.pushEditOperations([], [{ range: model.getFullModelRange(), text: `${model.getValue()}// edited\r\n` }], () => null); model.pushStackElement();
      const edited = documentText(model.getValue(), file.text); session.edit(file.id, edited);
      const version = model.getVersionId(); models.sync(session.snapshot()); expect(model.getVersionId()).toBe(version);
      expect(edited).toBe(`${original}// edited\r\n`);
      editor.trigger("qa", "undo", null); expect(documentText(model.getValue(), file.text)).toBe(original);
      editor.trigger("qa", "redo", null); expect(documentText(model.getValue(), file.text)).toBe(edited);
    } finally { editor.dispose(); host.remove(); models.dispose(); }
  });
  it("pairs and skips delimiters and surrounds selections", () => {
    api.languages.register({ id: "goro-qa" });
    const language = api.languages.setLanguageConfiguration("goro-qa", { autoClosingPairs: [{ open: "(", close: ")" }, { open: "[", close: "]" }, { open: "{", close: "}" }, { open: '"', close: '"' }, { open: "'", close: "'" }] });
    const host = document.createElement("div"); document.body.append(host);
    const model = api.editor.createModel("", "goro-qa"); const editor = api.editor.create(host, { model, autoClosingBrackets: "always", autoClosingQuotes: "always" });
    try {
      for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"], ['"', '"'], ["'", "'"]]) {
        model.setValue(""); editor.setPosition({ lineNumber: 1, column: 1 }); editor.trigger("keyboard", "type", { text: open }); expect(model.getValue()).toBe(open + close);
        editor.trigger("keyboard", "type", { text: close }); expect(model.getValue()).toBe(open + close);
        model.setValue("abc"); editor.setSelection(new api.Range(1, 1, 1, 4)); editor.trigger("keyboard", "type", { text: open }); expect(model.getValue()).toBe(open + "abc" + close);
      }
    } finally { editor.dispose(); model.dispose(); language.dispose(); host.remove(); }
  });
  it("preserves CRLF, Vietnamese/emoji UTF-16 offsets, undo and redo across tabs", async () => {
    const session = new DocumentSession(); session.reset("D:/QA tiếng Việt");
    const first = session.open("main.go", "package main\r\n// tiếng Việt 👋\r\n"), second = session.open("worker.go", "package main\n");
    const models = new MonacoModels(api); models.sync(session.snapshot());
    const model = models.get("D:/QA tiếng Việt", first.path)!.model;
    const host = document.createElement("div"); document.body.append(host);
    const editor = api.editor.create(host, { model, minimap: { enabled: false } });
    try {
      expect(model.getEOL()).toBe("\r\n"); expect(model.getValue()).toBe(first.text);
      const offset = first.text.indexOf("👋") + 2; const position = model.getPositionAt(offset);
      expect(position.column).toBe("// tiếng Việt 👋".length + 1); expect(model.getOffsetAt(position)).toBe(offset);
      model.pushStackElement(); model.pushEditOperations([], [{ range: model.getFullModelRange(), text: first.text + "// edited\r\n" }], () => null); model.pushStackElement(); session.edit(first.id, model.getValue());
      session.activate(second.id); models.sync(session.snapshot()); session.activate(first.id); models.sync(session.snapshot());
      expect(models.get("D:/QA tiếng Việt", first.path)!.model).toBe(model);
      editor.trigger("qa", "undo", null); expect(model.getValue()).toBe(first.text); editor.trigger("qa", "redo", null); expect(model.getValue()).toContain("// edited\r\n");
    } finally { editor.dispose(); host.remove(); models.dispose(); }
  });
  it("releases real models on closed tabs/workspaces without accumulating 50-tab sessions", () => {
    const before = api.editor.getModels().length;
    const session = new DocumentSession(); session.reset("/qa-models"); for (let index = 0; index < 50; index++) session.open(`${index}.go`, `package main\n// ${index}\n`);
    const registry = new MonacoModels(api); registry.sync(session.snapshot()); expect(api.editor.getModels()).toHaveLength(before + 50);
    session.close(session.snapshot().documents[0].id); registry.sync(session.snapshot()); expect(api.editor.getModels()).toHaveLength(before + 49);
    registry.dispose(); expect(api.editor.getModels()).toHaveLength(before);
  });
});
