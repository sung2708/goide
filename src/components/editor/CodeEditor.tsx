import { useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import {
  goideEditorExtensions,
  PREDICTED_HINT_UNDERLINE_CLASS,
} from "./codemirrorTheme";
import { EditorView, keymap } from "@codemirror/view";
import { history, historyKeymap } from "@codemirror/commands";
import { lintGutter, linter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import type { VisibleLineRange } from "../../features/concurrency/signalDensity";
import type { EditorDiagnostic } from "../../lib/ipc/types";

type InteractionAnchor = {
  top: number;
  left: number;
};

export type JumpRequest = {
  line: number;
  requestId: number;
};

type CodeEditorProps = {
  value: string;
  selectionContextKey?: string | null;
  hintLine?: number | null;
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
  editable?: boolean;
  diagnostics?: EditorDiagnostic[];
};

function CodeEditor({
  value,
  selectionContextKey = null,
  hintLine = null,
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
  editable = true,
  diagnostics = [],
}: CodeEditorProps) {
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
    EditorState.readOnly.of(!editable),
    EditorView.editable.of(editable),
    history(),
    lintGutter(),
    linter(() => []),
    keymap.of([
      ...historyKeymap,
      {
        key: "Mod-s",
        run: (view) => {
          onSave?.(view.state.doc.toString());
          return true;
        },
      },
    ]),
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
  ], [counterpartLine, editable, onCounterpartAnchorChange, onInteractionAnchorChange, onSave]);
  const viewRef = useRef<EditorView | null>(null);
  const highlightedLineRef = useRef<number | null>(null);
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
      className="h-full w-full"
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
        const view = viewRef.current;
        if (!view) {
          return;
        }

        const pos = view.posAtCoords({
          x: event.clientX,
          y: event.clientY,
        });
        const nextLine = pos === null ? null : view.state.doc.lineAt(pos).number;
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
        height="100%"
        width="100%"
        basicSetup={false}
        extensions={extensions}
        onCreateEditor={(view) => {
          viewRef.current = view;
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
