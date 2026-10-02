import { StateEffect, StateField } from "@codemirror/state";
import { EditorView, ViewPlugin, keymap, showTooltip, type Tooltip, type ViewUpdate } from "@codemirror/view";
import type { EditorHoverRequest } from "../../features/language/useEditorHover";
import type { EditorSignatureResult } from "../../features/language/useEditorSignature";

type Payload = { pos: number; result: NonNullable<EditorSignatureResult> | { loading: true } };
export const requestSignatureHelp = StateEffect.define<null>();
const setSignature = StateEffect.define<Payload | null>();
export function signatureTooltip(payload: Payload): Tooltip {
  return { pos: payload.pos, above: true, create() {
    const dom = document.createElement("div"); dom.className = "go-signature-help";
    dom.setAttribute("role", "tooltip"); dom.setAttribute("aria-label", "Signature help");
    if ("loading" in payload.result) {
      const status = document.createElement("span"); status.setAttribute("role", "status"); status.textContent = "Querying gopls signature…"; dom.append(status); return { dom };
    }
    if ("error" in payload.result) {
      dom.textContent = payload.result.error; dom.setAttribute("data-error", "true"); return { dom };
    }
    const help = payload.result;
    const signature = help.signatures[help.activeSignature];
    if (!signature) return { dom };
    const parameter = signature.activeParameter === null ? null : signature.parameters[signature.activeParameter];
    const label = document.createElement("pre");
    if (parameter?.range) {
      label.append(document.createTextNode(signature.label.slice(0, parameter.range[0])));
      const active = document.createElement("strong"); active.textContent = signature.label.slice(...parameter.range); label.append(active);
      label.append(document.createTextNode(signature.label.slice(parameter.range[1])));
    } else label.textContent = signature.label;
    dom.append(label);
    if (help.signatures.length > 1) { const index = document.createElement("small"); index.textContent = `Signature ${help.activeSignature + 1} of ${help.signatures.length}`; dom.append(index); }
    if (parameter) { const active = document.createElement("p"); active.textContent = `Parameter ${(signature.activeParameter ?? 0) + 1}: ${parameter.label}`; dom.append(active); }
    for (const text of [parameter?.documentation, signature.documentation]) {
      if (!text) continue;
      const docs = document.createElement("p"); docs.textContent = text.length > 3500 ? `${text.slice(0, 3500)}… Documentation truncated.` : text; dom.append(docs);
    }
    return { dom };
  } };
}

const signatureField = StateField.define<Payload | null>({
  create: () => null,
  update(value, transaction) {
    if (transaction.docChanged || transaction.selection) value = null;
    for (const effect of transaction.effects) if (effect.is(setSignature)) value = effect.value;
    return value;
  },
  provide: field => showTooltip.computeN([field], state => { const value = state.field(field); return value ? [signatureTooltip(value)] : []; }),
});

export function signatureHelp(request: (input: EditorHoverRequest) => Promise<EditorSignatureResult>) {
  const owner = ViewPlugin.fromClass(class {
    controller: AbortController | null = null;
    timer: ReturnType<typeof setTimeout> | null = null;
    following = false;
    destroyed = false;
    constructor(readonly view: EditorView) {}
    cancel() { this.controller?.abort(); this.controller = null; if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }
    dismiss() { this.cancel(); this.following = false; if (!this.destroyed) this.view.dispatch({ effects: setSignature.of(null) }); }
    schedule() {
      this.cancel(); this.following = true;
      this.timer = setTimeout(() => { this.timer = null; void this.query(); }, 180);
    }
    async query() {
      const state = this.view.state;
      if (!state.selection.main.empty) { this.following = false; this.view.dispatch({ effects: setSignature.of(null) }); return; }
      const pos = state.selection.main.head;
      const controller = new AbortController(); this.controller = controller;
      this.view.dispatch({ effects: setSignature.of({ pos, result: { loading: true } }) });
      let result: EditorSignatureResult;
      try { result = await request({ offset: pos, content: state.doc.toString(), signal: controller.signal }); }
      catch (error) { result = { error: error instanceof Error ? error.message : String(error) }; }
      if (this.destroyed || controller.signal.aborted || this.view.state.doc !== state.doc || this.view.state.selection.main.head !== pos) return;
      this.following = result !== null && !("error" in result);
      this.view.dispatch({ effects: setSignature.of(result ? { pos, result } : null) });
    }
    update(update: ViewUpdate) {
      if (update.transactions.some(transaction => transaction.effects.some(effect => effect.is(requestSignatureHelp)))) { this.schedule(); return; }
      if (!update.docChanged && !update.selectionSet) return;
      const pos = update.state.selection.main.head;
      const trigger = update.docChanged && pos > 0 && /[(,]/.test(update.state.sliceDoc(pos - 1, pos));
      if (this.following || trigger) this.schedule(); else this.cancel();
    }
    destroy() { this.destroyed = true; this.cancel(); }
  }, { eventHandlers: { blur() { this.dismiss(); } } });
  return [signatureField, owner, keymap.of([
    { key: "Ctrl-Shift-Space", mac: "Mod-Shift-Space", run(view) { view.plugin(owner)?.schedule(); return true; } },
    { key: "Escape", run(view) {
      const instance = view.plugin(owner);
      if (!instance || (!instance.following && !view.state.field(signatureField))) return false;
      instance.dismiss(); return true;
    } },
  ]), EditorView.baseTheme({
    ".go-signature-help": { maxWidth: "min(38rem, 90vw)", maxHeight: "16rem", overflow: "auto", padding: "0.75rem", whiteSpace: "pre-wrap", overflowWrap: "anywhere", backgroundColor: "var(--mantle)", color: "var(--text)", border: "1px solid var(--border)", fontSize: "12px" },
    ".go-signature-help pre": { margin: "0", whiteSpace: "pre-wrap" },
    ".go-signature-help strong": { color: "var(--blue)", textDecoration: "underline" },
    '.go-signature-help[data-error="true"]': { color: "var(--red)" },
  })];
}
