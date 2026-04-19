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
      fontSize: "13px",
      lineHeight: "1.62",
    },
    ".cm-content": {
      padding: "8px 0",
    },
    ".cm-line": {
      padding: "0 10px",
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
      borderRight: "1px solid rgba(113, 125, 144, 0.25)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 10px 0 12px",
      fontSize: "11px",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(126, 162, 220, 0.09)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(126, 162, 220, 0.12)",
      color: "var(--subtext1)",
    },
    ".cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "rgba(126, 162, 220, 0.24) !important",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--mantle)",
      border: "1px solid rgba(126, 162, 220, 0.26)",
      borderRadius: "10px",
      boxShadow: "0 18px 48px rgba(0, 0, 0, 0.42)",
      color: "var(--text)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete": {
      "& > ul": {
        maxHeight: "360px",
        minWidth: "520px",
        padding: "6px",
        fontFamily:
          '"JetBrains Mono", "Fira Code", "SFMono-Regular", ui-monospace, monospace',
      },
      "& ul li": {
        alignItems: "center",
        borderRadius: "7px",
        display: "flex",
        gap: "8px",
        minHeight: "26px",
        padding: "3px 10px",
      },
      "& ul li[aria-selected]": {
        backgroundColor: "rgba(126, 162, 220, 0.18)",
        color: "var(--text)",
      },
      "& .cm-completionLabel": {
        color: "var(--blue)",
        fontWeight: "600",
      },
      "& .cm-completionMatchedText": {
        color: "var(--yellow)",
        textDecoration: "none",
      },
      "& .cm-completionDetail": {
        color: "var(--overlay1)",
        flex: "1",
        marginLeft: "18px",
        textAlign: "right",
      },
      "& .cm-completionIcon": {
        color: "var(--red)",
        opacity: "0.9",
      },
      "& .cm-completionInfo": {
        backgroundColor: "var(--mantle)",
        border: "1px solid rgba(126, 162, 220, 0.24)",
        borderRadius: "9px",
        color: "var(--subtext1)",
        maxWidth: "420px",
        padding: "10px 12px",
      },
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeft: "2px solid var(--blue)",
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
  { tag: tags.docComment, color: "var(--overlay1)", fontStyle: "italic" },
  { tag: tags.comment, color: "var(--overlay0)", fontStyle: "italic" },
  { tag: tags.moduleKeyword, color: "var(--teal)", fontWeight: "700" },
  { tag: tags.controlKeyword, color: "var(--mauve)", fontWeight: "700" },
  { tag: tags.definitionKeyword, color: "var(--pink)", fontWeight: "700" },
  { tag: tags.operatorKeyword, color: "var(--sapphire)", fontWeight: "600" },
  { tag: tags.keyword, color: "var(--mauve)", fontWeight: "600" },
  { tag: [tags.string, tags.character], color: "var(--green)" },
  { tag: tags.escape, color: "var(--pink)", fontWeight: "600" },
  { tag: tags.regexp, color: "var(--teal)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--peach)" },
  { tag: [tags.typeName, tags.className], color: "var(--lavender)", fontWeight: "600" },
  { tag: tags.namespace, color: "var(--teal)" },
  { tag: tags.function(tags.variableName), color: "var(--blue)", fontWeight: "600" },
  { tag: tags.definition(tags.variableName), color: "var(--text)", fontWeight: "600" },
  { tag: tags.standard(tags.variableName), color: "var(--sky)" },
  { tag: tags.operator, color: "var(--sapphire)" },
  { tag: [tags.punctuation, tags.separator], color: "var(--overlay1)" },
  { tag: tags.bracket, color: "var(--subtext0)" },
  { tag: tags.variableName, color: "var(--text)" },
  { tag: tags.propertyName, color: "var(--sky)", fontWeight: "500" },
  { tag: tags.labelName, color: "var(--yellow)" },
  { tag: tags.atom, color: "var(--maroon)" },
  { tag: tags.invalid, color: "var(--red)", textDecoration: "underline wavy var(--red)" },
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
