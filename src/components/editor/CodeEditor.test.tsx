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
};

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ onCreateEditor }: { onCreateEditor?: (view: unknown) => void }) => {
    onCreateEditor?.(mockView);
    return <div data-testid="mock-codemirror" />;
  },
}));

describe("CodeEditor", () => {
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
});

