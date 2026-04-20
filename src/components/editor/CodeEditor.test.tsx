import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  requestMeasure: vi.fn(),
  scrollDOM: {
    scrollBy: vi.fn(),
  },
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
const closeBracketsMock = vi.fn(() => ({ extension: "mock-close-brackets" }));
const startCompletionMock = vi.fn((_view: unknown) => undefined);
const acceptCompletionMock = vi.fn((_view: unknown) => false);
const closeCompletionMock = vi.fn((_view: unknown) => false);
const hasNextSnippetFieldMock = vi.fn(() => false);
const hasPrevSnippetFieldMock = vi.fn(() => false);
const nextSnippetFieldMock = vi.fn(() => true);
const prevSnippetFieldMock = vi.fn(() => true);
const moveCompletionSelectionMock = vi.fn(
  (_forward: boolean, _by?: "option" | "page") => (_view: unknown) => false
);
let latestKeyBindings: Array<{ key?: string; run?: (view: unknown) => boolean }> = [];
type TestCompletionResult = {
  from: number;
  options: Array<{
    label: string;
    detail?: string;
    info?: string;
    type?: string;
    section?: unknown;
    apply?: any;
  }>;
  validFor?: RegExp;
};
type TestCompletionSource =
  | ((context: {
      pos: number;
      explicit: boolean;
      matchBefore: (re: RegExp) => { from: number; to: number; text: string } | null;
      aborted?: boolean;
      state: {
        sliceDoc: (from: number, to: number) => string;
        doc: {
          lineAt: (pos: number) => { number: number; from: number };
          toString: () => string;
        };
      };
    }) => Promise<TestCompletionResult | null> | TestCompletionResult | null)
  | null;
let latestAutocompleteOverride: TestCompletionSource = null;
let latestAutocompleteOverrides: TestCompletionSource[] = [];

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
    latestAutocompleteOverrides =
      (config.override as TestCompletionSource[] | undefined) ?? [];
    latestAutocompleteOverride = latestAutocompleteOverrides[1] ?? null;
    autocompletionMock(config);
    return { extension: "mock-autocompletion" };
  },
  closeBrackets: () => closeBracketsMock(),
  closeBracketsKeymap: [{ key: "mock-close-bracket" }],
  closeCompletion: (view: unknown) => closeCompletionMock(view),
  hasNextSnippetField: () => hasNextSnippetFieldMock(),
  hasPrevSnippetField: () => hasPrevSnippetFieldMock(),
  moveCompletionSelection: (forward: boolean, by?: "option" | "page") =>
    moveCompletionSelectionMock(forward, by),
  nextSnippetField: () => nextSnippetFieldMock(),
  prevSnippetField: () => prevSnippetFieldMock(),
  snippetCompletion: (
    template: string,
    completion: Record<string, unknown>
  ) => ({
    ...completion,
    apply: template,
  }),
  startCompletion: (view: unknown) => startCompletionMock(view),
  acceptCompletion: (view: unknown) => acceptCompletionMock(view),
}));

vi.mock("@codemirror/view", async () => {
  const actual = await vi.importActual<typeof import("@codemirror/view")>("@codemirror/view");
  return {
    ...actual,
    keymap: {
      ...actual.keymap,
      of: (bindings: Array<{ key?: string; run?: (view: unknown) => boolean }>) => {
        latestKeyBindings = bindings;
        return { extension: "mock-keymap" };
      },
    },
  };
});

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ onCreateEditor }: { onCreateEditor?: (view: unknown) => void }) => {
    onCreateEditor?.(mockView);
    return <div data-testid="mock-codemirror" className="cm-editor" />;
  },
}));

