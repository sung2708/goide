import { EditorState, StateEffect } from "@codemirror/state";
import { EditorView, showTooltip } from "@codemirror/view";
import { afterEach, expect, it, vi } from "vitest";
import { signatureHelp, signatureTooltip, requestSignatureHelp } from "./signatureHelp";
import type { SignatureHelp } from "../../lib/ipc/types";
import type { EditorHoverRequest } from "../../features/language/useEditorHover";

const help: SignatureHelp = { activeSignature: 0, signatures: [{ label: "F(a int, b string)", documentation: "<img src=x>", parameters: [{ label: "a int", range: [2,7], documentation: null }, { label: "b string", range: [9,17], documentation: "actual parameter docs" }], activeParameter: 1 }] };
afterEach(() => vi.useRealTimers());

it("highlights the server's active parameter and escapes signature documentation", () => {
  const dom = signatureTooltip({ pos: 3, result: help }).create({} as EditorView).dom;
  expect(dom.querySelector("strong")?.textContent).toBe("b string");
  expect(dom.textContent).toContain("Parameter 2: b string");
  expect(dom.textContent).toContain("actual parameter docs");
  expect(dom.querySelector("img")).toBeNull();
});

it("debounces real editor changes, survives extension reconfiguration and aborts on Escape", async () => {
  vi.useFakeTimers();
  const pending: Array<(value: unknown) => void> = [];
  const request = vi.fn((_input: EditorHoverRequest) => new Promise<any>(resolve => pending.push(resolve)));
  const extension = signatureHelp(request);
  const host = document.createElement("div"); document.body.append(host);
  const view = new EditorView({ state: EditorState.create({ doc: "F", selection: { anchor: 1 }, extensions: extension }), parent: host });
  try {
    view.dispatch({ changes: { from: 1, insert: "(" }, selection: { anchor: 2 } });
    // Reconfiguring other editor features must retain the signature owner's timer.
    view.dispatch({ effects: StateEffect.reconfigure.of([...extension, EditorState.tabSize.of(4)]) });
    await vi.advanceTimersByTimeAsync(180);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatchObject({ offset: 2, content: "F(" });
    const first = request.mock.calls[0][0].signal as AbortSignal;
    view.dispatch({ changes: { from: 2, insert: "1," }, selection: { anchor: 4 } });
    expect(first.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(180);
    expect(request).toHaveBeenCalledTimes(2);
    const second = request.mock.calls[1][0].signal as AbortSignal;
    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    expect(second.aborted).toBe(true);
    pending[0](help); pending[1](help);
    await Promise.resolve();
    expect(host.querySelector(".go-signature-help")).toBeNull();
  } finally { view.destroy(); host.remove(); }
});

it("invokes signature help explicitly and dismisses it when gopls no longer reports a call", async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockResolvedValueOnce(help).mockResolvedValueOnce(null);
  const view = new EditorView({ state: EditorState.create({ doc: "F(1, ", selection: { anchor: 5 }, extensions: signatureHelp(request) }) });
  try {
    view.dispatch({ effects: requestSignatureHelp.of(null) });
    await vi.advanceTimersByTimeAsync(180);
    expect(request).toHaveBeenCalledTimes(1);
    expect(view.state.facet(showTooltip).filter(Boolean)).toHaveLength(1);
    view.dispatch({ changes: { from: 5, insert: ")" }, selection: { anchor: 6 } });
    await vi.advanceTimersByTimeAsync(180);
    expect(request).toHaveBeenCalledTimes(2);
    expect(view.state.facet(showTooltip).filter(Boolean)).toHaveLength(0);
    view.dispatch({ changes: { from: 6, insert: "x" }, selection: { anchor: 7 } });
    await vi.advanceTimersByTimeAsync(180);
    expect(request).toHaveBeenCalledTimes(2);
  } finally { view.destroy(); }
});
