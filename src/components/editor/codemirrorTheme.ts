import {
  EditorView,
  lineNumbers,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
} from "@codemirror/view";
import { go } from "@codemirror/lang-go";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const PREDICTED_HINT_UNDERLINE_CLASS = "goide-predicted-hint-underline";
export const GOIDE_SIGNAL_PREDICTED_TOKEN = "var(--goide-signal-predicted)";

const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "var(--crust) !important",
      color: "var(--text) !important",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily:
        '"JetBrains Mono", "Fira Code", "SFMono-Regular", ui-monospace, monospace',
      fontSize: "13.5px",
      lineHeight: "1.65",
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
      textDecorationColor: "var(--signal-predicted)",
      textDecorationThickness: "1px",
      textUnderlineOffset: "3px",
    },
    ".cm-lintRange-error": {
      backgroundColor: "var(--signal-blocked-bg)",
      textDecoration: "underline wavy var(--red)",
      textUnderlineOffset: "2px",
    },
    ".cm-lintRange-warning": {
      backgroundColor: "var(--signal-likely-bg)",
      textDecoration: "underline wavy var(--yellow)",
      textUnderlineOffset: "2px",
    },
    ".cm-lintPoint-error, .cm-diagnostic-error": {
      color: "var(--red)",
      borderColor: "var(--red)",
    },
    ".cm-lintPoint-warning, .cm-diagnostic-warning": {
      color: "var(--yellow)",
      borderColor: "var(--yellow)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--crust) !important",
      color: "var(--overlay0)",
      borderRight: "1px solid var(--surface0)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 10px 0 12px",
      fontSize: "11px",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--surface0)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--surface0)",
      color: "var(--text)",
    },
    ".cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--surface1) !important",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeft: "2.5px solid var(--rosewater)",
      animation: "cm-blink 1s steps(1) infinite",
    },
    "@keyframes cm-blink": {
      "0%": { opacity: "1" },
      "50%": { opacity: "0" },
      "100%": { opacity: "1" },
    },
  },
  { dark: true }
);

const syntaxStyle = HighlightStyle.define([
  { tag: tags.comment, color: "var(--overlay0)", fontStyle: "italic" },
  { tag: tags.keyword, color: "var(--mauve)", fontWeight: "700" },
  { tag: tags.string, color: "var(--green)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--peach)" },
  { tag: tags.typeName, color: "var(--yellow)" },
  { tag: tags.className, color: "var(--yellow)" },
  { tag: tags.function(tags.variableName), color: "var(--blue)", fontWeight: "500" },
  { tag: tags.operator, color: "var(--sky)" },
  { tag: tags.variableName, color: "var(--text)" },
  { tag: tags.propertyName, color: "var(--blue)" },
  { tag: tags.atom, color: "var(--maroon)" },
]);

export const goideEditorExtensions = [
  lineNumbers(),
  drawSelection(),
  dropCursor(),
  highlightSpecialChars(),
  highlightActiveLine(),
  highlightActiveLineGutter(),
  go(),
  bracketMatching(),
  indentOnInput(),
  indentUnit.of("\t"),
  syntaxHighlighting(syntaxStyle),
  editorTheme,
];
