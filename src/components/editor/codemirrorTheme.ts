import { EditorView, lineNumbers } from "@codemirror/view";
import { go } from "@codemirror/lang-go";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const PREDICTED_HINT_UNDERLINE_CLASS = "goide-predicted-hint-underline";
export const GOIDE_SIGNAL_PREDICTED_TOKEN = "var(--goide-signal-predicted)";

const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "#11111b",
      color: "#cdd6f4",
    },
    ".cm-scroller": {
      fontFamily:
        '"JetBrains Mono", "Fira Code", "SFMono-Regular", ui-monospace, monospace',
      fontSize: "12px",
      lineHeight: "1.55",
    },
    ".cm-content": {
      padding: "10px 0",
    },
    ".cm-line": {
      padding: "0 12px",
    },
    [`.cm-line.${PREDICTED_HINT_UNDERLINE_CLASS}`]: {
      textDecorationLine: "underline",
      textDecorationStyle: "dotted",
      textDecorationColor: GOIDE_SIGNAL_PREDICTED_TOKEN,
      textDecorationThickness: "1px",
      textUnderlineOffset: "3px",
    },
    ".cm-gutters": {
      backgroundColor: "#11111b",
      color: "#6c7086",
      borderRight: "1px solid #313244",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 10px 0 12px",
      fontSize: "11px",
    },
    ".cm-activeLine": {
      backgroundColor: "#181825",
    },
    ".cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#313244",
    },
    ".cm-cursor": {
      borderLeftColor: "#f5e0dc",
    },
  },
  { dark: true }
);

const syntaxStyle = HighlightStyle.define([
  { tag: tags.comment, color: "#6c7086" },
  { tag: tags.keyword, color: "#cba6f7" },
  { tag: tags.string, color: "#a6e3a1" },
  { tag: [tags.number, tags.bool, tags.null], color: "#fab387" },
  { tag: tags.typeName, color: "#f9e2af" },
  { tag: tags.className, color: "#f9e2af" },
  { tag: tags.function(tags.variableName), color: "#89b4fa" },
  { tag: tags.operator, color: "#89b4fa" },
  { tag: tags.variableName, color: "#cdd6f4" },
]);

export const goideEditorExtensions = [
  lineNumbers(),
  go(),
  syntaxHighlighting(syntaxStyle),
  editorTheme,
];
