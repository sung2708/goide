import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";

vi.mock("@codemirror/view", () => ({
  EditorView: vi.fn(),
}));

vi.mock("@codemirror/search", () => ({
  findNext: vi.fn(),
  findPrevious: vi.fn(),
  replaceNext: vi.fn(),
  replaceAll: vi.fn(),
  SearchQuery: vi.fn().mockImplementation(() => ({
    valid: true,
    getCursor: vi.fn().mockReturnValue({ next: () => ({ done: true }) }),
  })),
  setSearchQuery: { of: vi.fn().mockReturnValue({ type: "effect" }) },
}));

import type { EditorView } from "@codemirror/view";
import { useFindWidget } from "./useFindWidget";

function makeViewRef(overrides?: object) {
  const view = {
    dispatch: vi.fn(),
    focus: vi.fn(),
    state: {
      selection: { main: { head: 0, from: 0, to: 0, empty: true } },
      doc: { sliceString: vi.fn().mockReturnValue("") },
    },
    ...overrides,
  };
  return { current: view as unknown as EditorView };
}

describe("useFindWidget", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts closed with empty state", () => {
    const { result } = renderHook(() => useFindWidget(makeViewRef()));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.query).toBe("");
    expect(result.current.replaceText).toBe("");
    expect(result.current.matchCase).toBe(false);
    expect(result.current.wholeWord).toBe(false);
    expect(result.current.useRegex).toBe(false);
    expect(result.current.matchInfo).toEqual({ current: 0, total: 0 });
  });

  it("open() sets isOpen to true and close() sets it to false", () => {
    const { result } = renderHook(() => useFindWidget(makeViewRef()));
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it("close() calls view.focus()", () => {
    const viewRef = makeViewRef();
    const { result } = renderHook(() => useFindWidget(viewRef));
    act(() => result.current.open());
    act(() => result.current.close());
    expect(viewRef.current.focus).toHaveBeenCalled();
  });

  it("toggleMatchCase, toggleWholeWord, toggleRegex flip their flags independently", () => {
    const { result } = renderHook(() => useFindWidget(makeViewRef()));
    act(() => result.current.toggleMatchCase());
    expect(result.current.matchCase).toBe(true);
    act(() => result.current.toggleWholeWord());
    expect(result.current.wholeWord).toBe(true);
    act(() => result.current.toggleRegex());
    expect(result.current.useRegex).toBe(true);
    act(() => result.current.toggleMatchCase());
    expect(result.current.matchCase).toBe(false);
  });

  it("open() pre-fills query from a single-line selection", () => {
    const viewRef = makeViewRef({
      state: {
        selection: { main: { empty: false, from: 0, to: 5 } },
        doc: { sliceString: vi.fn().mockReturnValue("hello") },
      },
    });
    const { result } = renderHook(() => useFindWidget(viewRef));
    act(() => result.current.open());
    expect(result.current.query).toBe("hello");
  });

  it("open() does not pre-fill query from a multi-line selection", () => {
    const viewRef = makeViewRef({
      state: {
        selection: { main: { empty: false, from: 0, to: 10 } },
        doc: { sliceString: vi.fn().mockReturnValue("hello\nworld") },
      },
    });
    const { result } = renderHook(() => useFindWidget(viewRef));
    act(() => result.current.open());
    expect(result.current.query).toBe("");
  });

  it("open() focuses queryInputRef on the next tick", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFindWidget(makeViewRef()));
    const focusMock = vi.fn();
    // Assign a mock focus to the queryInputRef
    act(() => {
      (result.current.queryInputRef as MutableRefObject<HTMLInputElement | null>).current = {
        focus: focusMock,
      } as unknown as HTMLInputElement;
      result.current.open();
    });
    expect(focusMock).not.toHaveBeenCalled();
    act(() => {
      vi.runAllTimers();
    });
    expect(focusMock).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("handleFindNext calls findNext with the editor view", async () => {
    const viewRef = makeViewRef();
    const { result } = renderHook(() => useFindWidget(viewRef));
    act(() => result.current.open());
    const { findNext } = vi.mocked(await import("@codemirror/search"));
    act(() => result.current.handleFindNext());
    expect(findNext).toHaveBeenCalledWith(viewRef.current);
  });

  it("handleFindPrev calls findPrevious with the editor view", async () => {
    const viewRef = makeViewRef();
    const { result } = renderHook(() => useFindWidget(viewRef));
    act(() => result.current.open());
    const { findPrevious } = vi.mocked(await import("@codemirror/search"));
    act(() => result.current.handleFindPrev());
    expect(findPrevious).toHaveBeenCalledWith(viewRef.current);
  });

  it("handleReplace calls replaceNext with the editor view", async () => {
    const viewRef = makeViewRef();
    const { result } = renderHook(() => useFindWidget(viewRef));
    act(() => result.current.open());
    const { replaceNext } = vi.mocked(await import("@codemirror/search"));
    act(() => result.current.handleReplace());
    expect(replaceNext).toHaveBeenCalledWith(viewRef.current);
  });

  it("handleReplaceAll calls replaceAll with the editor view", async () => {
    const viewRef = makeViewRef();
    const { result } = renderHook(() => useFindWidget(viewRef));
    act(() => result.current.open());
    const { replaceAll } = vi.mocked(await import("@codemirror/search"));
    act(() => result.current.handleReplaceAll());
    expect(replaceAll).toHaveBeenCalledWith(viewRef.current);
  });

  it("dispatches setSearchQuery with correct payload when query changes", async () => {
    const viewRef = makeViewRef();
    const { result } = renderHook(() => useFindWidget(viewRef));
    const { setSearchQuery } = vi.mocked(await import("@codemirror/search"));
    act(() => result.current.open());
    act(() => result.current.setQuery("hello"));
    expect(setSearchQuery.of).toHaveBeenCalled();
    expect(viewRef.current.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ effects: expect.anything() })
    );
  });

  it("setReplaceText updates replaceText state", () => {
    const { result } = renderHook(() => useFindWidget(makeViewRef()));
    act(() => result.current.setReplaceText("bar"));
    expect(result.current.replaceText).toBe("bar");
  });

  it("handleReplace triggers a re-scan rather than speculative counter update", async () => {
    const viewRef = makeViewRef();
    const { result } = renderHook(() => useFindWidget(viewRef));
    act(() => result.current.open());
    const { replaceNext } = vi.mocked(await import("@codemirror/search"));
    act(() => result.current.handleReplace());
    expect(replaceNext).toHaveBeenCalledWith(viewRef.current);
    // After replace, the scan re-runs — the effect dispatches setSearchQuery
    expect(viewRef.current.dispatch).toHaveBeenCalled();
  });
});
