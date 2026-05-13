# Find Widget Design

**Date:** 2026-05-12
**Scope:** In-file find/replace (Ctrl+F) + workspace find/replace (Ctrl+Shift+F)

---

## Overview

Replace CodeMirror's default search panel with a custom React find/replace widget matching the SVG mockup (Nord dark theme). Add replace functionality to the workspace-wide search sidebar panel.

Two distinct features:
1. **FindWidget** — floating bar overlaying the editor for in-file search/replace (Ctrl+F)
2. **Workspace Replace** — enhance the existing sidebar SearchPanel with Replace/Replace All (Ctrl+Shift+F)

---

## Part 1: FindWidget (Ctrl+F — in-file)

### UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔍 [query..............] [Aa][ab][.*]  │ 1 of 5 │  ↑   ↓   ✕ │
│ ↩  [replace text.......] [Replace] [Replace All]                │
└─────────────────────────────────────────────────────────────────┘
```

- Positioned absolute, top-right corner of editor container, `z-50`
- Nord dark theme: `bg-(--mantle)`, `border-(--surface1)`, match-case active = `text-(--blue)`
- Replace row is always visible (not collapsible), same height as find row
- Widget appears/disappears with CSS transition (`opacity`, `translate-y`)

### Component: `FindWidget.tsx`

**Props (sourced from `useFindWidget` hook):**

```typescript
type FindWidgetProps = {
  query: string;
  replaceText: string;
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  matchInfo: { current: number; total: number };
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
  queryInputRef: RefObject<HTMLInputElement | null>;
};
```

**Keyboard behavior inside widget:**
- `Enter` → `onFindNext`
- `Shift+Enter` → `onFindPrev`
- `Escape` → `onClose`
- `Tab` → move from find row to replace row

### Hook: `useFindWidget.ts`

Manages all find state and bridges to CodeMirror via `EditorView`.

**State:**
- `isOpen: boolean`
- `query: string`
- `replaceText: string`
- `matchCase: boolean`
- `wholeWord: boolean`
- `useRegex: boolean`
- `matchInfo: { current: number; total: number }`

**CodeMirror integration:**
- On every state change: `view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search, caseSensitive, wholeWord, regexp })) })`
- Match total: iterate `SearchQuery.getCursor(view.state.doc)` and count
- Current match index: after `findNext`/`findPrev`, compare selection start against all match positions
- `open()`: sets `isOpen = true`, focuses query input on next tick
- `close()`: sets `isOpen = false`, returns focus to editor via `view.focus()`

**Exposed operations:**
- `findNext()` → `findNext(view)`
- `findPrev()` → `findPrevious(view)`
- `replace()` → `replaceNext(view)`
- `replaceAll()` → `replaceAll(view)`

### CodeEditor integration

**Remove:** `search({ top: true })` from extensions array.

**Add:**
- `useFindWidget(viewRef)` hook call
- Ctrl+F keymap override: `{ key: "Mod-f", run: () => { findWidget.open(); return true; } }`
- Render `<FindWidget {...findWidget} />` as absolute overlay inside the editor container div when `findWidget.isOpen`

**No new props on `CodeEditorProps`** — find widget is self-contained within CodeEditor.

---

## Part 2: Workspace Replace (Ctrl+Shift+F)

### Keyboard shortcut

`EditorShell.tsx`: add `keydown` listener on the editor container for `Ctrl+Shift+F` (and `Cmd+Shift+F` on Mac) that calls `setActiveTab("search")` and focuses the search input via a new `focusSearchPanel` callback passed down to SearchPanel.

### SearchPanel Replace UI

SearchPanel.tsx already has a Replace input. Add:
- `[Replace]` button next to each individual match
- `[Replace All]` button at the bottom of the search header
- Two new props: `onReplaceMatch(file, line, matchText, replacement)` and `onReplaceAll(replacement)`

### useWorkspaceSearchState — replace functions

```typescript
// Replace a single match in a file at a specific line
async function replaceMatch(
  file: string,
  line: number,
  matchText: string,
  replacement: string
): Promise<void>

// Replace all matches across all search result files
async function replaceAllMatches(replacement: string): Promise<void>
```

**Implementation:**
1. `readWorkspaceFile(file)` → get current content
2. Apply string replacement (respecting current `matchCase`/`wholeWord`/`useRegex` toggles)
3. `writeWorkspaceFile(file, newContent)` → write back
4. Re-run search to refresh results

**Error handling:** If write fails (file locked, permission error), surface error inline in SearchPanel near the affected file entry.

---

## Testing

### FindWidget

- `FindWidget.test.tsx`: render widget, type query, check toggle states, check match counter display, check close on Escape
- `useFindWidget.test.ts`: unit test state transitions (open/close, query sync, matchInfo counts)

### Workspace Replace

- `SearchPanel.test.tsx`: add tests for Replace button renders, calls `onReplaceMatch` with correct args, Replace All calls `onReplaceAll`
- `useWorkspaceSearchState.test.ts`: mock `readWorkspaceFile`/`writeWorkspaceFile`, verify replace logic applies correctly (plain, case-insensitive, regex)

---

## File Summary

| File | Action |
|---|---|
| `src/components/editor/FindWidget.tsx` | Create |
| `src/hooks/useFindWidget.ts` | Create |
| `src/components/editor/CodeEditor.tsx` | Modify — remove default search panel, integrate FindWidget |
| `src/components/editor/EditorShell.tsx` | Modify — add Ctrl+Shift+F shortcut |
| `src/components/panels/SearchPanel.tsx` | Modify — add Replace/Replace All buttons + props |
| `src/components/editor/useWorkspaceSearchState.ts` | Modify — add replace functions |
| `src/components/editor/FindWidget.test.tsx` | Create |
| `src/hooks/useFindWidget.test.ts` | Create |
