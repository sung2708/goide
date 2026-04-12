import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CodeEditor from "./CodeEditor";
import { PREDICTED_HINT_UNDERLINE_CLASS } from "./codemirrorTheme";
import type { EditorDiagnostic } from "../../lib/ipc/types";

const mockLine1 = document.createElement("div");
mockLine1.className = "cm-line";
const mockLine2 = document.createElement("div");
mockLine2.className = "cm-line";

const mockView = {
  viewport: {
    from: 1,
    to: 40,
  },
  dispatch: vi.fn(),
  focus: vi.fn(),
  posAtCoords: vi.fn(({ y }: { x: number; y: number }) => {
    if (y < 40) {
      return 5;
    }
    if (y < 90) {
      return 25;
    }
    return null;
  }),
  state: {
    doc: {
      lines: 2,
      lineAt: (pos: number) => (pos < 20 ? { number: 1 } : { number: 2 }),
      line: (lineNumber: number) => ({ from: lineNumber === 1 ? 5 : 25 }),
    },
  },
  domAtPos: (pos: number) => ({
    node: pos < 20 ? mockLine1 : mockLine2,
  }),
  coordsAtPos: (pos: number) =>
    pos < 20
      ? { left: 16, right: 28, top: 12, bottom: 24 }
      : { left: 16, right: 28, top: 44, bottom: 56 },
};

const setDiagnosticsMock = vi.fn();
const autocompletionMock = vi.fn();
const startCompletionMock = vi.fn((_view: unknown) => undefined);
const acceptCompletionMock = vi.fn((_view: unknown) => false);
let latestAutocompleteOverride:
  | ((context: {
      pos: number;
      explicit: boolean;
      matchBefore: (re: RegExp) => { from: number; to: number; text: string } | null;
      state: {
        sliceDoc: (from: number, to: number) => string;
        doc: {
          lineAt: (pos: number) => { number: number; from: number };
          toString: () => string;
        };
      };
    }) => Promise<{
      from: number;
      options: Array<{
        label: string;
        detail?: string;
        type?: string;
        apply: (
          view: { dispatch: (args: unknown) => void },
          completion: unknown,
          from: number,
          to: number
        ) => void;
      }>;
    } | null>)
  | null = null;

vi.mock("@codemirror/lint", () => ({
  linter: vi.fn(() => ({ extension: "mock-linter" })),
  lintGutter: vi.fn(() => ({ extension: "mock-lint-gutter" })),
  setDiagnostics: (...args: unknown[]) => {
    setDiagnosticsMock(...args);
    return { effects: [] };
  },
}));

vi.mock("@codemirror/autocomplete", () => ({
  autocompletion: (config: { override?: unknown[] }) => {
    latestAutocompleteOverride =
      (config.override?.[0] as typeof latestAutocompleteOverride) ?? null;
    autocompletionMock(config);
    return { extension: "mock-autocompletion" };
  },
  startCompletion: (view: unknown) => startCompletionMock(view),
  acceptCompletion: (view: unknown) => acceptCompletionMock(view),
}));

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ onCreateEditor }: { onCreateEditor?: (view: unknown) => void }) => {
    onCreateEditor?.(mockView);
    return <div data-testid="mock-codemirror" />;
  },
}));

