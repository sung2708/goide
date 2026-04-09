# Story 1.4: Editor Rendering + Syntax Highlighting

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Go developer,
I want Go files rendered with syntax highlighting and line numbers,
so that I can read code clearly inside the IDE.

## Acceptance Criteria

1. **Given** a Go file is open
   **When** the editor renders
   **Then** syntax highlighting is visible for Go
   **And** line numbers are shown in the gutter

## Tasks / Subtasks

- [x] Task 1: Add a read-only CodeMirror editor for Go (AC: #1)
  - [x] Add CodeMirror React wrapper + Go language extension dependencies
  - [x] Configure Go syntax highlighting using `@codemirror/lang-go` (Lezer)
  - [x] **Evaluate Tree-sitter** for future semantic-aware highlighting
  - [x] Enable line numbers via `@codemirror/view` `lineNumbers()`
  - [x] Set editor to read-only and non-editable
- [x] Task 2: Integrate the editor into `EditorShell` (AC: #1)
  - [x] Replace the `<pre>` rendering with the `CodeEditor` component
  - [x] Keep existing loading/error/empty states intact
- [x] Task 3: Styling and layout tuning (AC: #1)
  - [x] Match Catppuccin Mocha palette and font tokens
- [x] Task 4: Guardrails (AC: #1)
  - [x] Maintain read-only behavior

## Dev Notes

### Technical Requirements

- Use CodeMirror 6 (via `@uiw/react-codemirror`) for frontend rendering.
- Frontend highlighting will use Lezer (default CM6 parser) for performance.
- Tree-sitter integration is deferred to Story 2.x for backend concurrency analysis.

### Architecture Compliance

- UI-only change for initial rendering.
- Maintain workspace-scoping patterns.

## Dev Agent Record

### Agent Model Used

GPT-5 (Amelia)

### Debug Log References

- 2026-04-09: `npm install` hit EPERM in npm cache; reran with elevated permissions.
- 2026-04-09: `cargo test` with `CC=cl` and `CXX=cl` succeeded.

### Completion Notes List

- Added CodeMirror 6 with Go syntax highlighting and line numbers using a Catppuccin-aligned theme.
- Replaced the `<pre>` renderer with a read-only CodeMirror view while preserving empty/error states.
- Kept active-file-only rendering; editing stays disabled.
- Tree-sitter evaluation: deferred to Story 2.x as planned (Lezer used for now).
- Tests: `cargo test` (with `CC=cl`, `CXX=cl`) in `src-tauri`.

### File List

- src/components/editor/CodeEditor.tsx
- src/components/editor/codemirrorTheme.ts
- src/components/editor/EditorShell.tsx
- package.json
- package-lock.json
- _bmad-output/implementation-artifacts/1-4-editor-rendering-syntax-highlighting.md

## Change Log

- 2026-04-09: Added CodeMirror-based Go editor with line numbers and read-only rendering.