describe("CodeEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasNextSnippetFieldMock.mockReturnValue(false);
    hasPrevSnippetFieldMock.mockReturnValue(false);
    nextSnippetFieldMock.mockReturnValue(true);
    prevSnippetFieldMock.mockReturnValue(true);
    acceptCompletionMock.mockReturnValue(false);
    mockView.requestMeasure.mockClear();
    mockView.scrollDOM.scrollBy.mockClear();
    latestKeyBindings = [];
  });

  it("keeps the editor host clipped inside the available viewport", () => {
    const { container } = render(<CodeEditor value={"package main\n"} />);

    expect(container.firstChild).toHaveClass("h-full", "min-h-0", "w-full");
    expect(container.firstChild).not.toHaveClass("overflow-hidden");
    expect(screen.getByTestId("mock-codemirror")).toBeInTheDocument();
  });

  it("forwards mouse wheel scrolling to the CodeMirror scroll container", () => {
    render(<CodeEditor value={"package main\n"} />);

    fireEvent.wheel(screen.getByTestId("mock-codemirror").parentElement as HTMLElement, {
      deltaX: 4,
      deltaY: 36,
    });

    expect(mockView.scrollDOM.scrollBy).toHaveBeenCalledWith({
      left: 4,
      top: 36,
      behavior: "auto",
    });
  });

  it("uses Tab to move snippet placeholders before completion acceptance", () => {
    hasNextSnippetFieldMock.mockReturnValue(true);
    nextSnippetFieldMock.mockReturnValue(true);
    acceptCompletionMock.mockReturnValue(false);

    render(<CodeEditor value={"package main\nf\n"} />);
    const tabBinding = latestKeyBindings.find((binding) => binding.key === "Tab");
    expect(tabBinding?.run).toBeDefined();

    const handled = tabBinding?.run?.({} as any);
    expect(handled).toBe(true);
    expect(nextSnippetFieldMock).toHaveBeenCalled();
    expect(acceptCompletionMock).not.toHaveBeenCalled();
  });

  it("uses Shift-Tab to move snippet placeholders backward before indentation fallback", () => {
    hasPrevSnippetFieldMock.mockReturnValue(true);
    prevSnippetFieldMock.mockReturnValue(true);

    render(<CodeEditor value={"package main\nfunc main() {\n\t${}\n}\n"} />);
    const shiftTabBinding = latestKeyBindings.find(
      (binding) => binding.key === "Shift-Tab"
    );
    expect(shiftTabBinding?.run).toBeDefined();

    const handled = shiftTabBinding?.run?.({} as any);
    expect(handled).toBe(true);
    expect(prevSnippetFieldMock).toHaveBeenCalled();
  });

  it("enables closeBrackets integration and keeps close-bracket key bindings active", () => {
    render(<CodeEditor value={"package main\n"} />);

    expect(closeBracketsMock).toHaveBeenCalledTimes(1);
    expect(latestKeyBindings).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "mock-close-bracket" })])
    );
  });

  it("keeps custom key handlers ahead of close-bracket key bindings", () => {
    render(<CodeEditor value={"package main\n"} />);

    const tabIndex = latestKeyBindings.findIndex((binding) => binding.key === "Tab");
    const closeBracketIndex = latestKeyBindings.findIndex(
      (binding) => binding.key === "mock-close-bracket"
    );

    expect(tabIndex).toBeGreaterThanOrEqual(0);
    expect(closeBracketIndex).toBeGreaterThanOrEqual(0);
    expect(tabIndex).toBeLessThan(closeBracketIndex);
  });

  it("keeps autocompletion configured for low-latency typing feedback", () => {
    render(<CodeEditor value={"package main\nfmt.\n"} />);

    expect(autocompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activateOnTyping: true,
        defaultKeymap: false,
        maxRenderedOptions: 80,
        updateSyncTime: 80,
      })
    );
    expect(latestAutocompleteOverrides).toHaveLength(2);
    expect(typeof latestAutocompleteOverrides[0]).toBe("function");
    expect(typeof latestAutocompleteOverrides[1]).toBe("function");
  });

  it("uses Tab to accept completion before indentation fallback", () => {
    hasNextSnippetFieldMock.mockReturnValue(false);
    acceptCompletionMock.mockReturnValue(true);

    render(<CodeEditor value={"package main\nfmt.\n"} />);
    const tabBinding = latestKeyBindings.find((binding) => binding.key === "Tab");
    expect(tabBinding?.run).toBeDefined();

    const handled = tabBinding?.run?.({} as any);
    expect(handled).toBe(true);
    expect(acceptCompletionMock).toHaveBeenCalled();
  });

  it("does not accept completion on Enter while editing package declaration context", () => {
    acceptCompletionMock.mockReturnValue(true);

    render(<CodeEditor value={"package ma"} />);
    const enterBinding = latestKeyBindings.find((binding) => binding.key === "Enter");
    expect(enterBinding?.run).toBeDefined();

    const handled = enterBinding?.run?.({
      state: {
        selection: { main: { head: 10 } },
        doc: {
          lineAt: () => ({ from: 0 }),
        },
        sliceDoc: () => "package ma",
      },
    } as any);

    expect(handled).toBe(false);
    expect(acceptCompletionMock).not.toHaveBeenCalled();
  });

  it("does not accept completion on Enter when cursor is after package keyword whitespace", () => {
    acceptCompletionMock.mockReturnValue(true);

    render(<CodeEditor value={"package "} />);
    const enterBinding = latestKeyBindings.find((binding) => binding.key === "Enter");
    expect(enterBinding?.run).toBeDefined();

    const handled = enterBinding?.run?.({
      state: {
        selection: { main: { head: 8 } },
        doc: {
          lineAt: () => ({ from: 0 }),
        },
        sliceDoc: () => "package ",
      },
    } as any);

    expect(handled).toBe(false);
    expect(acceptCompletionMock).not.toHaveBeenCalled();
  });

  it("accepts completion on Enter outside package declaration context", () => {
    acceptCompletionMock.mockReturnValue(true);

    render(<CodeEditor value={"fmt.\n"} />);
    const enterBinding = latestKeyBindings.find((binding) => binding.key === "Enter");
    expect(enterBinding?.run).toBeDefined();

    const handled = enterBinding?.run?.({
      state: {
        selection: { main: { head: 4 } },
        doc: {
          lineAt: () => ({ from: 0 }),
        },
        sliceDoc: () => "fmt.",
      },
    } as any);

    expect(handled).toBe(true);
    expect(acceptCompletionMock).toHaveBeenCalled();
  });

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
        changes: expect.arrayContaining([
          expect.objectContaining({
            insert: "Println",
          }),
        ]),
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

  it("requests completions when an identifier is typed without explicit trigger", async () => {
    const requestCompletions = vi.fn().mockResolvedValue([]);

    render(
      <CodeEditor
        value={"package main\nPrin\n"}
        onRequestCompletions={requestCompletions}
      />
    );

    expect(latestAutocompleteOverride).toBeTruthy();
    await latestAutocompleteOverride?.({
      pos: 16,
      explicit: false,
      matchBefore: () => ({ from: 12, to: 16, text: "Prin" }),
      state: {
        sliceDoc: () => "n",
        doc: {
          lineAt: () => ({ number: 2, from: 12 }),
          toString: () => "package main\nPrin\n",
        },
      },
    });

    expect(requestCompletions).toHaveBeenCalledWith({
      line: 2,
      column: 5,
      explicit: false,
      triggerCharacter: null,
      fileContent: "package main\nPrin\n",
    });
  });

  it("keeps rapid completion trigger bursts non-blocking on the typing path", async () => {
    const requestCompletions = vi
      .fn()
      .mockImplementation(() => new Promise<never>(() => {}));

    render(
      <CodeEditor
        value={"package main\nPrin\n"}
        onRequestCompletions={requestCompletions}
      />
    );

    expect(latestAutocompleteOverride).toBeTruthy();

    const context = {
      pos: 16,
      explicit: false,
      matchBefore: () => ({ from: 12, to: 16, text: "Prin" }),
      state: {
        sliceDoc: () => "n",
        doc: {
          lineAt: () => ({ number: 2, from: 12 }),
          toString: () => "package main\nPrin\n",
        },
      },
    };

    const burstCount = 200;
    const startedAt = performance.now();
    for (let index = 0; index < burstCount; index += 1) {
      void latestAutocompleteOverride?.(context);
    }
    const elapsedMs = performance.now() - startedAt;

    expect(requestCompletions).toHaveBeenCalledTimes(burstCount);
    expect(elapsedMs).toBeLessThan(250);
  });

  it("serves local snippets while typing without calling gopls too early", async () => {
    const requestCompletions = vi.fn().mockResolvedValue([]);

    render(
      <CodeEditor
        value={"package main\nf\n"}
        onRequestCompletions={requestCompletions}
      />
    );

    const snippetResult = await latestAutocompleteOverrides[0]?.({
      pos: 15,
      explicit: false,
      matchBefore: () => ({ from: 13, to: 14, text: "f" }),
      state: {
        sliceDoc: () => "f",
        doc: {
          lineAt: () => ({ number: 2, from: 13 }),
          toString: () => "package main\nf\n",
        },
      },
    });
    const goplsResult = await latestAutocompleteOverride?.({
      pos: 15,
      explicit: false,
      matchBefore: () => ({ from: 13, to: 14, text: "f" }),
      state: {
        sliceDoc: () => "f",
        doc: {
          lineAt: () => ({ number: 2, from: 13 }),
          toString: () => "package main\nf\n",
        },
      },
    });

    expect(snippetResult?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "func" }),
        expect.objectContaining({ label: "for" }),
      ])
    );
    expect(goplsResult).toBeNull();
    expect(requestCompletions).not.toHaveBeenCalled();
  });

  it("uses function-name snippets after func keyword without duplicating func", async () => {
    render(
      <CodeEditor value={"package main\nfunc mai"} onRequestCompletions={vi.fn()} />
    );

    const snippetResult = await latestAutocompleteOverrides[0]?.({
      pos: 21,
      explicit: false,
      matchBefore: () => ({ from: 18, to: 21, text: "mai" }),
      state: {
        sliceDoc: (from: number, to: number) =>
          "package main\nfunc mai".slice(from, to),
        doc: {
          lineAt: () => ({ number: 2, from: 13 }),
          toString: () => "package main\nfunc mai",
        },
      },
    });

    expect(snippetResult?.from).toBe(18);
    expect(snippetResult?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "main",
          detail: "main function",
          apply: "main() {\n\t${}\n}",
        }),
      ])
    );
    expect(snippetResult?.options).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "main",
          apply: "func main() {\n\t${}\n}",
        }),
      ])
    );
  });

  it("keeps package declarations separate from the func main snippet", async () => {
    const requestCompletions = vi.fn().mockResolvedValue([
      {
        label: "main",
        detail: "func main()",
        kind: "function",
        insertText: "func main() {\n\t\n}",
        range: null,
      },
    ]);

    render(
      <CodeEditor
        value={"package ma"}
        onRequestCompletions={requestCompletions}
      />
    );

    const snippetResult = await latestAutocompleteOverrides[0]?.({
      pos: 10,
      explicit: false,
      matchBefore: () => ({ from: 8, to: 10, text: "ma" }),
      state: {
        sliceDoc: (from: number, to: number) => "package ma".slice(from, to),
        doc: {
          lineAt: () => ({ number: 1, from: 0 }),
          toString: () => "package ma",
        },
      },
    });
    const goplsResult = await latestAutocompleteOverride?.({
      pos: 10,
      explicit: false,
      matchBefore: () => ({ from: 8, to: 10, text: "ma" }),
      state: {
        sliceDoc: (from: number, to: number) => "package ma".slice(from, to),
        doc: {
          lineAt: () => ({ number: 1, from: 0 }),
          toString: () => "package ma",
        },
      },
    });

    expect(snippetResult?.options).toEqual([
      expect.objectContaining({ label: "main", detail: "package name" }),
    ]);
    expect(snippetResult?.options).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "main", detail: "main function" }),
      ])
    );
    expect(goplsResult).toBeNull();
    expect(requestCompletions).not.toHaveBeenCalled();
  });

  it("suppresses gopls completion requests in package keyword whitespace context", async () => {
    const requestCompletions = vi.fn().mockResolvedValue([
      {
        label: "main",
        detail: "func main()",
        kind: "function",
        insertText: "func main() {\n\t\n}",
        range: null,
      },
    ]);

    render(
      <CodeEditor
        value={"package "}
        onRequestCompletions={requestCompletions}
      />
    );

    const goplsResult = await latestAutocompleteOverride?.({
      pos: 8,
      explicit: false,
      matchBefore: () => null,
      state: {
        sliceDoc: (from: number, to: number) => "package ".slice(from, to),
        doc: {
          lineAt: () => ({ number: 1, from: 0 }),
          toString: () => "package ",
        },
      },
    });

    expect(goplsResult).toBeNull();
    expect(requestCompletions).not.toHaveBeenCalled();
  });

  it("keeps package keyword context free from non-package snippets", async () => {
    render(<CodeEditor value={"package "} onRequestCompletions={vi.fn()} />);

    const snippetResult = await latestAutocompleteOverrides[0]?.({
      pos: 8,
      explicit: true,
      matchBefore: () => null,
      state: {
        sliceDoc: (from: number, to: number) => "package ".slice(from, to),
        doc: {
          lineAt: () => ({ number: 1, from: 0 }),
          toString: () => "package ",
        },
      },
    });

    expect(snippetResult?.options).toEqual([
      expect.objectContaining({ label: "main", detail: "package name" }),
    ]);
    expect(snippetResult?.options).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "func", detail: "function declaration" }),
        expect.objectContaining({ label: "main", detail: "main function" }),
      ])
    );
  });

  it("uses imported package aliases to preview member completions before dot is typed", async () => {
    const requestCompletions = vi.fn().mockResolvedValue([
      {
        label: "Println",
        detail: "func(a ...any) (n int, err error)",
        documentation: "Println formats using the default formats and writes to standard output.",
        kind: "function",
        insertText: "Println",
        range: null,
        additionalTextEdits: [],
      },
    ]);

    render(
      <CodeEditor
        value={"package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt\n}\n"}
        onRequestCompletions={requestCompletions}
      />
    );

    const result = await latestAutocompleteOverride?.({
      pos: 46,
      explicit: false,
      matchBefore: () => ({ from: 43, to: 46, text: "fmt" }),
      state: {
        sliceDoc: (from: number, to: number) =>
          "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt\n}\n".slice(from, to),
        doc: {
          lineAt: () => ({ number: 6, from: 42 }),
          toString: () =>
            "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt\n}\n",
        },
      },
    });

    expect(requestCompletions).toHaveBeenCalledWith({
      line: 6,
      column: 6,
      explicit: false,
      triggerCharacter: ".",
      fileContent: "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.\n}\n",
    });
    expect(result?.options[0]).toEqual(
      expect.objectContaining({
        label: "Println",
        info: "Println formats using the default formats and writes to standard output.",
      })
    );

    const dispatchMock = vi.fn();
    result?.options[0].apply(
      ({ dispatch: dispatchMock } as any),
      {},
      46,
      46
    );
    expect(dispatchMock).toHaveBeenCalledWith({
      changes: [
        {
          from: 43,
          to: 46,
          insert: "fmt.Println",
        },
      ],
    });
  });

  it("previews common package members and inserts the missing import", async () => {
    const source = "package main\n\nfunc main() {\n\tfmt\n}\n";
    const virtualSource = "package main\nimport \"fmt\"\n\nfunc main() {\n\tfmt.\n}\n";
    const requestCompletions = vi.fn().mockResolvedValue([
      {
        label: "Println",
        detail: "func(a ...any) (n int, err error)",
        documentation: "Println formats using the default formats and writes to standard output.",
        kind: "function",
        insertText: "Println",
        range: null,
        additionalTextEdits: [],
      },
    ]);

    render(
      <CodeEditor
        value={source}
        onRequestCompletions={requestCompletions}
      />
    );

    const result = await latestAutocompleteOverride?.({
      pos: 32,
      explicit: false,
      matchBefore: () => ({ from: 29, to: 32, text: "fmt" }),
      state: {
        sliceDoc: (from: number, to: number) => source.slice(from, to),
        doc: {
          lineAt: () => ({ number: 4, from: 28 }),
          toString: () => source,
        },
      },
    });

    expect(requestCompletions).toHaveBeenCalledWith({
      line: 5,
      column: 6,
      explicit: false,
      triggerCharacter: ".",
      fileContent: virtualSource,
    });

    const dispatchMock = vi.fn();
    result?.options[0].apply(
      ({
        dispatch: dispatchMock,
        state: {
          doc: {
            toString: () => source,
          },
        },
      } as any),
      {},
      32,
      32
    );

    expect(dispatchMock).toHaveBeenCalledWith({
      changes: [
        {
          from: 12,
          to: 12,
          insert: "\nimport \"fmt\"",
        },
        {
          from: 29,
          to: 32,
          insert: "fmt.Println",
        },
      ],
    });
  });

  it("normalizes empty completion detail and documentation for popup rendering", async () => {
    const requestCompletions = vi.fn().mockResolvedValue([
      {
        label: "Println",
        detail: "   ",
        documentation: "   ",
        kind: "function",
        insertText: "Println",
        range: null,
        additionalTextEdits: [],
      },
    ]);

    render(
      <CodeEditor
        value={"package main\nfmt.\n"}
        onRequestCompletions={requestCompletions}
      />
    );

    const result = await latestAutocompleteOverride?.({
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

    expect(result?.options[0]).toEqual(
      expect.objectContaining({
        label: "Println",
        detail: undefined,
        info: undefined,
      })
    );
  });

  it("applies additional text edits ahead of the main completion edit", async () => {
    const requestCompletions = vi.fn().mockResolvedValue([
      {
        label: "Println",
        detail: "func(a ...any)",
        kind: "function",
        insertText: "Println",
        range: {
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 5,
        },
        additionalTextEdits: [
          {
            range: {
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 1,
            },
            newText: "import \"fmt\"\n",
          },
        ],
      },
    ]);

    const source = "fmt.\nPrin\n";

    render(
      <CodeEditor
        value={source}
        onRequestCompletions={requestCompletions}
      />
    );

    const result = await latestAutocompleteOverride?.({
      pos: 4,
      explicit: true,
      matchBefore: () => ({ from: 0, to: 4, text: "fmt." }),
      state: {
        sliceDoc: () => "",
        doc: {
          lineAt: () => ({ number: 1, from: 0 }),
          toString: () => source,
        },
      },
    });

    const dispatchMock = vi.fn();
    result?.options[0].apply(
      ({
        dispatch: dispatchMock,
        state: {
          doc: {
            lines: 2,
            lineAt: () => ({ from: 0, to: 4 }),
            line: (lineNumber: number) =>
              lineNumber === 1 ? { from: 0, to: 4 } : { from: 5, to: 9 },
          },
          sliceDoc: () => "fmt.",
        },
      } as any),
      {},
      4,
      4
    );

    expect(dispatchMock).toHaveBeenCalledWith({
      changes: [
        { from: 0, to: 0, insert: "import \"fmt\"\n" },
        { from: 0, to: 4, insert: "Println" },
      ],
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
        changes: expect.arrayContaining([
          expect.objectContaining({
            from: 12,
            to: 16,
            insert: "Println",
          }),
        ]),
      })
    );
  });
});
