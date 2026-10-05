import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type * as Monaco from "monaco-editor";
let api: typeof Monaco;
beforeAll(async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })));
  api = await import("monaco-editor/esm/vs/editor/editor.api");
  await import("monaco-editor/esm/vs/editor/browser/coreCommands");
}, 60000);
afterAll(() => vi.unstubAllGlobals());

it("maps jk to Escape, writes through the save callback and disposes Vim without losing text", async () => {
  const module = await import("monaco-vim");
  const host = document.createElement("div"), status = document.createElement("div"); document.body.append(host, status);
  const model = api.editor.createModel("package main\n"); const editor = api.editor.create(host, { model });
  const adapter = module.initVimMode(editor, status);
  const vim = (module.VimMode as unknown as { Vim: { map: (lhs: string, rhs: string, context: string) => void; unmap: (lhs: string, context: string) => void; handleKey: (adapter: unknown, key: string) => unknown; handleEx: (adapter: unknown, command: string) => void } }).Vim;
  const saved = vi.fn(); (adapter as unknown as { save: () => void }).save = () => saved(model.getValue());
  try {
    vim.map("jk", "<Esc>", "insert"); vim.handleKey(adapter, "i");
    expect(status.textContent).toContain("INSERT");
    vim.handleKey(adapter, "j"); editor.trigger("keyboard", "type", { text: "j" });
    vim.handleKey(adapter, "k"); expect(status.textContent).toContain("NORMAL"); expect(model.getValue()).toBe("package main\n");
    vim.handleEx(adapter, "write"); expect(saved).toHaveBeenCalledExactlyOnceWith("package main\n");
    adapter.dispose(); editor.trigger("keyboard", "type", { text: "x" }); expect(model.getValue()).toContain("x");
  } finally { vim.unmap("jk", "insert"); adapter.dispose(); editor.dispose(); model.dispose(); host.remove(); status.remove(); }
}, 60000);
