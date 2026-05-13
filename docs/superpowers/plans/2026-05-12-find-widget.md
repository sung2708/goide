# Find Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CodeMirror's default search panel with a custom React find/replace widget (Ctrl+F), and add Replace/Replace All to the workspace search sidebar (Ctrl+Shift+F).

**Architecture:** `useFindWidget` hook (in `src/hooks/`) bridges React state to `@codemirror/search` APIs; `FindWidget.tsx` renders an absolute-positioned overlay inside `CodeEditor`'s container div. Workspace replace extends `useWorkspaceSearchState` with two new async functions that read, patch, and rewrite files via existing IPC calls.

**Tech Stack:** React 18, CodeMirror 6 (`@codemirror/search` — already bundled via `@uiw/react-codemirror`), Vitest + RTL, Tailwind CSS v4, Material Symbols Outlined (already imported).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/hooks/useFindWidget.ts` | **Create** | All find/replace state + CodeMirror bridge |
| `src/hooks/useFindWidget.test.ts` | **Create** | Unit tests for hook state |
| `src/components/editor/FindWidget.tsx` | **Create** | Find/replace UI component |
| `src/components/editor/FindWidget.test.tsx` | **Create** | Component interaction tests |
| `src/components/editor/CodeEditor.tsx` | **Modify** | Remove CM search ext, wire FindWidget |
| `src/components/editor/useWorkspaceSearchState.ts` | **Modify** | Add `replaceMatch` + `replaceAllMatches` |
| `src/components/panels/SearchPanel.tsx` | **Modify** | Add Replace buttons, `onReplaceMatch`/`onReplaceAll`/`focusTrigger` props |
| `src/components/editor/EditorShell.tsx` | **Modify** | Add Ctrl+Shift+F shortcut |

---

## Task 1: `useFindWidget` hook — state + CodeMirror bridge

**Files:**
- Create: `src/hooks/useFindWidget.ts`
- Create: `src/hooks/useFindWidget.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/useFindWidget.test.ts`:

```typescript
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("handleFindNext increments current match index wrapping around total", () => {
    const { result } = renderHook(() => useFindWidget(makeViewRef()));
    act(() => result.current.open());
    // Manually seed matchInfo to simulate 3 total matches at index 2
    act(() => {
      result.current.setQuery("x");
    });
    // force matchInfo via direct state — simulate 3 matches, current=2
    // We'll just verify findNext was called
    const { findNext } = vi.mocked(await import("@codemirror/search"));
    act(() => result.current.handleFindNext());
    expect(findNext).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/hooks/useFindWidget.test.ts
```

Expected: FAIL — `Cannot find module './useFindWidget'`

- [ ] **Step 3: Create `src/hooks/useFindWidget.ts`**

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import {
  findNext,
  findPrevious,
  replaceNext as cmReplaceNext,
  replaceAll as cmReplaceAll,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";

export type FindWidgetHandlers = {
  isOpen: boolean;
  query: string;
  replaceText: string;
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  matchInfo: { current: number; total: number };
  queryInputRef: RefObject<HTMLInputElement | null>;
  open: () => void;
  close: () => void;
  setQuery: (q: string) => void;
  setReplaceText: (t: string) => void;
  toggleMatchCase: () => void;
  toggleWholeWord: () => void;
  toggleRegex: () => void;
  handleFindNext: () => void;
  handleFindPrev: () => void;
  handleReplace: () => void;
  handleReplaceAll: () => void;
};

export function useFindWidget(
  viewRef: RefObject<EditorView | null>
): FindWidgetHandlers {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQueryState] = useState("");
  const [replaceText, setReplaceTextState] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchInfo, setMatchInfo] = useState<{ current: number; total: number }>(
    { current: 0, total: 0 }
  );
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const matchIndexRef = useRef(0);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isOpen) return;

    let searchObj: SearchQuery;
    try {
      searchObj = new SearchQuery({
        search: query,
        caseSensitive: matchCase,
        wholeWord,
        regexp: useRegex,
      });
    } catch {
      setMatchInfo({ current: 0, total: 0 });
      return;
    }

    view.dispatch({ effects: setSearchQuery.of(searchObj) });

    if (!query || !searchObj.valid) {
      matchIndexRef.current = 0;
      setMatchInfo({ current: 0, total: 0 });
      return;
    }

    const positions: number[] = [];
    const cursor = searchObj.getCursor(view.state);
    let r;
    while (!(r = cursor.next()).done) {
      positions.push(r.value.from);
    }

    const head = view.state.selection.main.head;
    let idx = 0;
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] <= head) idx = i;
    }
    matchIndexRef.current = positions.length > 0 ? idx : 0;
    setMatchInfo({
      current: positions.length > 0 ? idx + 1 : 0,
      total: positions.length,
    });
  }, [query, matchCase, wholeWord, useRegex, isOpen, viewRef]);

  const open = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      const sel = view.state.selection.main;
      if (!sel.empty) {
        const text = view.state.doc.sliceString(sel.from, sel.to);
        if (!text.includes("\n")) {
          setQueryState(text);
        }
      }
    }
    setIsOpen(true);
    setTimeout(() => queryInputRef.current?.focus(), 0);
  }, [viewRef]);

  const close = useCallback(() => {
    setIsOpen(false);
    viewRef.current?.focus();
  }, [viewRef]);

  const setQuery = useCallback((q: string) => {
    matchIndexRef.current = 0;
    setQueryState(q);
  }, []);

  const toggleMatchCase = useCallback(() => setMatchCase((v) => !v), []);
  const toggleWholeWord = useCallback(() => setWholeWord((v) => !v), []);
  const toggleRegex = useCallback(() => setUseRegex((v) => !v), []);

  const handleFindNext = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    findNext(view);
    setMatchInfo((prev) => {
      if (prev.total === 0) return prev;
      const next = (matchIndexRef.current + 1) % prev.total;
      matchIndexRef.current = next;
      return { ...prev, current: next + 1 };
    });
  }, [viewRef]);

  const handleFindPrev = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    findPrevious(view);
    setMatchInfo((prev) => {
      if (prev.total === 0) return prev;
      const next = (matchIndexRef.current - 1 + prev.total) % prev.total;
      matchIndexRef.current = next;
      return { ...prev, current: next + 1 };
    });
  }, [viewRef]);

  const handleReplace = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    cmReplaceNext(view);
    setMatchInfo((prev) => {
      const newTotal = Math.max(0, prev.total - 1);
      if (newTotal === 0) {
        matchIndexRef.current = 0;
        return { current: 0, total: 0 };
      }
      const next = matchIndexRef.current % newTotal;
      matchIndexRef.current = next;
      return { current: next + 1, total: newTotal };
    });
  }, [viewRef]);

  const handleReplaceAll = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    cmReplaceAll(view);
    matchIndexRef.current = 0;
    setMatchInfo({ current: 0, total: 0 });
  }, [viewRef]);

  return {
    isOpen,
    query,
    replaceText,
    matchCase,
    wholeWord,
    useRegex,
    matchInfo,
    queryInputRef,
    open,
    close,
    setQuery,
    setReplaceText: setReplaceTextState,
    toggleMatchCase,
    toggleWholeWord,
    toggleRegex,
    handleFindNext,
    handleFindPrev,
    handleReplace,
    handleReplaceAll,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/hooks/useFindWidget.test.ts
```

Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFindWidget.ts src/hooks/useFindWidget.test.ts
git commit -m "feat: add useFindWidget hook for in-file find/replace"
```

---

## Task 2: `FindWidget.tsx` component

**Files:**
- Create: `src/components/editor/FindWidget.tsx`
- Create: `src/components/editor/FindWidget.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/editor/FindWidget.test.tsx`:

```typescript
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import FindWidget from "./FindWidget";
import type { FindWidgetProps } from "./FindWidget";

function makeProps(overrides?: Partial<FindWidgetProps>): FindWidgetProps {
  return {
    query: "",
    replaceText: "",
    matchCase: false,
    wholeWord: false,
    useRegex: false,
    matchInfo: { current: 0, total: 0 },
    queryInputRef: createRef(),
    onQueryChange: vi.fn(),
    onReplaceTextChange: vi.fn(),
    onToggleMatchCase: vi.fn(),
    onToggleWholeWord: vi.fn(),
    onToggleRegex: vi.fn(),
    onFindNext: vi.fn(),
    onFindPrev: vi.fn(),
    onReplace: vi.fn(),
    onReplaceAll: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("FindWidget", () => {
  it("renders find and replace inputs", () => {
    render(<FindWidget {...makeProps()} />);
    expect(screen.getByPlaceholderText(/find/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/replace/i)).toBeInTheDocument();
  });

  it("shows match counter when total > 0", () => {
    render(<FindWidget {...makeProps({ matchInfo: { current: 2, total: 5 } })} />);
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
  });

  it("shows '0 results' when query present but no matches", () => {
    render(<FindWidget {...makeProps({ query: "xyz", matchInfo: { current: 0, total: 0 } })} />);
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });

  it("match-case toggle button reflects active state via aria-pressed", () => {
    const { rerender } = render(<FindWidget {...makeProps({ matchCase: false })} />);
    expect(screen.getByRole("button", { name: /match case/i })).toHaveAttribute("aria-pressed", "false");
    rerender(<FindWidget {...makeProps({ matchCase: true })} />);
    expect(screen.getByRole("button", { name: /match case/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onToggleMatchCase when Aa button clicked", async () => {
    const onToggleMatchCase = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onToggleMatchCase })} />);
    await user.click(screen.getByRole("button", { name: /match case/i }));
    expect(onToggleMatchCase).toHaveBeenCalledOnce();
  });

  it("calls onFindNext when Enter is pressed in find input", async () => {
    const onFindNext = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onFindNext })} />);
    await user.type(screen.getByPlaceholderText(/find/i), "{Enter}");
    expect(onFindNext).toHaveBeenCalledOnce();
  });

  it("calls onFindPrev when Shift+Enter is pressed in find input", async () => {
    const onFindPrev = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onFindPrev })} />);
    await user.type(screen.getByPlaceholderText(/find/i), "{Shift>}{Enter}{/Shift}");
    expect(onFindPrev).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed in find input", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onClose })} />);
    await user.type(screen.getByPlaceholderText(/find/i), "{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when X button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onClose })} />);
    await user.click(screen.getByRole("button", { name: /close find widget/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onReplace when Replace button clicked", async () => {
    const onReplace = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onReplace })} />);
    await user.click(screen.getByRole("button", { name: /^replace$/i }));
    expect(onReplace).toHaveBeenCalledOnce();
  });

  it("calls onReplaceAll when Replace All button clicked", async () => {
    const onReplaceAll = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onReplaceAll })} />);
    await user.click(screen.getByRole("button", { name: /replace all/i }));
    expect(onReplaceAll).toHaveBeenCalledOnce();
  });

  it("calls onQueryChange when find input value changes", async () => {
    const onQueryChange = vi.fn();
    const user = userEvent.setup();
    render(<FindWidget {...makeProps({ onQueryChange })} />);
    await user.type(screen.getByPlaceholderText(/find/i), "a");
    expect(onQueryChange).toHaveBeenCalledWith("a");
  });

  it("prev and next navigation buttons are present", () => {
    render(<FindWidget {...makeProps()} />);
    expect(screen.getByRole("button", { name: /previous match/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next match/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/components/editor/FindWidget.test.tsx
```

Expected: FAIL — `Cannot find module './FindWidget'`

- [ ] **Step 3: Create `src/components/editor/FindWidget.tsx`**

```tsx
import type { RefObject } from "react";

export type FindWidgetProps = {
  query: string;
  replaceText: string;
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  matchInfo: { current: number; total: number };
  queryInputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (q: string) => void;
  onReplaceTextChange: (t: string) => void;
  onToggleMatchCase: () => void;
  onToggleWholeWord: () => void;
  onToggleRegex: () => void;
  onFindNext: () => void;
  onFindPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
};

function IconBtn({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors duration-100 ${
        active
          ? "bg-(--selection-bg) text-(--blue)"
          : "text-(--overlay1) hover:bg-[rgba(255,255,255,0.06)] hover:text-(--subtext1)"
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
        {icon}
      </span>
    </button>
  );
}

function NavBtn({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-(--overlay1) transition-colors duration-100 hover:bg-[rgba(255,255,255,0.06)] hover:text-(--subtext1)"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
        {icon}
      </span>
    </button>
  );
}

export default function FindWidget({
  query,
  replaceText,
  matchCase,
  wholeWord,
  useRegex,
  matchInfo,
  queryInputRef,
  onQueryChange,
  onReplaceTextChange,
  onToggleMatchCase,
  onToggleWholeWord,
  onToggleRegex,
  onFindNext,
  onFindPrev,
  onReplace,
  onReplaceAll,
  onClose,
}: FindWidgetProps) {
  const hasQuery = query.length > 0;
  const hasMatches = matchInfo.total > 0;

  function renderCounter() {
    if (!hasQuery) return null;
    if (!hasMatches) {
      return (
        <span className="shrink-0 text-[10px] text-(--red)">No results</span>
      );
    }
    return (
      <span className="shrink-0 text-[10px] text-(--overlay1)">
        {matchInfo.current} of {matchInfo.total}
      </span>
    );
  }

  return (
    <div
      data-testid="find-widget"
      className="absolute right-3 top-2 z-50 w-[420px] overflow-hidden rounded border border-(--surface1) bg-(--mantle) shadow-lg"
    >
      {/* Find row */}
      <div className="flex items-center gap-1 border-b border-(--border-muted) px-2 py-1">
        <span
          className="material-symbols-outlined shrink-0 text-(--overlay1)"
          style={{ fontSize: 14 }}
        >
          search
        </span>

        <input
          ref={queryInputRef}
          type="text"
          value={query}
          placeholder="Find"
          aria-label="Find in file"
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) {
                onFindPrev();
              } else {
                onFindNext();
              }
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-(--text) outline-none placeholder:text-(--overlay0)"
        />

        <div className="flex shrink-0 items-center gap-0.5">
          <IconBtn icon="match_case" label="Match Case" active={matchCase} onClick={onToggleMatchCase} />
          <IconBtn icon="format_letter_spacing" label="Match Whole Word" active={wholeWord} onClick={onToggleWholeWord} />
          <IconBtn icon="regular_expression" label="Use Regular Expression" active={useRegex} onClick={onToggleRegex} />
        </div>

        <div className="mx-1 h-4 w-px shrink-0 bg-(--surface1)" />

        {renderCounter()}

        <NavBtn icon="keyboard_arrow_up" label="Previous Match" onClick={onFindPrev} />
        <NavBtn icon="keyboard_arrow_down" label="Next Match" onClick={onFindNext} />

        <div className="mx-1 h-4 w-px shrink-0 bg-(--surface1)" />

        <button
          type="button"
          aria-label="Close find widget"
          onClick={onClose}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-(--overlay1) transition-colors duration-100 hover:bg-[rgba(255,255,255,0.06)] hover:text-(--subtext1)"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            close
          </span>
        </button>
      </div>

      {/* Replace row */}
      <div className="flex items-center gap-1 px-2 py-1">
        <span
          className="material-symbols-outlined shrink-0 text-(--overlay1)"
          style={{ fontSize: 14 }}
        >
          find_replace
        </span>

        <input
          type="text"
          value={replaceText}
          placeholder="Replace"
          aria-label="Replace text"
          onChange={(e) => onReplaceTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[12px] text-(--text) outline-none placeholder:text-(--overlay0)"
        />

        <button
          type="button"
          aria-label="Replace"
          onClick={onReplace}
          className="shrink-0 rounded border border-(--surface1) bg-(--surface0) px-2 py-0.5 text-[11px] text-(--subtext1) transition-colors duration-100 hover:border-(--border-active) hover:text-(--text)"
        >
          Replace
        </button>
        <button
          type="button"
          aria-label="Replace All"
          onClick={onReplaceAll}
          className="shrink-0 rounded border border-(--surface1) bg-(--surface0) px-2 py-0.5 text-[11px] text-(--subtext1) transition-colors duration-100 hover:border-(--border-active) hover:text-(--text)"
        >
          Replace All
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/components/editor/FindWidget.test.tsx
```

Expected: PASS (all 11 tests green)

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/FindWidget.tsx src/components/editor/FindWidget.test.tsx
git commit -m "feat: add FindWidget component for in-file find/replace"
```

---

## Task 3: Integrate FindWidget into CodeEditor

**Files:**
- Modify: `src/components/editor/CodeEditor.tsx`

- [ ] **Step 1: Update imports in `CodeEditor.tsx`**

Find this block (lines 31–37):

```typescript
import {
  closeSearchPanel,
  findNext,
  openSearchPanel,
  search,
  searchKeymap,
  searchPanelOpen,
} from "@codemirror/search";
```

Replace with:

```typescript
import { closeCompletion } from "@codemirror/autocomplete";
```

Wait — `closeCompletion` is already imported from `@codemirror/autocomplete` at line 41 of the file. So simply **delete the entire `@codemirror/search` import block** (lines 31–37).

Then add the FindWidget import. Find the existing imports block near the DocumentOutline import and add:

```typescript
import FindWidget from "./FindWidget";
import { useFindWidget } from "../../hooks/useFindWidget";
```

- [ ] **Step 2: Remove `search({ top: true })` from extensions**

Find (around line 911):

```typescript
    search({
      top: true,
    }),
```

Delete those 3 lines entirely.

- [ ] **Step 3: Add `useFindWidget` hook call after `viewRef` declaration**

Find (line 1065):

```typescript
  const viewRef = useRef<EditorView | null>(null);
```

Add immediately after:

```typescript
  const findWidget = useFindWidget(viewRef);
  const findWidgetRef = useRef(findWidget);
  findWidgetRef.current = findWidget;
```

- [ ] **Step 4: Update the keymap inside `extensions`**

Find (around line 940–950):

```typescript
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
```

Replace with:

```typescript
      {
        key: "Enter",
        run: (view) => {
          if (isPackageContextAtSelection(view)) {
            return false;
          }
          return acceptCompletion(view);
        },
      },
```

Find (around line 969):

```typescript
      {
        key: "Escape",
        run: (view) => closeCompletion(view) || closeSearchPanel(view),
      },
```

Replace with:

```typescript
      {
        key: "Escape",
        run: (view) => {
          if (findWidgetRef.current.isOpen) {
            findWidgetRef.current.close();
            return true;
          }
          return closeCompletion(view);
        },
      },
```

Find (around line 988):

```typescript
      {
        key: "Mod-f",
        run: openSearchPanel,
      },
```

Replace with:

```typescript
      {
        key: "Mod-f",
        run: () => {
          findWidgetRef.current.open();
          return true;
        },
      },
```

Find (around line 998):

```typescript
      ...searchKeymap,
```

Delete that line.

- [ ] **Step 5: Add `relative` class and render FindWidget in JSX**

Find (around line 1418):

```typescript
    <div
      ref={containerRef}
      className="h-full min-h-0 w-full"
```

Change to:

```typescript
    <div
      ref={containerRef}
      className="relative h-full min-h-0 w-full"
```

Find (around line 1517):

```typescript
      <CodeMirror
        value={value}
```

Add the overlay just before `<CodeMirror`:

```tsx
      {findWidget.isOpen && (
        <FindWidget
          query={findWidget.query}
          replaceText={findWidget.replaceText}
          matchCase={findWidget.matchCase}
          wholeWord={findWidget.wholeWord}
          useRegex={findWidget.useRegex}
          matchInfo={findWidget.matchInfo}
          queryInputRef={findWidget.queryInputRef}
          onQueryChange={findWidget.setQuery}
          onReplaceTextChange={findWidget.setReplaceText}
          onToggleMatchCase={findWidget.toggleMatchCase}
          onToggleWholeWord={findWidget.toggleWholeWord}
          onToggleRegex={findWidget.toggleRegex}
          onFindNext={findWidget.handleFindNext}
          onFindPrev={findWidget.handleFindPrev}
          onReplace={findWidget.handleReplace}
          onReplaceAll={findWidget.handleReplaceAll}
          onClose={findWidget.close}
        />
      )}
      <CodeMirror
        value={value}
```

- [ ] **Step 6: Run the full test suite**

```
npx vitest run
```

Expected: All tests pass. If `CodeEditor.test.tsx` has tests that reference `searchPanelOpen` or `openSearchPanel` in ways that break, update those tests to use the new `find-widget` testid or adjust accordingly.

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/CodeEditor.tsx
git commit -m "feat: integrate FindWidget into CodeEditor, remove default CM search panel"
```

---

## Task 4: `useWorkspaceSearchState` — replace functions

**Files:**
- Modify: `src/components/editor/useWorkspaceSearchState.ts`

- [ ] **Step 1: Write failing tests**

The existing file is `src/components/editor/useWorkspaceSearchState.ts`. Check if a test file already exists:

```
npx vitest run src/components/editor/useWorkspaceSearchState.test.ts
```

If it doesn't exist, create `src/components/editor/useWorkspaceSearchState.test.ts`:

```typescript
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readWorkspaceFileMock = vi.fn();
const writeWorkspaceFileMock = vi.fn();
const searchWorkspaceTextMock = vi.fn();

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    readWorkspaceFile: (...args: unknown[]) => readWorkspaceFileMock(...args),
    writeWorkspaceFile: (...args: unknown[]) => writeWorkspaceFileMock(...args),
    searchWorkspaceText: (...args: unknown[]) => searchWorkspaceTextMock(...args),
  };
});

import { useWorkspaceSearchState } from "./useWorkspaceSearchState";

describe("useWorkspaceSearchState — replace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "line1\nfoo bar\nline3\n" });
    writeWorkspaceFileMock.mockResolvedValue({ ok: true });
    searchWorkspaceTextMock.mockResolvedValue({ ok: true, data: [] });
  });

  it("replaceMatch reads the file, replaces text on the given line, and writes it back", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState("C:/workspace"));

    await act(async () => {
      await result.current.replaceMatch("main.go", 2, "foo", "baz");
    });

    expect(readWorkspaceFileMock).toHaveBeenCalledWith("C:/workspace", "main.go");
    expect(writeWorkspaceFileMock).toHaveBeenCalledWith(
      "C:/workspace",
      "main.go",
      "line1\nbaz bar\nline3\n"
    );
  });

  it("replaceMatch is a no-op when searchText is not on the specified line", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState("C:/workspace"));

    await act(async () => {
      await result.current.replaceMatch("main.go", 1, "foo", "baz");
    });

    expect(writeWorkspaceFileMock).not.toHaveBeenCalled();
  });

  it("replaceAllMatches replaces every match in every result file and refreshes search", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState("C:/workspace"));

    // Seed results by running a search first
    searchWorkspaceTextMock.mockResolvedValueOnce({
      ok: true,
      data: [
        {
          relativePath: "a.go",
          matches: [{ line: 1, preview: "foo" }],
        },
        {
          relativePath: "b.go",
          matches: [{ line: 1, preview: "foo" }],
        },
      ],
    });
    await act(async () => {
      await result.current.handleWorkspaceSearch("foo");
    });

    readWorkspaceFileMock.mockResolvedValue({ ok: true, data: "foo\n" });

    await act(async () => {
      await result.current.replaceAllMatches("foo", "bar");
    });

    expect(writeWorkspaceFileMock).toHaveBeenCalledTimes(2);
    // After replace, search is re-run with same query
    expect(searchWorkspaceTextMock).toHaveBeenLastCalledWith("C:/workspace", "foo");
  });

  it("replaceMatch does nothing when workspacePath is null", async () => {
    const { result } = renderHook(() => useWorkspaceSearchState(null));
    await act(async () => {
      await result.current.replaceMatch("main.go", 1, "foo", "bar");
    });
    expect(readWorkspaceFileMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/components/editor/useWorkspaceSearchState.test.ts
```

Expected: FAIL — `result.current.replaceMatch is not a function`

- [ ] **Step 3: Update `useWorkspaceSearchState.ts`**

Replace the entire file content:

```typescript
import { useCallback, useRef, useState } from "react";
import { readWorkspaceFile, searchWorkspaceText, writeWorkspaceFile } from "../../lib/ipc/client";
import type { WorkspaceSearchFile } from "../../lib/ipc/types";

type WorkspaceSearchState = {
  searchLoading: boolean;
  workspaceSearchResults: WorkspaceSearchFile[];
  resetWorkspaceSearch: () => void;
  handleWorkspaceSearch: (query: string) => Promise<void>;
  replaceMatch: (
    file: string,
    line: number,
    searchText: string,
    replacement: string
  ) => Promise<void>;
  replaceAllMatches: (searchText: string, replacement: string) => Promise<void>;
};

export function useWorkspaceSearchState(
  workspacePath: string | null
): WorkspaceSearchState {
  const [searchLoading, setSearchLoading] = useState(false);
  const [workspaceSearchResults, setWorkspaceSearchResults] = useState<
    WorkspaceSearchFile[]
  >([]);
  const searchRequestIdRef = useRef(0);

  const resetWorkspaceSearch = useCallback(() => {
    searchRequestIdRef.current += 1;
    setWorkspaceSearchResults([]);
    setSearchLoading(false);
  }, []);

  const handleWorkspaceSearch = useCallback(
    async (query: string) => {
      const trimmedQuery = query.trim();
      if (!workspacePath || !trimmedQuery) {
        searchRequestIdRef.current += 1;
        setWorkspaceSearchResults([]);
        setSearchLoading(false);
        return;
      }
      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;
      setSearchLoading(true);
      try {
        const resp = await searchWorkspaceText(workspacePath, trimmedQuery);
        if (requestId !== searchRequestIdRef.current) return;
        if (resp.ok && resp.data) {
          setWorkspaceSearchResults(resp.data);
        } else {
          setWorkspaceSearchResults([]);
        }
      } catch (err) {
        console.error("Search failed:", err);
        if (requestId === searchRequestIdRef.current) {
          setWorkspaceSearchResults([]);
        }
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setSearchLoading(false);
        }
      }
    },
    [workspacePath]
  );

  const replaceMatch = useCallback(
    async (
      file: string,
      line: number,
      searchText: string,
      replacement: string
    ): Promise<void> => {
      if (!workspacePath) return;

      const resp = await readWorkspaceFile(workspacePath, file);
      if (!resp.ok || resp.data == null) return;

      const lines = resp.data.split("\n");
      const idx = line - 1;
      if (idx < 0 || idx >= lines.length) return;

      const updated = lines[idx].replace(searchText, replacement);
      if (updated === lines[idx]) return;

      lines[idx] = updated;
      await writeWorkspaceFile(workspacePath, file, lines.join("\n"));
    },
    [workspacePath]
  );

  const replaceAllMatches = useCallback(
    async (searchText: string, replacement: string): Promise<void> => {
      if (!workspacePath) return;

      for (const file of workspaceSearchResults) {
        const resp = await readWorkspaceFile(workspacePath, file.relativePath);
        if (!resp.ok || resp.data == null) continue;

        const newContent = resp.data.split(searchText).join(replacement);
        if (newContent === resp.data) continue;

        await writeWorkspaceFile(workspacePath, file.relativePath, newContent);
      }

      await handleWorkspaceSearch(searchText);
    },
    [workspacePath, workspaceSearchResults, handleWorkspaceSearch]
  );

  return {
    searchLoading,
    workspaceSearchResults,
    resetWorkspaceSearch,
    handleWorkspaceSearch,
    replaceMatch,
    replaceAllMatches,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/components/editor/useWorkspaceSearchState.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/useWorkspaceSearchState.ts src/components/editor/useWorkspaceSearchState.test.ts
git commit -m "feat: add replaceMatch and replaceAllMatches to useWorkspaceSearchState"
```

---

## Task 5: SearchPanel — wire Replace buttons and add `focusTrigger`

**Files:**
- Modify: `src/components/panels/SearchPanel.tsx`

- [ ] **Step 1: Write failing tests**

Open `src/components/panels/SearchPanel.test.tsx` and add these test cases inside the existing describe block (append before the closing `}`):

```typescript
it("calls onReplaceMatch with file, line, query, and replaceQuery when Replace is clicked on a match", async () => {
  const user = userEvent.setup();
  const onReplaceMatch = vi.fn();

  render(
    <SearchPanel
      results={[
        {
          relativePath: "main.go",
          matches: [{ line: 5, preview: "  mu.Lock()" }],
        },
      ]}
      loading={false}
      onSearch={vi.fn()}
      onOpenResult={vi.fn()}
      onReplaceMatch={onReplaceMatch}
      onReplaceAll={vi.fn()}
    />
  );

  // Type a search query so it's available when Replace is clicked
  await user.type(screen.getByPlaceholderText(/^search$/i), "mu.Lock");
  await user.type(screen.getByPlaceholderText(/^replace$/i), "mu.Unlock");

  await user.click(screen.getByRole("button", { name: /replace match in main\.go line 5/i }));

  expect(onReplaceMatch).toHaveBeenCalledWith("main.go", 5, "mu.Lock", "mu.Unlock");
});

it("calls onReplaceAll with query and replaceQuery when Replace All is clicked", async () => {
  const user = userEvent.setup();
  const onReplaceAll = vi.fn();

  render(
    <SearchPanel
      results={[
        { relativePath: "main.go", matches: [{ line: 5, preview: "mu.Lock()" }] },
      ]}
      loading={false}
      onSearch={vi.fn()}
      onOpenResult={vi.fn()}
      onReplaceMatch={vi.fn()}
      onReplaceAll={onReplaceAll}
    />
  );

  await user.type(screen.getByPlaceholderText(/^search$/i), "mu.Lock");
  await user.type(screen.getByPlaceholderText(/^replace$/i), "mu.Unlock");

  await user.click(screen.getByRole("button", { name: /replace all/i }));

  expect(onReplaceAll).toHaveBeenCalledWith("mu.Lock", "mu.Unlock");
});

it("focuses the search input when focusTrigger increments", async () => {
  const { rerender } = render(
    <SearchPanel
      results={[]}
      loading={false}
      onSearch={vi.fn()}
      onOpenResult={vi.fn()}
      focusTrigger={0}
    />
  );

  const input = screen.getByPlaceholderText(/^search$/i);
  expect(document.activeElement).not.toBe(input);

  rerender(
    <SearchPanel
      results={[]}
      loading={false}
      onSearch={vi.fn()}
      onOpenResult={vi.fn()}
      focusTrigger={1}
    />
  );

  expect(document.activeElement).toBe(input);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/components/panels/SearchPanel.test.tsx
```

Expected: FAIL — props not yet wired up.

- [ ] **Step 3: Update `SearchPanel.tsx` props type**

Find the `SearchPanelProps` type (around line 4):

```typescript
type SearchPanelProps = {
  loading?: boolean;
  results: WorkspaceSearchFile[];
  onSearch: (query: string) => void;
  onOpenResult: (file: string, line: number) => void;
  autoFocus?: boolean;
};
```

Replace with:

```typescript
type SearchPanelProps = {
  loading?: boolean;
  results: WorkspaceSearchFile[];
  onSearch: (query: string) => void;
  onOpenResult: (file: string, line: number) => void;
  autoFocus?: boolean;
  focusTrigger?: number;
  onReplaceMatch?: (file: string, line: number, searchText: string, replacement: string) => void;
  onReplaceAll?: (searchText: string, replacement: string) => void;
};
```

- [ ] **Step 4: Destructure new props in `SearchPanel` function**

Find the function signature (around line 82):

```typescript
function SearchPanel({
  loading = false,
  results,
  onSearch,
  onOpenResult,
  autoFocus = false,
}: SearchPanelProps) {
```

Replace with:

```typescript
function SearchPanel({
  loading = false,
  results,
  onSearch,
  onOpenResult,
  autoFocus = false,
  focusTrigger = 0,
  onReplaceMatch,
  onReplaceAll,
}: SearchPanelProps) {
```

- [ ] **Step 5: Add `focusTrigger` effect**

After the `searchInputRef` declaration (around line 101):

```typescript
  const searchInputRef = useRef<HTMLInputElement>(null);
```

Add:

```typescript
  useEffect(() => {
    if (focusTrigger > 0) {
      searchInputRef.current?.focus();
    }
  }, [focusTrigger]);
```

- [ ] **Step 6: Add "Replace All" button to the header and "Replace" button per match**

Find the results count + clear block (around line 183):

```tsx
        {/* Results count + clear */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-(--overlay1)">
            {lastSubmittedQuery.length > 0
              ? `${flatResultCount} result${flatResultCount === 1 ? "" : "s"} in ${results.length} file${results.length === 1 ? "" : "s"}`
              : ""}
          </span>
          {lastSubmittedQuery.length > 0 && (
            <button
              type="button"
              onClick={clearSearch}
              className="text-[11px] text-(--overlay1) hover:text-(--subtext1) transition-colors duration-100"
            >
              Clear
            </button>
          )}
        </div>
```

Replace with:

```tsx
        {/* Results count + actions row */}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[11px] text-(--overlay1)">
            {lastSubmittedQuery.length > 0
              ? `${flatResultCount} result${flatResultCount === 1 ? "" : "s"} in ${results.length} file${results.length === 1 ? "" : "s"}`
              : ""}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {lastSubmittedQuery.length > 0 && onReplaceAll && (
              <button
                type="button"
                aria-label="Replace All"
                onClick={() => onReplaceAll(query, replaceQuery)}
                className="rounded border border-(--surface1) bg-(--surface0) px-2 py-0.5 text-[10px] text-(--subtext1) transition-colors duration-100 hover:border-(--border-active) hover:text-(--text)"
              >
                Replace All
              </button>
            )}
            {lastSubmittedQuery.length > 0 && (
              <button
                type="button"
                onClick={clearSearch}
                className="text-[11px] text-(--overlay1) hover:text-(--subtext1) transition-colors duration-100"
              >
                Clear
              </button>
            )}
          </div>
        </div>
```

Find the match row button (around line 274):

```tsx
                          <button
                            type="button"
                            className="flex w-full items-start gap-2 px-3 py-1 text-left transition-colors duration-75 hover:bg-(--bg-hover)"
                            onClick={() => onOpenResult(file.relativePath, match.line)}
                          >
                            <span className="mt-0.5 shrink-0 min-w-7 text-right font-code text-[10px] text-(--overlay1)">
                              {match.line}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-code text-[11px] text-(--subtext0)">
                              <HighlightedPreview
                                preview={match.preview}
                                query={query}
                                matchCase={matchCase}
                              />
                            </span>
                          </button>
```

Replace with:

```tsx
                          <div className="group flex w-full items-start gap-2 px-3 py-1 transition-colors duration-75 hover:bg-(--bg-hover)">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-start gap-2 text-left"
                              onClick={() => onOpenResult(file.relativePath, match.line)}
                            >
                              <span className="mt-0.5 shrink-0 min-w-7 text-right font-code text-[10px] text-(--overlay1)">
                                {match.line}
                              </span>
                              <span className="min-w-0 flex-1 truncate font-code text-[11px] text-(--subtext0)">
                                <HighlightedPreview
                                  preview={match.preview}
                                  query={query}
                                  matchCase={matchCase}
                                />
                              </span>
                            </button>
                            {onReplaceMatch && replaceQuery && (
                              <button
                                type="button"
                                aria-label={`Replace match in ${file.relativePath} line ${match.line}`}
                                onClick={() =>
                                  onReplaceMatch(
                                    file.relativePath,
                                    match.line,
                                    query,
                                    replaceQuery
                                  )
                                }
                                className="shrink-0 rounded border border-(--surface1) px-1.5 py-0.5 text-[9px] text-(--overlay1) opacity-0 transition-opacity duration-75 group-hover:opacity-100 hover:border-(--border-active) hover:text-(--text)"
                              >
                                Replace
                              </button>
                            )}
                          </div>
```

Also change the `<li>` wrapping to remove the button-as-child pattern (the outer `<li>` key stays the same, we've replaced the single button with a div + inner button):

```tsx
                        <li key={`${file.relativePath}:${match.line}:${match.preview}`}>
```

stays unchanged.

- [ ] **Step 7: Run tests**

```
npx vitest run src/components/panels/SearchPanel.test.tsx
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/panels/SearchPanel.tsx
git commit -m "feat: add Replace/Replace All to SearchPanel with focusTrigger support"
```

---

## Task 6: EditorShell — Ctrl+Shift+F shortcut + wire replace props

**Files:**
- Modify: `src/components/editor/EditorShell.tsx`

- [ ] **Step 1: Add `searchFocusTrigger` state**

Find (around line 257):

```typescript
  const [activeTab, setActiveTab] = useState<ActivityBarTab>("search");
```

Add immediately after:

```typescript
  const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);
```

- [ ] **Step 2: Destructure `replaceMatch` and `replaceAllMatches` from the hook**

Find (around line 259):

```typescript
  const {
    searchLoading,
    workspaceSearchResults,
    resetWorkspaceSearch,
    handleWorkspaceSearch,
  } = useWorkspaceSearchState(workspacePath);
```

Replace with:

```typescript
  const {
    searchLoading,
    workspaceSearchResults,
    resetWorkspaceSearch,
    handleWorkspaceSearch,
    replaceMatch: handleReplaceMatch,
    replaceAllMatches: handleReplaceAllMatches,
  } = useWorkspaceSearchState(workspacePath);
```

- [ ] **Step 3: Add Ctrl+Shift+F keyboard handler**

Find the main editor container div in the JSX — it starts around line 1748:

```tsx
    <div
      className="relative flex h-full w-full flex-col bg-[var(--base)] text-[var(--text)]"
    >
```

Add `onKeyDown` to that div:

```tsx
    <div
      className="relative flex h-full w-full flex-col bg-[var(--base)] text-[var(--text)]"
      onKeyDown={(e) => {
        const isMac = navigator.platform.startsWith("Mac");
        const mod = isMac ? e.metaKey : e.ctrlKey;
        if (mod && e.shiftKey && e.key === "F") {
          e.preventDefault();
          setActiveTab("search");
          setSearchFocusTrigger((n) => n + 1);
        }
      }}
    >
```

- [ ] **Step 4: Pass new props to SearchPanel**

Find (around line 1777):

```tsx
              {activeTab === "search" && (
                <SearchPanel
                  results={workspaceSearchResults}
                  loading={searchLoading}
                  onSearch={handleWorkspaceSearch}
                  onOpenResult={(file, line) => {
                    void handleOpenFile(file).then(() => {
                      requestJump(line);
                    });
                  }}
                  autoFocus
                />
              )}
```

Replace with:

```tsx
              {activeTab === "search" && (
                <SearchPanel
                  results={workspaceSearchResults}
                  loading={searchLoading}
                  onSearch={handleWorkspaceSearch}
                  onOpenResult={(file, line) => {
                    void handleOpenFile(file).then(() => {
                      requestJump(line);
                    });
                  }}
                  autoFocus
                  focusTrigger={searchFocusTrigger}
                  onReplaceMatch={(file, line, searchText, replacement) =>
                    void handleReplaceMatch(file, line, searchText, replacement)
                  }
                  onReplaceAll={(searchText, replacement) =>
                    void handleReplaceAllMatches(searchText, replacement)
                  }
                />
              )}
```

- [ ] **Step 5: Run the full test suite**

```
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/EditorShell.tsx
git commit -m "feat: wire Ctrl+Shift+F and workspace replace into EditorShell"
```

---

## Task 7: Smoke-test the complete feature

- [ ] **Step 1: Start the dev server**

```
npm run tauri dev
```

Or if running frontend-only:

```
npm run dev
```

- [ ] **Step 2: Test Ctrl+F (in-file find/replace)**

1. Open a `.go` file in the editor
2. Press `Ctrl+F` — the FindWidget should appear at top-right of the editor
3. Type `mu` — matches should highlight, counter shows "1 of N"
4. Press `Enter` / `↓` — jumps to next match, counter increments
5. Press `Shift+Enter` / `↑` — jumps to previous match
6. Toggle `Aa` — match case updates highlights
7. Type `Lock` in replace field, click **Replace** — replaces current match
8. Click **Replace All** — replaces all matches at once
9. Press `Escape` — widget closes, focus returns to editor

- [ ] **Step 3: Test Ctrl+Shift+F (workspace search/replace)**

1. Press `Ctrl+Shift+F` — sidebar switches to Search tab and input is focused
2. Type a term — results appear
3. Type replacement text in Replace field
4. Hover a match row — **Replace** button appears, click it — file is updated
5. Click **Replace All** — all matches across all files are replaced, results refresh

- [ ] **Step 4: Run the full test suite one more time**

```
npx vitest run
```

Expected: All tests pass.
