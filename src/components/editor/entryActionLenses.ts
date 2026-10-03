import { StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import type { SemanticEntryAction } from "../../features/semantics/types";
import { setSemanticAnalysisEffect } from "./semanticFolding";
export type EntryActionContext = { key: string; path: string | null; enabled: boolean; execute?: (action: SemanticEntryAction, intent: "run" | "debug", source: string) => void };

class EntryActionWidget extends WidgetType {
  constructor(readonly action: SemanticEntryAction, readonly source: string, readonly owner: string, readonly context: () => EntryActionContext) { super(); }
  toDOM(view: EditorView) {
    const row = document.createElement("div"); row.className = "cm-entry-actions";
    for (const intent of ["run", "debug"] as const) {
      const button = document.createElement("button"); button.type = "button";
      button.textContent = `${intent === "run" ? "Run" : "Debug"}${this.action.kind === "test" ? " Test" : ""}`;
      button.setAttribute("aria-label", `${button.textContent} ${this.action.name}`);
      button.disabled = !this.context().enabled;
      button.addEventListener("click", () => {
        const current = this.context();
        // Reject detached widgets and document/workspace revisions without mapping old ranges into new code.
        if (!row.isConnected || !current.enabled || current.key !== this.owner || view.state.doc.toString() !== this.source) return;
        current.execute?.(this.action, intent, this.source);
      });
      row.append(button);
    }
    return row;
  }
  ignoreEvent() { return true; }
}
export function entryActionLenses(context: () => EntryActionContext) {
  return StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, transaction) {
      if (transaction.docChanged) value = Decoration.none;
      for (const effect of transaction.effects) {
        if (!effect.is(setSemanticAnalysisEffect)) continue;
        const result = effect.value, owner = context();
        if (!result || !owner.execute || !owner.path || result.filePath !== owner.path || result.sourceText !== transaction.state.doc.toString()) { value = Decoration.none; continue; }
        const widgets = (result.entryActions ?? []).filter(action => owner.path!.endsWith("_test.go") ? action.kind === "test" : action.kind === "main").slice(0, 256).filter(action => action.range.from >= 0 && action.range.from < transaction.state.doc.length).map(action => Decoration.widget({ widget: new EntryActionWidget(action, result.sourceText!, owner.key, context), block: true, side: -1 }).range(transaction.state.doc.lineAt(action.range.from).from));
        value = Decoration.set(widgets, true);
      }
      return value;
    },
    provide: field => EditorView.decorations.from(field),
  });
}
export const entryActionTheme = EditorView.baseTheme({
  ".cm-entry-actions": { display: "flex", gap: "12px", padding: "2px 0 2px 4px", fontSize: "11px" },
  ".cm-entry-actions button": { background: "transparent", border: "none", color: "var(--text-muted, inherit)", cursor: "pointer", padding: "0" },
  ".cm-entry-actions button:hover": { color: "var(--text-primary, inherit)", textDecoration: "underline" },
  ".cm-entry-actions button:disabled": { opacity: "0.5", cursor: "default" },
  ".cm-entry-actions button:focus-visible": { outline: "1px solid currentColor", outlineOffset: "2px" },
});
