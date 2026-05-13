import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";

vi.mock("@codemirror/view", () => ({
  EditorView: {
    scrollIntoView: vi.fn().mockReturnValue({ type: "scroll-effect" }),
  },
}));

vi.mock("@codemirror/search", () => ({
  closeSearchPanel: vi.fn(),
  searchPanelOpen: vi.fn(() => false),
  SearchQuery: vi.fn().mockImplementation(() => ({
    valid: true,
    getCursor: vi.fn().mockImplementation(() => {
      let step = 0;
      return {
        next: () => {
          if (step === 0) {
            step += 1;
            return { done: false, value: { from: 2, to: 7 } };
          }
          return { done: true };
        },
      };
    }),
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
      doc: { sliceString: vi.fn().mockReturnValue("hello") },
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

  it("handleFindNext selects the next match without opening CodeMirror search panel", async () => {
    const viewRef = makeViewRef();
    const { result } = renderHook(() => useFindWidget(viewRef));
    const { searchPanelOpen, closeSearchPanel } = vi.mocked(await import("@codemirror/search"));
    searchPanelOpen.mockReturnValue(true);
    act(() => result.current.open());
    act(() => result.current.setQuery("hello"));
    act(() => result.current.handleFindNext());
    expect(closeSearchPanel).toHaveBeenCalledWith(viewRef.current);
    expect(viewRef.current.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { anchor: 2, head: 7 },
        effects: expect.anything(),
      })
    );
  });

  it("handleFindPrev selects the previous match without opening CodeMirror search panel", async () => {
    const viewRef = makeViewRef();
    const { result } = renderHook(() => useFindWidget(viewRef));
    const { closeSearchPanel, searchPanelOpen } = vi.mocked(await import("@codemirror/search"));
    searchPanelOpen.mockReturnValue(false);
    act(() => result.current.open());
    act(() => result.current.setQuery("hello"));
    act(() => result.current.handleFindPrev());
    expect(closeSearchPanel).not.toHaveBeenCalled();
    expect(viewRef.current.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: { anchor: 2, head: 7 },
        effects: expect.anything(),
      })
    );
  });

  it("handleReplace dispatches direct document changes", async () => {
    const viewRef = makeViewRef();
    const { result } = renderHook(() => useFindWidget(viewRef));
    act(() => result.current.open());
    act(() => result.current.setQuery("hello"));
    act(() => result.current.setReplaceText("world"));
    act(() => result.current.handleReplace());
    expect(viewRef.current.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { from: 2, to: 7, insert: "world" },
      })
    );
  });

  it("handleReplaceAll dispatches direct document changes", async () => {
    const viewRef = makeViewRef();
    const { result } = renderHook(() => useFindWidget(viewRef));
    act(() => result.current.open());
    act(() => result.current.setQuery("hello"));
    act(() => result.current.setReplaceText("world"));
    act(() => result.current.handleReplaceAll());
    expect(viewRef.current.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [{ from: 2, to: 7, insert: "world" }],
      })
    );
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
    act(() => result.current.setQuery("hello"));
    act(() => result.current.handleReplace());
    // After replace, the scan re-runs - the effect dispatches setSearchQuery
    expect(viewRef.current.dispatch).toHaveBeenCalled();
  });
});