describe("CodeEditor", () => {
  it("applies diagnostics to the editor view when diagnostics prop changes", () => {
    const diagnostics: EditorDiagnostic[] = [
      {
        severity: "warning",
        message: "unused variable",
        source: "gopls",
        code: "unused",
        range: {
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 4,
        },
      },
      {
        severity: "error",
        message: "expected expression",
        source: "gopls",
        code: null,
        range: {
          startLine: 2,
          startColumn: 5,
          endLine: 2,
          endColumn: 6,
        },
      },
    ];

    setDiagnosticsMock.mockClear();
    mockView.dispatch.mockClear();

    render(
      <CodeEditor
        value={"package main\nfunc main() {}\n"}
        diagnostics={diagnostics}
      />
    );

    expect(setDiagnosticsMock).toHaveBeenCalledWith(
      mockView.state,
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          message: "unused variable",
        }),
        expect.objectContaining({
          severity: "error",
          message: "expected expression",
        }),
      ])
    );
    expect(mockView.dispatch).toHaveBeenCalled();
  });

  it("moves selection, scrolls, and focuses editor on jump request", () => {
    mockView.dispatch.mockClear();
    mockView.focus.mockClear();
    const selectionSpy = vi.fn();
    const anchorSpy = vi.fn();

    render(
      <CodeEditor
        value={"package main\nfunc main() {}\n"}
        onSelectionLineChange={selectionSpy}
        onInteractionAnchorChange={anchorSpy}
        jumpRequest={{ line: 2, requestId: 1 }}
      />
    );

    expect(mockView.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { anchor: 25 },
        effects: expect.anything(),
      })
    );
    expect(mockView.focus).toHaveBeenCalledTimes(1);
    expect(selectionSpy).toHaveBeenCalledWith(2);
    expect(anchorSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 44 }));
  });

  it("maps mouse movement to hover line and clears on mouse leave", () => {
    const hoverSpy = vi.fn();
    const { container } = render(
      <CodeEditor value={"package main\nfunc main() {}\n"} onHoverLineChange={hoverSpy} />
    );

    const editorContainer = container.firstElementChild as HTMLElement;
    fireEvent.mouseMove(editorContainer, { clientX: 8, clientY: 20 });
    fireEvent.mouseMove(editorContainer, { clientX: 8, clientY: 20 });
    fireEvent.mouseMove(editorContainer, { clientX: 8, clientY: 60 });
    fireEvent.mouseLeave(editorContainer);

    expect(hoverSpy).toHaveBeenCalledTimes(3);
    expect(hoverSpy).toHaveBeenNthCalledWith(1, 1);
    expect(hoverSpy).toHaveBeenNthCalledWith(2, 2);
    expect(hoverSpy).toHaveBeenNthCalledWith(3, null);
  });

  it("emits selected line on editor click", () => {
    const selectionSpy = vi.fn();
    const { container } = render(
      <CodeEditor
        value={"package main\nfunc main() {}\n"}
        onSelectionLineChange={selectionSpy}
      />
    );

    const editorContainer = container.firstElementChild as HTMLElement;
    fireEvent.mouseDown(editorContainer, { clientX: 8, clientY: 60 });

    expect(selectionSpy).toHaveBeenCalledWith(2);
  });

  it("emits modifier-click line on Ctrl+click (non-Mac) and does not emit selection", () => {
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, "platform", {
      value: "Win32",
      configurable: true,
    });

    try {
      const selectionSpy = vi.fn();
      const modifierSpy = vi.fn().mockReturnValue(true);
      const { container } = render(
        <CodeEditor
          value={"package main\nfunc main() {}\n"}
          onSelectionLineChange={selectionSpy}
          onModifierClickLine={modifierSpy}
        />
      );

      const editorContainer = container.firstElementChild as HTMLElement;
      fireEvent.mouseDown(editorContainer, {
        clientX: 8,
        clientY: 60,
        button: 0,
        ctrlKey: true,
      });
      expect(modifierSpy).toHaveBeenCalledWith(2);
      expect(selectionSpy).not.toHaveBeenCalled();

      // metaKey alone should not trigger on non-Mac
      modifierSpy.mockClear();
      fireEvent.mouseDown(editorContainer, {
        clientX: 8,
        clientY: 60,
        button: 0,
        metaKey: true,
      });
      expect(modifierSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it("emits modifier-click line on Cmd+click (macOS) and does not emit selection", () => {
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });

    try {
      const selectionSpy = vi.fn();
      const modifierSpy = vi.fn().mockReturnValue(true);
      const { container } = render(
        <CodeEditor
          value={"package main\nfunc main() {}\n"}
          onSelectionLineChange={selectionSpy}
          onModifierClickLine={modifierSpy}
        />
      );

      const editorContainer = container.firstElementChild as HTMLElement;
      fireEvent.mouseDown(editorContainer, {
        clientX: 8,
        clientY: 60,
        button: 0,
        metaKey: true,
      });
      expect(modifierSpy).toHaveBeenCalledWith(2);
      expect(selectionSpy).not.toHaveBeenCalled();

      // ctrlKey alone should not trigger on macOS (Ctrl+Click = context menu)
      modifierSpy.mockClear();
      fireEvent.mouseDown(editorContainer, {
        clientX: 8,
        clientY: 60,
        button: 0,
        ctrlKey: true,
      });
      expect(modifierSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it("does not emit modifier-click on non-left-button modifier+click", () => {
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, "platform", {
      value: "Win32",
      configurable: true,
    });

    try {
      const selectionSpy = vi.fn();
      const modifierSpy = vi.fn();
      const { container } = render(
        <CodeEditor
          value={"package main\nfunc main() {}\n"}
          onSelectionLineChange={selectionSpy}
          onModifierClickLine={modifierSpy}
        />
      );

      const editorContainer = container.firstElementChild as HTMLElement;
      // button: 2 is right-click
      fireEvent.mouseDown(editorContainer, {
        clientX: 8,
        clientY: 60,
        button: 2,
        ctrlKey: true,
      });
      expect(modifierSpy).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it("resets dedupe state on file identity change so same line can be selected again", () => {
    const selectionSpy = vi.fn();
    const { container, rerender } = render(
      <CodeEditor
        value={"package same\nfunc same() {}\n"}
        selectionContextKey="a.go"
        onSelectionLineChange={selectionSpy}
      />
    );

    const editorContainer = container.firstElementChild as HTMLElement;
    fireEvent.mouseDown(editorContainer, { clientX: 8, clientY: 60 });
    expect(selectionSpy).toHaveBeenCalledTimes(1);

    rerender(
      <CodeEditor
        value={"package same\nfunc same() {}\n"}
        selectionContextKey="b.go"
        onSelectionLineChange={selectionSpy}
      />
    );
    fireEvent.mouseDown(editorContainer, { clientX: 8, clientY: 60 });
    expect(selectionSpy).toHaveBeenCalledTimes(2);
  });

  it("emits interaction anchor and clears selection on blur outside", () => {
    const selectionSpy = vi.fn();
    const anchorSpy = vi.fn();
    const { container } = render(
      <CodeEditor
        value={"package main\nfunc main() {}\n"}
        onSelectionLineChange={selectionSpy}
        onInteractionAnchorChange={anchorSpy}
      />
    );

    const editorContainer = container.firstElementChild as HTMLElement;
    fireEvent.mouseDown(editorContainer, { clientX: 8, clientY: 60 });
    expect(anchorSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 44 }));

    fireEvent.mouseLeave(editorContainer);
    expect(anchorSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 44 })
    );

    fireEvent.blur(editorContainer, { relatedTarget: document.body });
    expect(selectionSpy).toHaveBeenCalledWith(null);
    expect(anchorSpy).toHaveBeenLastCalledWith(null);
  });

  it("adds and removes predicted underline class for active hint line", () => {
    mockLine1.className = "cm-line";
    mockLine2.className = "cm-line";

    const { rerender } = render(
      <CodeEditor value={"package main\nfunc main() {}\n"} hintLine={2} />
    );
    expect(mockLine2.classList.contains(PREDICTED_HINT_UNDERLINE_CLASS)).toBe(
      true
    );

    rerender(<CodeEditor value={"package main\nfunc main() {}\n"} hintLine={null} />);
    expect(mockLine2.classList.contains(PREDICTED_HINT_UNDERLINE_CLASS)).toBe(
      false
    );
  });

  it("emits viewport range changes only when viewport changes", () => {
    const viewportSpy = vi.fn();
    const { container } = render(
      <CodeEditor
        value={"package main\nfunc main() {}\n"}
        onViewportRangeChange={viewportSpy}
      />
    );

    expect(viewportSpy).toHaveBeenCalledTimes(1);
    expect(viewportSpy).toHaveBeenNthCalledWith(1, { fromLine: 1, toLine: 2 });

    const editorContainer = container.firstElementChild as HTMLElement;
    fireEvent.mouseMove(editorContainer, { clientX: 8, clientY: 20 });
    fireEvent.mouseMove(editorContainer, { clientX: 8, clientY: 60 });
    expect(viewportSpy).toHaveBeenCalledTimes(1);

    mockView.viewport = { from: 20, to: 70 };
    fireEvent.mouseMove(editorContainer, { clientX: 8, clientY: 60 });
    expect(viewportSpy).toHaveBeenCalledTimes(2);
    expect(viewportSpy).toHaveBeenNthCalledWith(2, { fromLine: 2, toLine: 2 });
  });

  it("emits counterpart line anchor when counterpartLine is provided and within viewport", () => {
    const counterpartAnchorSpy = vi.fn();
    render(
      <CodeEditor
        value={"package main\nfunc main() {}\n"}
        counterpartLine={2}
        onCounterpartAnchorChange={counterpartAnchorSpy}
      />
    );

    // line 2 -> from: 13 -> domAtPos -> element
    // We assume posAtCoords / coordsAtPos returns mocked values.
    // The mock for view.coordsAtPos returns { top: 100, left: 200 } by default
    // Container rect is { top: 0, left: 0 } in JSDOM typically
    
    expect(counterpartAnchorSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 44 }));
  });

  it("requests completions on explicit trigger and applies selected candidate", async () => {
    const requestCompletions = vi.fn().mockResolvedValue([
      {
        label: "Println",
        detail: "func(a ...any)",
        kind: "func",
        insertText: "Println",
        range: null,
      },
    ]);

    render(
      <CodeEditor
        value={"package main\nfmt.\n"}
        onRequestCompletions={requestCompletions}
      />
    );

    expect(latestAutocompleteOverride).toBeTruthy();
    const result = await latestAutocompleteOverride?.({
      pos: 13,
      explicit: true,
      matchBefore: () => null,
      state: {
        sliceDoc: () => "",
        doc: {
          lineAt: () => ({ number: 2, from: 12 }),
          toString: () => "package main\nfmt.\n",
        },
      },
    });

    expect(requestCompletions).toHaveBeenCalledWith({
      line: 2,
      column: 2,
      explicit: true,
      triggerCharacter: null,
      fileContent: "package main\nfmt.\n",
    });
    expect(result?.options[0].label).toBe("Println");

    const dispatchMock = vi.fn();
    result?.options[0].apply(
      ({
        dispatch: dispatchMock,
        state: {
          doc: {
            lineAt: () => ({ from: 12 }),
          },
          sliceDoc: () => "",
        },
      } as any),
      {},
      13,
      13
    );
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({
          insert: "Println",
        }),
      })
    );
  });

  it("requests completions when dot is typed without explicit trigger", async () => {
    const requestCompletions = vi.fn().mockResolvedValue([]);

    render(
      <CodeEditor
        value={"package main\nfmt.\n"}
        onRequestCompletions={requestCompletions}
      />
    );

    expect(latestAutocompleteOverride).toBeTruthy();
    await latestAutocompleteOverride?.({
      pos: 13,
      explicit: false,
      matchBefore: () => null,
      state: {
        sliceDoc: () => ".",
        doc: {
          lineAt: () => ({ number: 2, from: 12 }),
          toString: () => "package main\nfmt.\n",
        },
      },
    });

    expect(requestCompletions).toHaveBeenCalledWith({
      line: 2,
      column: 2,
      explicit: false,
      triggerCharacter: ".",
      fileContent: "package main\nfmt.\n",
    });
  });

  it("replaces typed identifier prefix when completion range is absent", async () => {
    const requestCompletions = vi.fn().mockResolvedValue([
      {
        label: "Println",
        detail: "func(a ...any)",
        kind: "func",
        insertText: "Println",
        range: null,
      },
    ]);

    render(
      <CodeEditor
        value={"package main\nPrin\n"}
        onRequestCompletions={requestCompletions}
      />
    );

    const result = await latestAutocompleteOverride?.({
      pos: 16,
      explicit: true,
      matchBefore: () => ({ from: 12, to: 16, text: "Prin" }),
      state: {
        sliceDoc: () => "",
        doc: {
          lineAt: () => ({ number: 2, from: 12 }),
          toString: () => "package main\nPrin\n",
        },
      },
    });

    const dispatchMock = vi.fn();
    result?.options[0].apply(
      ({
        dispatch: dispatchMock,
        state: {
          doc: {
            lineAt: () => ({ from: 12 }),
          },
          sliceDoc: () => "Prin",
        },
      } as any),
      {},
      16,
      16
    );

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({
          from: 12,
          to: 16,
          insert: "Println",
        }),
      })
    );
  });
});
