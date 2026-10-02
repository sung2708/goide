import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { expect, it, vi } from "vitest";
import { resolveLanguageHover } from "./languageHover";

it("anchors hover to the actual word and renders bounded text without executing markup", async () => {
  const view = { state: EditorState.create({ doc: "package main\nvar Greeting string\n" }) } as EditorView;
  const request = vi.fn().mockResolvedValue({ text: "<img src=x onerror=alert(1)>" });
  const tip = await resolveLanguageHover(view, 18, new AbortController(), request);
  expect(tip).toMatchObject({ pos: 17, end: 25 });
  const dom = tip!.create(view).dom;
  expect(dom.getAttribute("role")).toBe("tooltip");
  expect(dom.querySelector("img")).toBeNull();
  expect(dom.textContent).toContain("<img");
  request.mockResolvedValue({ text: "x".repeat(20000), error: true });
  const bounded = (await resolveLanguageHover(view, 18, new AbortController(), request))!.create(view).dom;
  expect(bounded.textContent!.length).toBeLessThan(16100);
  expect(bounded.textContent).toContain("Information truncated");
  expect(bounded.dataset.error).toBe("true");
});

it("rejects a late hover after cancellation or a changed document", async () => {
  const view = { state: EditorState.create({ doc: "Greeting" }) } as EditorView;
  let resolve!: (value: unknown) => void;
  const request = vi.fn(() => new Promise<any>(done => { resolve = done; }));
  const controller = new AbortController();
  const first = resolveLanguageHover(view, 2, controller, request);
  controller.abort(); resolve({ text: "old" });
  expect(await first).toBeNull();
  const second = resolveLanguageHover(view, 2, new AbortController(), request);
  view.setState = vi.fn();
  Object.assign(view, { state: view.state.update({ changes: { from: 0, insert: "changed " } }).state });
  resolve({ text: "obsolete" });
  expect(await second).toBeNull();
});
