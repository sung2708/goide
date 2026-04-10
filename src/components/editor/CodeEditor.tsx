import { useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import {
  goideEditorExtensions,
  PREDICTED_HINT_UNDERLINE_CLASS,
} from "./codemirrorTheme";
import type { EditorView } from "@codemirror/view";
import type { VisibleLineRange } from "../../features/concurrency/signalDensity";

type CodeEditorProps = {
  value: string;
  hintLine?: number | null;
  onHoverLineChange?: (line: number | null) => void;
  onViewportRangeChange?: (range: VisibleLineRange | null) => void;
};

function CodeEditor({
  value,
  hintLine = null,
  onHoverLineChange,
  onViewportRangeChange,
}: CodeEditorProps) {
  const extensions = useMemo(() => goideEditorExtensions, []);
  const viewRef = useRef<EditorView | null>(null);
  const highlightedLineRef = useRef<number | null>(null);
  const hoveredLineRef = useRef<number | null>(null);
  const viewportRangeRef = useRef<VisibleLineRange | null>(null);

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

  return (
    <div
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
        }
      }}
      onMouseLeave={() => {
        hoveredLineRef.current = null;
        onHoverLineChange?.(null);
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
        editable={false}
        readOnly
      />
    </div>
  );
}

export default CodeEditor;
