import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CodeEditor from "./CodeEditor";
import { PREDICTED_HINT_UNDERLINE_CLASS } from "./codemirrorTheme";

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

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ onCreateEditor }: { onCreateEditor?: (view: unknown) => void }) => {
    onCreateEditor?.(mockView);
    return <div data-testid="mock-codemirror" />;
  },
}));

describe("CodeEditor", () => {
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

    expect(mockView.dispatch).toHaveBeenCalledTimes(1);
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
});
