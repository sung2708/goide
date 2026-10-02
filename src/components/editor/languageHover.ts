import { EditorView, ViewPlugin, hoverTooltip, type Tooltip, type ViewUpdate } from "@codemirror/view";
import type { EditorHoverRequest, EditorHoverResult } from "../../features/language/useEditorHover";

type RequestHover = (input: EditorHoverRequest) => Promise<EditorHoverResult>;
export async function resolveLanguageHover(view: EditorView, position: number, controller: AbortController, request: RequestHover): Promise<Tooltip | null> {
  const state = view.state;
  const token = state.wordAt(position);
  if (!token || controller.signal.aborted) return null;
  const result = await request({ offset: position, content: state.doc.toString(), signal: controller.signal });
  if (!result || controller.signal.aborted || view.state.doc !== state.doc) return null;
  return {
    pos: token.from, end: token.to, above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "go-language-hover";
      dom.setAttribute("role", "tooltip");
      const text = document.createElement("pre");
      text.textContent = result.text.length > 16000 ? `${result.text.slice(0, 16000)}\n… Information truncated.` : result.text;
      if (result.error) dom.setAttribute("data-error", "true");
      dom.append(text);
      return { dom };
    },
  };
}

export function languageHover(request: RequestHover) {
  const owner = ViewPlugin.fromClass(class {
    controller: AbortController | null = null;
    cancel() { this.controller?.abort(); this.controller = null; }
    update(update: ViewUpdate) { if (update.docChanged || update.selectionSet) this.cancel(); }
    destroy() { this.cancel(); }
  }, { eventHandlers: {
    mousemove() { this.cancel(); },
    mouseleave() { this.cancel(); },
    keydown(event) { if (event.key === "Escape") this.cancel(); },
  } });
  return [owner, hoverTooltip(async (view: EditorView, position: number) => {
    const instance = view.plugin(owner);
    if (!instance) return null;
    instance.cancel();
    const controller = new AbortController();
    instance.controller = controller;
    return resolveLanguageHover(view, position, controller, request);
  }, { hideOnChange: true, hoverTime: 450 }), EditorView.baseTheme({
    ".go-language-hover": { maxWidth: "min(34rem, 90vw)", maxHeight: "18rem", overflow: "auto", padding: "0.75rem", color: "var(--text)", backgroundColor: "var(--mantle)", border: "1px solid var(--border)" },
    ".go-language-hover pre": { margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "12px" },
    '.go-language-hover[data-error="true"]': { color: "var(--red)" },
  })];
}
