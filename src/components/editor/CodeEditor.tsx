import { useCallback, useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import {
  EditorState,
  Prec,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  DEBUG_CURRENT_LINE_CLASS,
  goideEditorExtensions,
  PREDICTED_HINT_UNDERLINE_CLASS,
} from "./codemirrorTheme";
import { EditorView, GutterMarker, gutter, keymap } from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentWithTab,
} from "@codemirror/commands";
import {
  closeSearchPanel,
  findNext,
  openSearchPanel,
  search,
  searchKeymap,
  searchPanelOpen,
} from "@codemirror/search";
import { lintGutter, linter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import {
  acceptCompletion,
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  closeCompletion,
  hasNextSnippetField,
  hasPrevSnippetField,
  nextSnippetField,
  prevSnippetField,
  moveCompletionSelection,
  startCompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import type { VisibleLineRange } from "../../features/concurrency/signalDensity";
import type {
  CompletionItem,
  CompletionRange,
  EditorDiagnostic,
} from "../../lib/ipc/types";

const GO_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const GO_IDENTIFIER_BEFORE_CURSOR = /[A-Za-z_][A-Za-z0-9_]*/;
const GOPLS_AUTO_PREFIX_LENGTH = 2;

const snippetSection = { name: "Go snippets", rank: -1 };

const COMMON_GO_PACKAGE_IMPORTS: Record<string, string> = {
  bytes: "bytes",
  cmp: "cmp",
  context: "context",
  csv: "encoding/csv",
  errors: "errors",
  filepath: "path/filepath",
  flag: "flag",
  fmt: "fmt",
  http: "net/http",
  io: "io",
  json: "encoding/json",
  log: "log",
  maps: "maps",
  math: "math",
  os: "os",
  rand: "math/rand",
  regexp: "regexp",
  slices: "slices",
  sort: "sort",
  strconv: "strconv",
  strings: "strings",
  sync: "sync",
  testing: "testing",
  time: "time",
  url: "net/url",
};

const PACKAGE_NAME_COMPLETIONS: Completion[] = [
  {
    label: "main",
    detail: "package name",
    type: "keyword",
    apply: "main",
    section: snippetSection,
    boost: 40,
  },
];

const PACKAGE_SNIPPETS: Completion[] = [
  snippetCompletion("package main\n\n${}", {
    label: "package main",
    detail: "package declaration",
    type: "keyword",
    section: snippetSection,
    boost: 40,
  }),
];

const GO_SNIPPETS: Completion[] = [
  snippetCompletion("func ${name}(${params}) {\n\t${}\n}", {
    label: "func",
    detail: "function declaration",
    type: "function",
    section: snippetSection,
    boost: 30,
  }),
  snippetCompletion("func main() {\n\t${}\n}", {
    label: "main",
    detail: "main function",
    type: "function",
    section: snippetSection,
    boost: 30,
  }),
  snippetCompletion("if ${condition} {\n\t${}\n}", {
    label: "if",
    detail: "if block",
    type: "keyword",
    section: snippetSection,
    boost: 25,
  }),
  snippetCompletion("if err != nil {\n\treturn ${}\n}", {
    label: "iferr",
    detail: "error guard",
    type: "keyword",
    section: snippetSection,
    boost: 25,
  }),
  snippetCompletion("for ${condition} {\n\t${}\n}", {
    label: "for",
    detail: "for loop",
    type: "keyword",
    section: snippetSection,
    boost: 20,
  }),
  snippetCompletion("for ${key}, ${value} := range ${collection} {\n\t${}\n}", {
    label: "forr",
    detail: "range loop",
    type: "keyword",
    section: snippetSection,
    boost: 20,
  }),
  snippetCompletion("switch ${value} {\ncase ${caseValue}:\n\t${}\ndefault:\n\t${}\n}", {
    label: "switch",
    detail: "switch block",
    type: "keyword",
    section: snippetSection,
  }),
  snippetCompletion("select {\ncase ${value} := <-${channel}:\n\t${}\ndefault:\n\t${}\n}", {
    label: "select",
    detail: "select block",
    type: "keyword",
    section: snippetSection,
  }),
  snippetCompletion("go func() {\n\t${}\n}()", {
    label: "gofn",
    detail: "goroutine function",
    type: "function",
    section: snippetSection,
  }),
  snippetCompletion("defer ${call}()", {
    label: "defer",
    detail: "deferred call",
    type: "keyword",
    section: snippetSection,
  }),
  snippetCompletion("type ${Name} struct {\n\t${}\n}", {
    label: "struct",
    detail: "struct type",
    type: "type",
    section: snippetSection,
  }),
  snippetCompletion("type ${Name} interface {\n\t${}\n}", {
    label: "interface",
    detail: "interface type",
    type: "interface",
    section: snippetSection,
  }),
  snippetCompletion("func (${receiver} *${Type}) ${name}(${params}) {\n\t${}\n}", {
    label: "method",
    detail: "method declaration",
    type: "method",
    section: snippetSection,
  }),
  snippetCompletion("func Test${Name}(t *testing.T) {\n\t${}\n}", {
    label: "test",
    detail: "Go test",
    type: "function",
    section: snippetSection,
  }),
  snippetCompletion("func Benchmark${Name}(b *testing.B) {\n\tfor i := 0; i < b.N; i++ {\n\t\t${}\n\t}\n}", {
    label: "bench",
    detail: "Go benchmark",
    type: "function",
    section: snippetSection,
  }),
  snippetCompletion("${name} := make(chan ${type})", {
    label: "makechan",
    detail: "channel allocation",
    type: "variable",
    section: snippetSection,
  }),
  snippetCompletion("var wg sync.WaitGroup\n${}", {
    label: "wg",
    detail: "wait group",
    type: "variable",
    section: snippetSection,
  }),
  snippetCompletion("var mu sync.Mutex\n${}", {
    label: "mutex",
    detail: "mutex",
    type: "variable",
    section: snippetSection,
  }),
];

const GO_FUNCTION_NAME_SNIPPETS: Completion[] = [
  snippetCompletion("main() {\n\t${}\n}", {
    label: "main",
    detail: "main function",
    type: "function",
    section: snippetSection,
    boost: 40,
  }),
  snippetCompletion("Test${Name}(t *testing.T) {\n\t${}\n}", {
    label: "test",
    detail: "Go test",
    type: "function",
    section: snippetSection,
    boost: 20,
  }),
  snippetCompletion(
    "Benchmark${Name}(b *testing.B) {\n\tfor i := 0; i < b.N; i++ {\n\t\t${}\n\t}\n}",
    {
      label: "bench",
      detail: "Go benchmark",
      type: "function",
      section: snippetSection,
      boost: 15,
    }
  ),
];

function isPackageLineContext(linePrefix: string) {
  return /^\s*package(?:\s+[A-Za-z_][A-Za-z0-9_]*)?\s*$/.test(linePrefix);
}

function isFunctionNameContext(linePrefix: string) {
  return /^\s*func\s+(?:\([^)]*\)\s*)?(?:[A-Za-z_][A-Za-z0-9_]*)?$/.test(
    linePrefix
  );
}

function isPackageContextAtSelection(view: EditorView) {
  const cursor = view.state.selection.main.head;
  const lineInfo = view.state.doc.lineAt(cursor);
  const linePrefix = view.state.sliceDoc(lineInfo.from, cursor);
  return isPackageLineContext(linePrefix);
}

function importedPackageAliases(source: string) {
  const aliases = new Map<string, string>();
  const addImportAlias = (rawAlias: string | undefined, importPath: string) => {
    if (rawAlias === "." || rawAlias === "_") {
      return;
    }
    const alias =
      rawAlias ??
      importPath
        .split("/")
        .pop()
        ?.replace(/[^A-Za-z0-9_]/g, "_");
    if (alias && GO_IDENTIFIER_PATTERN.test(alias)) {
      aliases.set(alias, importPath);
    }
  };

  const singleImportPattern = /^\s*import\s+(?:(\w+|[._])\s+)?"([^"]+)"\s*$/gm;
  for (const match of source.matchAll(singleImportPattern)) {
    addImportAlias(match[1], match[2]);
  }

  const blockImportPattern = /^\s*import\s*\(([\s\S]*?)^\s*\)/gm;
  for (const block of source.matchAll(blockImportPattern)) {
    const importLinePattern = /^\s*(?:(\w+|[._])\s+)?"([^"]+)"/gm;
    for (const match of block[1].matchAll(importLinePattern)) {
      addImportAlias(match[1], match[2]);
    }
  }

  return aliases;
}

function insertTextAt(source: string, position: number, text: string) {
  return `${source.slice(0, position)}${text}${source.slice(position)}`;
}

function sourceHasImport(source: string, importPath: string) {
  const escaped = importPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*(?:\\w+|[._])?\\s*"${escaped}"\\s*$`, "m").test(
    source
  );
}

function buildImportInsertionChange(source: string, importPath: string) {
  if (sourceHasImport(source, importPath)) {
    return null;
  }

  const packageMatch = /^\s*package\s+[A-Za-z_][A-Za-z0-9_]*.*$/m.exec(source);
  if (!packageMatch) {
    return null;
  }

  const insertAt = packageMatch.index + packageMatch[0].length;
  const insertText = source.slice(insertAt).startsWith("\n\n")
    ? `\nimport "${importPath}"`
    : `\nimport "${importPath}"\n`;

  return {
    from: insertAt,
    to: insertAt,
    insert: insertText,
  };
}

function applyTextChange(
  source: string,
  change: { from: number; to: number; insert: string }
) {
  return `${source.slice(0, change.from)}${change.insert}${source.slice(
    change.to
  )}`;
}

function normalizeCompletionMetaText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function positionToLineColumn(source: string, position: number) {
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < position; index += 1) {
    if (source[index] === "\n") {
      line += 1;
      lineStart = index + 1;
    }
  }

  return {
    line,
    column: position - lineStart + 1,
  };
}

function resolvePackageQualifier(source: string, alias: string) {
  const importedAliases = importedPackageAliases(source);
  const importedPath = importedAliases.get(alias);
  if (importedPath) {
    return {
      alias,
      importPath: importedPath,
      shouldInsertImport: false,
    };
  }

  const commonImportPath = COMMON_GO_PACKAGE_IMPORTS[alias];
  if (!commonImportPath) {
    return null;
  }

  return {
    alias,
    importPath: commonImportPath,
    shouldInsertImport: !sourceHasImport(source, commonImportPath),
  };
}

function buildPackageMemberCompletionDocument(
  source: string,
  cursorPosition: number,
  qualifier: { importPath: string; shouldInsertImport: boolean }
) {
  let nextSource = source;
  let nextCursorPosition = cursorPosition;
  const importChange = qualifier.shouldInsertImport
    ? buildImportInsertionChange(source, qualifier.importPath)
    : null;

  if (importChange) {
    nextSource = applyTextChange(nextSource, importChange);
    if (importChange.from <= nextCursorPosition) {
      nextCursorPosition += importChange.insert.length;
    }
  }

  nextSource = insertTextAt(nextSource, nextCursorPosition, ".");
  nextCursorPosition += 1;

  return {
    fileContent: nextSource,
    cursor: positionToLineColumn(nextSource, nextCursorPosition),
  };
}

type InteractionAnchor = {
  top: number;
  left: number;
};

export type JumpRequest = {
  line: number;
  requestId: number;
};

export type EditorCompletionRequest = {
  line: number;
  column: number;
  explicit: boolean;
  triggerCharacter?: string | null;
  fileContent?: string | null;
};

class BreakpointMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div");
    el.className = "goide-breakpoint-marker";
    el.setAttribute("aria-hidden", "true");
    return el;
  }
}

const breakpointEffect = StateEffect.define<number[]>();
const breakpointField = StateField.define<RangeSet<BreakpointMarker>>({
  create() { return RangeSet.empty; },
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(breakpointEffect)) {
        const builder = new RangeSetBuilder<BreakpointMarker>();
        const sorted = [...e.value].sort((a, b) => a - b);
        for (const line of sorted) {
          if (line > 0 && line <= tr.state.doc.lines) {
            builder.add(tr.state.doc.line(line).from, tr.state.doc.line(line).from, new BreakpointMarker());
          }
        }
        set = builder.finish();
      }
    }
    return set;
  },
  provide: f => gutter({
    class: "cm-breakpoint-gutter",
    markers: v => v.state.field(f)
  })
});

type CodeEditorProps = {
  value: string;
  selectionContextKey?: string | null;
  hintLine?: number | null;
  executionLine?: number | null;
  counterpartLine?: number | null;
  jumpRequest?: JumpRequest | null;
  onHoverLineChange?: (line: number | null) => void;
  onSelectionLineChange?: (line: number | null) => void;
  onModifierClickLine?: (line: number) => boolean;
  onCounterpartAnchorChange?: (anchor: InteractionAnchor | null) => void;
  onInteractionAnchorChange?: (anchor: InteractionAnchor | null) => void;
  onViewportRangeChange?: (range: VisibleLineRange | null) => void;
  onSave?: (content: string) => void;
  onChange?: (value: string) => void;
  onRequestCompletions?: (
    request: EditorCompletionRequest
  ) => Promise<CompletionItem[]>;
  editable?: boolean;
  diagnostics?: EditorDiagnostic[];
  breakpoints?: number[];
  onToggleBreakpoint?: (line: number) => void;
};



function CodeEditor({
  value,
  selectionContextKey = null,
  hintLine = null,
  executionLine = null,
  jumpRequest = null,
  counterpartLine = null,
  onHoverLineChange,
  onSelectionLineChange,
  onModifierClickLine,
  onCounterpartAnchorChange,
  onInteractionAnchorChange,
  onViewportRangeChange,
  onSave,
  onChange,
  onRequestCompletions,
  editable = true,
  diagnostics = [],
  breakpoints = [],
  onToggleBreakpoint,
}: CodeEditorProps) {
  useEffect(() => {
    const view = viewRef.current;
    if (view) {
      view.dispatch({
        effects: breakpointEffect.of(breakpoints)
      });
    }
  }, [breakpoints]);

  const resolveCompletionRange = (
    view: EditorView,
    fallbackFrom: number,
    fallbackTo: number,
    item: CompletionItem,
    requestLine: number
  ) => {
    const range = item.range;
    if (!range || range.startLine !== requestLine || range.endLine !== requestLine) {
      const cursorPos = Math.max(fallbackFrom, fallbackTo);
      const lineInfo = view.state.doc.lineAt(cursorPos);
      const beforeCursor = view.state.sliceDoc(lineInfo.from, cursorPos);
      const prefixMatch = beforeCursor.match(/[A-Za-z_][A-Za-z0-9_]*$/);
      if (!prefixMatch) {
        return { from: fallbackFrom, to: cursorPos };
      }
      return {
        from: cursorPos - prefixMatch[0].length,
        to: cursorPos,
      };
    }

    const lineInfo = view.state.doc.line(requestLine);
    const lineLength = lineInfo.to - lineInfo.from;
    const fromOffset = Math.min(
      lineLength,
      Math.max(0, range.startColumn - 1)
    );
    const toOffset = Math.min(
      lineLength,
      Math.max(fromOffset, range.endColumn - 1)
    );

    return {
      from: lineInfo.from + fromOffset,
      to: lineInfo.from + toOffset,
    };
  };

  const resolveCompletionTextEditRange = (
    view: EditorView,
    range: CompletionRange
  ) => {
    const maxLine = view.state.doc.lines;
    const startLine = Math.min(maxLine, Math.max(1, range.startLine));
    const endLine = Math.min(maxLine, Math.max(startLine, range.endLine));
    const startLineInfo = view.state.doc.line(startLine);
    const endLineInfo = view.state.doc.line(endLine);
    const startOffset = Math.min(
      startLineInfo.to - startLineInfo.from,
      Math.max(0, range.startColumn - 1)
    );
    const endOffset = Math.min(
      endLineInfo.to - endLineInfo.from,
      Math.max(0, range.endColumn - 1)
    );

    return {
      from: startLineInfo.from + startOffset,
      to: endLineInfo.from + endOffset,
    };
  };

  const dispatchCompletionChanges = (
    view: EditorView,
    mainChange: { from: number; to: number; insert: string },
    additionalTextEdits: CompletionItem["additionalTextEdits"] = []
  ) => {
    const changes = [
      ...additionalTextEdits.map((edit) => {
        const range = resolveCompletionTextEditRange(view, edit.range);
        return {
          from: range.from,
          to: range.to,
          insert: edit.newText,
        };
      }),
      mainChange,
    ].sort((a, b) => a.from - b.from || a.to - b.to);

    view.dispatch({ changes });
  };

  const localSnippetSource = useCallback<CompletionSource>((context) => {
    const prefixMatch = context.matchBefore(GO_IDENTIFIER_BEFORE_CURSOR);
    if (!context.explicit && !prefixMatch) {
      return null;
    }

    const lineInfo = context.state.doc.lineAt(context.pos);
    const linePrefix = context.state.sliceDoc(lineInfo.from, context.pos);
    if (isPackageLineContext(linePrefix)) {
      return {
        from: prefixMatch ? prefixMatch.from : context.pos,
        validFor: GO_IDENTIFIER_PATTERN,
        options: PACKAGE_NAME_COMPLETIONS,
      };
    }

    if (isFunctionNameContext(linePrefix)) {
      return {
        from: prefixMatch ? prefixMatch.from : context.pos,
        validFor: GO_IDENTIFIER_PATTERN,
        options: GO_FUNCTION_NAME_SNIPPETS,
      };
    }

    const precedingText = context.state.sliceDoc(0, lineInfo.from).trim();
    const options =
      precedingText.length === 0 ? [...PACKAGE_SNIPPETS, ...GO_SNIPPETS] : GO_SNIPPETS;

    return {
      from: prefixMatch ? prefixMatch.from : context.pos,
      validFor: GO_IDENTIFIER_PATTERN,
      options,
    };
  }, []);

  const goplsCompletionSource = useCallback(
    async (context: CompletionContext): Promise<CompletionResult | null> => {
      if (!onRequestCompletions) {
        return null;
      }

      const triggerCharacter = context.pos > 0
        ? context.state.sliceDoc(context.pos - 1, context.pos)
        : "";
      const documentText = context.state.doc.toString();
      const shouldTriggerByDot = triggerCharacter === ".";
      const prefixMatch = context.matchBefore(GO_IDENTIFIER_BEFORE_CURSOR);
      const virtualPackageQualifier = (() => {
        if (
          context.explicit ||
          shouldTriggerByDot ||
          prefixMatch === null ||
          prefixMatch.text.length < 2
        ) {
          return null;
        }

        return resolvePackageQualifier(documentText, prefixMatch.text);
      })();
      const shouldTriggerByWord =
        prefixMatch !== null && prefixMatch.text.length >= GOPLS_AUTO_PREFIX_LENGTH;
      if (
        !context.explicit &&
        !shouldTriggerByDot &&
        !shouldTriggerByWord &&
        virtualPackageQualifier === null
      ) {
        return null;
      }

      const lineInfo = context.state.doc.lineAt(context.pos);
      const linePrefix = context.state.sliceDoc(lineInfo.from, context.pos);
      if (isPackageLineContext(linePrefix)) {
        return null;
      }
      const virtualCompletionDocument =
        virtualPackageQualifier === null
          ? null
          : buildPackageMemberCompletionDocument(
              documentText,
              context.pos,
              virtualPackageQualifier
            );
      const requestPosition = virtualCompletionDocument?.cursor ?? {
        line: lineInfo.number,
        column: Math.max(1, context.pos - lineInfo.from + 1),
      };

      const request: EditorCompletionRequest = {
        line: requestPosition.line,
        column: requestPosition.column,
        explicit: context.explicit,
        triggerCharacter:
          shouldTriggerByDot || virtualPackageQualifier !== null ? "." : null,
        fileContent: virtualCompletionDocument?.fileContent ?? documentText,
      };

      const items = await onRequestCompletions(request);
      if (context.aborted) {
        return null;
      }
      if (items.length === 0) {
        return null;
      }

      const completionFrom = prefixMatch ? prefixMatch.from : context.pos;

      return {
        from: completionFrom,
        validFor: GO_IDENTIFIER_PATTERN,
        options: items.map((item) => ({
          label: item.label,
          detail: normalizeCompletionMetaText(item.detail),
          info: normalizeCompletionMetaText(item.documentation),
          type: item.kind ?? undefined,
          apply: (view, _completion, from, to) => {
            if (virtualPackageQualifier !== null && prefixMatch !== null) {
              const importChange = virtualPackageQualifier.shouldInsertImport
                ? buildImportInsertionChange(
                    view.state.doc.toString(),
                    virtualPackageQualifier.importPath
                  )
                : null;
              const mainChange = {
                from: prefixMatch.from,
                to: context.pos,
                insert: `${virtualPackageQualifier.alias}.${
                  item.insertText || item.label
                }`,
              };
              const changes = importChange
                ? [importChange, mainChange].sort(
                    (a, b) => a.from - b.from || a.to - b.to
                  )
                : [mainChange];
              view.dispatch({ changes });
              return;
            }

            const range = resolveCompletionRange(
              view,
              from,
              to,
              item,
              request.line
            );
            const rawInsertText = item.insertText || item.label;
            const linePrefix = view.state.sliceDoc(
              view.state.doc.lineAt(context.pos).from,
              context.pos
            );
            // Avoid "func func main" when accepting completions in function-name context.
            const normalizedInsertText =
              isFunctionNameContext(linePrefix) &&
              rawInsertText.trimStart().startsWith("func ")
                ? rawInsertText.trimStart().replace(/^func\s+/, "")
                : rawInsertText;
            dispatchCompletionChanges(
              view,
              {
                from: range.from,
                to: Math.max(range.to, to),
                insert: normalizedInsertText,
              },
              item.additionalTextEdits
            );
          },
        })),
      };
    },
    [onRequestCompletions]
  );

  const buildCodeMirrorDiagnostics = (view: EditorView): Diagnostic[] => {
    if (diagnostics.length === 0) {
      return [];
    }

    return diagnostics.map((diagnostic) => {
      const maxLine = view.state.doc.lines;
      const startLine = Math.min(maxLine, Math.max(1, diagnostic.range.startLine));
      const endLine = Math.min(maxLine, Math.max(startLine, diagnostic.range.endLine));
      const startLineInfo = view.state.doc.line(startLine);
      const endLineInfo = view.state.doc.line(endLine);

      const startOffset = Math.max(0, diagnostic.range.startColumn - 1);
      const lineLength = startLineInfo.to - startLineInfo.from;
      const clampedStartOffset = Math.min(lineLength, startOffset);
      const from = startLineInfo.from + clampedStartOffset;
      
      const requestedEnd = endLineInfo.from + Math.max(startOffset + 1, diagnostic.range.endColumn - 1);
      const to = Math.min(endLineInfo.to, Math.max(from + 1, requestedEnd));
      const severity: Diagnostic["severity"] =
        diagnostic.severity === "warning"
          ? "warning"
          : diagnostic.severity === "info"
            ? "info"
            : "error";

      return {
        from,
        to,
        severity,
        source: diagnostic.source ?? undefined,
        message: diagnostic.message,
      };
    });
  };

  const extensions = useMemo(() => [
    ...goideEditorExtensions,
    breakpointField,
    EditorState.readOnly.of(!editable),
    EditorState.tabSize.of(4),
    EditorView.editable.of(editable),
    history(),
    lintGutter(),
    linter(() => []),
    closeBrackets(),
    search({
      top: true,
    }),
    autocompletion({
      override: [localSnippetSource, goplsCompletionSource],
      activateOnTyping: true,
      defaultKeymap: false,
      maxRenderedOptions: 80,
      updateSyncTime: 80,
    }),
    Prec.highest(keymap.of([
      {
        key: "Tab",
        run: (view) => {
          if (hasNextSnippetField(view.state)) {
            return nextSnippetField(view);
          }
          return acceptCompletion(view) || (indentWithTab.run?.(view) ?? false);
        },
      },
      {
        key: "Shift-Tab",
        run: (view) => {
          if (hasPrevSnippetField(view.state)) {
            return prevSnippetField(view);
          }
          return indentLess(view);
        },
      },
      {
        key: "Enter",
        run: (view) => {
          if (searchPanelOpen(view.state)) {
            return findNext(view);
          }
          if (isPackageContextAtSelection(view)) {
            return false;
          }
          return acceptCompletion(view);
        },
      },
      {
        key: "ArrowDown",
        run: moveCompletionSelection(true),
      },
      {
        key: "ArrowUp",
        run: moveCompletionSelection(false),
      },
      {
        key: "PageDown",
        run: moveCompletionSelection(true, "page"),
      },
      {
        key: "PageUp",
        run: moveCompletionSelection(false, "page"),
      },
      {
        key: "Escape",
        run: (view) => closeCompletion(view) || closeSearchPanel(view),
      },
      {
        key: "Ctrl-Space",
        run: (view) => {
          startCompletion(view);
          return true;
        },
      },
      {
        key: "Mod-f",
        run: openSearchPanel,
      },
      {
        key: "Mod-s",
        run: (view) => {
          onSave?.(view.state.doc.toString());
          return true;
        },
      },
      ...searchKeymap,
      ...closeBracketsKeymap,
      ...historyKeymap,
      ...defaultKeymap,
    ])),
    EditorView.updateListener.of((update) => {
      if (update.geometryChanged || update.viewportChanged) {
        // Schedule anchor sync on the next microtask to avoid read-during-render layout thrashing
        queueMicrotask(() => {
          const view = update.view;
          const container = containerRef.current;
          if (!view || !container) return;

          if (onCounterpartAnchorChange && counterpartLine !== null && counterpartLine >= 1 && counterpartLine <= view.state.doc.lines) {
            const cFrom = view.state.doc.line(counterpartLine).from;
            const cCoords = view.coordsAtPos(cFrom);
            if (cCoords) {
              const rect = container.getBoundingClientRect();
              onCounterpartAnchorChange({
                top: Math.max(8, Math.round(cCoords.top - rect.top)),
                left: Math.max(8, Math.round(cCoords.left - rect.left + 16)), // Offset to nudge anchor into text area
              });
            } else {
              onCounterpartAnchorChange(null);
            }
          }

          if (onInteractionAnchorChange) {
            let activeLineNum = hoveredLineRef.current ?? selectedLineRef.current;
            if (activeLineNum !== null && activeLineNum >= 1 && activeLineNum <= view.state.doc.lines) {
              const aFrom = view.state.doc.line(activeLineNum).from;
              const aCoords = view.coordsAtPos(aFrom);
              if (aCoords) {
                const rect = container.getBoundingClientRect();
                onInteractionAnchorChange({
                  top: Math.max(8, Math.round(aCoords.top - rect.top)),
                  left: Math.max(8, Math.round(aCoords.left - rect.left + 16)),
                });
              } else {
                // Out of view
                onInteractionAnchorChange(null);
              }
            }
          }
        });
      }
    })
  ], [
    counterpartLine,
    editable,
    goplsCompletionSource,
    localSnippetSource,
    onCounterpartAnchorChange,
    onInteractionAnchorChange,
    onSave,
  ]);
  const viewRef = useRef<EditorView | null>(null);
  const highlightedLineRef = useRef<number | null>(null);
  const executionLineRef = useRef<number | null>(null);
  const hoveredLineRef = useRef<number | null>(null);
  const selectedLineRef = useRef<number | null>(null);
  const viewportRangeRef = useRef<VisibleLineRange | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const getLineElement = (view: EditorView, lineNumber: number) => {
    if (lineNumber < 1 || lineNumber > view.state.doc.lines) {
      return null;
    }

    const from = view.state.doc.line(lineNumber).from;
    const domAtPos = view.domAtPos(from);
    const anchor =
      domAtPos.node instanceof Element ? domAtPos.node : domAtPos.node.parentElement;
    return anchor?.closest(".cm-line");
  };

  const emitViewportRange = (view: EditorView) => {
    if (!onViewportRangeChange) {
      return;
    }

    const fromLine = view.state.doc.lineAt(view.viewport.from).number;
    const toPosition = Math.max(view.viewport.from, view.viewport.to - 1);
    const toLine = view.state.doc.lineAt(toPosition).number;
    const nextRange: VisibleLineRange = { fromLine, toLine };
    const previousRange = viewportRangeRef.current;

    if (
      previousRange?.fromLine === nextRange.fromLine &&
      previousRange?.toLine === nextRange.toLine
    ) {
      return;
    }

    viewportRangeRef.current = nextRange;
    onViewportRangeChange(nextRange);
  };

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const previousLine = highlightedLineRef.current;
    if (previousLine !== null) {
      getLineElement(view, previousLine)?.classList.remove(
        PREDICTED_HINT_UNDERLINE_CLASS
      );
      highlightedLineRef.current = null;
    }

    if (hintLine !== null) {
      getLineElement(view, hintLine)?.classList.add(
        PREDICTED_HINT_UNDERLINE_CLASS
      );
      highlightedLineRef.current = hintLine;
    }
  }, [hintLine, value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const previousLine = executionLineRef.current;
    if (previousLine !== null) {
      getLineElement(view, previousLine)?.classList.remove(DEBUG_CURRENT_LINE_CLASS);
      executionLineRef.current = null;
    }
    if (executionLine !== null) {
      getLineElement(view, executionLine)?.classList.add(DEBUG_CURRENT_LINE_CLASS);
      executionLineRef.current = executionLine;
    }
  }, [executionLine, value]);

  useEffect(() => {
    // New file/content context should not inherit previous-line dedupe state.
    selectedLineRef.current = null;
  }, [selectionContextKey, value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const cmDiagnostics = buildCodeMirrorDiagnostics(view);
    view.dispatch(setDiagnostics(view.state, cmDiagnostics));
  }, [diagnostics, value]);

  useEffect(() => {
    const view = viewRef.current;
    const container = containerRef.current;
    if (!view || !container) {
      return;
    }

    const requestMeasure = () => {
      view.requestMeasure();
      emitViewportRange(view);
    };

    const scrollElement = view.scrollDOM as Partial<HTMLElement> & {
      scrollBy?: (options: ScrollToOptions) => void;
      style?: CSSStyleDeclaration;
    };
    if (scrollElement.style) {
      scrollElement.style.overscrollBehavior = "contain";
    }

    const handleWheel = (event: WheelEvent) => {
      const target = event.target as Node | null;
      if (!target || !container.contains(target) || event.ctrlKey) {
        return;
      }
      if (event.deltaX === 0 && event.deltaY === 0) {
        return;
      }
      scrollElement.scrollBy?.({
        left: event.deltaX,
        top: event.deltaY,
        behavior: "auto",
      });
      emitViewportRange(view);
      event.preventDefault();
    };

    requestMeasure();

    const resizeObserver = new ResizeObserver(() => {
      requestMeasure();
    });
    resizeObserver.observe(container);
    document.addEventListener("wheel", handleWheel, { passive: false, capture: true });

    const fonts = document.fonts;
    void fonts.ready.then(() => {
      if (viewRef.current === view) {
        requestMeasure();
      }
    });

    return () => {
      resizeObserver.disconnect();
      document.removeEventListener("wheel", handleWheel, true);
    };
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || jumpRequest === null) {
      return;
    }

    const line = jumpRequest.line;
    if (line < 1 || line > view.state.doc.lines) {
      return;
    }

    const from = view.state.doc.line(line).from;
    view.dispatch({
      selection: { anchor: from },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
    });
    view.focus();
    emitViewportRange(view);
    emitSelectionLine(line);
    emitInteractionAnchor(line);
  }, [jumpRequest]);

  useEffect(() => {
    const view = viewRef.current;
    const container = containerRef.current;
    if (!onCounterpartAnchorChange) return;

    if (!view || !container || counterpartLine === null || counterpartLine < 1 || counterpartLine > view.state.doc.lines) {
      onCounterpartAnchorChange(null);
      return;
    }

    // Remove the window.requestAnimationFrame here; we will handle position updates via EditorView.updateListener
    const from = view.state.doc.line(counterpartLine).from;
    const coords = view.coordsAtPos(from);
    if (!coords) {
      onCounterpartAnchorChange(null);
      return;
    }

    const rect = container.getBoundingClientRect();
    onCounterpartAnchorChange({
      top: Math.max(8, Math.round(coords.top - rect.top)),
      left: Math.max(8, Math.round(coords.left - rect.left + 16)),
    });
  }, [counterpartLine, value, onCounterpartAnchorChange]);

  const emitSelectionLine = (line: number | null) => {
    if (!onSelectionLineChange) {
      return;
    }

    if (selectedLineRef.current === line) {
      return;
    }

    selectedLineRef.current = line;
    onSelectionLineChange(line);
  };

  const emitInteractionAnchor = (line: number | null) => {
    if (!onInteractionAnchorChange) {
      return;
    }

    const view = viewRef.current;
    const container = containerRef.current;
    if (!view || !container || line === null || line < 1 || line > view.state.doc.lines) {
      onInteractionAnchorChange(null);
      return;
    }

    const from = view.state.doc.line(line).from;
    const coords = view.coordsAtPos(from);
    if (!coords) {
      onInteractionAnchorChange(null);
      return;
    }

    const rect = container.getBoundingClientRect();
    onInteractionAnchorChange({
      top: Math.max(8, Math.round(coords.top - rect.top)),
      left: Math.max(8, Math.round(coords.left - rect.left + 16)),
    });
  };

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full"
      onMouseMove={(event) => {
        const view = viewRef.current;
        if (!view) {
          return;
        }

        emitViewportRange(view);

        if (!onHoverLineChange) {
          return;
        }

        const pos = view.posAtCoords({
          x: event.clientX,
          y: event.clientY,
        });

        const nextLine = pos === null ? null : view.state.doc.lineAt(pos).number;


        if (nextLine !== hoveredLineRef.current) {
          hoveredLineRef.current = nextLine;
          onHoverLineChange(nextLine);
          emitInteractionAnchor(nextLine);
        }
      }}
      onMouseLeave={() => {
        hoveredLineRef.current = null;
        onHoverLineChange?.(null);
        emitInteractionAnchor(selectedLineRef.current);
      }}
      onBlurCapture={(event) => {
        const nextFocused = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(nextFocused)) {
          emitSelectionLine(null);
          emitInteractionAnchor(null);
        }
      }}
      onMouseDown={(event) => {
        const view_ = viewRef.current;
        if (!view_) {
          return;
        }

        const pos = view_.posAtCoords({
          x: event.clientX,
          y: event.clientY,
        });
        const nextLine = pos === null ? null : view_.state.doc.lineAt(pos).number;


        // Handle breakpoint toggle on gutter click
        const target = event.target as HTMLElement;
        if (target.closest(".cm-gutter") || target.closest(".cm-lineNumbers")) {
          if (nextLine !== null) {
            onToggleBreakpoint?.(nextLine);
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }

        const view = viewRef.current;
        if (!view) {
          return;
        }

        const isMac = navigator.platform.startsWith("Mac");
        const isModifierClick =
          event.button === 0 && (isMac ? event.metaKey : event.ctrlKey);
        if (nextLine !== null && isModifierClick && onModifierClickLine) {
          const didHandleModifierClick = onModifierClickLine(nextLine) === true;
          if (didHandleModifierClick) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }
        emitSelectionLine(nextLine);
        emitInteractionAnchor(nextLine);
      }}
      onKeyUp={() => {
        const view = viewRef.current;
        if (!view || !("selection" in view.state)) {
          return;
        }

        const head = view.state.selection.main.head;
        const nextLine = view.state.doc.lineAt(head).number;
        emitSelectionLine(nextLine);
        emitInteractionAnchor(nextLine);
      }}
    >
      <CodeMirror
        value={value}
        className="h-full min-h-0"
        height="100%"
        minHeight="100%"
        width="100%"
        theme="dark"
        basicSetup={false}
        extensions={extensions}
        onCreateEditor={(view) => {
          viewRef.current = view;
          view.requestMeasure();
          emitViewportRange(view);
        }}
        editable={editable}
        readOnly={!editable}
        onChange={onChange}
      />
    </div>
  );
}

export default CodeEditor;
