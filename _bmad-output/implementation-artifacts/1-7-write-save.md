# Story 1.7: Write & Save

Status: done

## Story

As a Go developer,
I want to edit and save my Go files,
so that I can fix identified concurrency issues without leaving the IDE.

## Acceptance Criteria

1. **Given** a Go file is open in the editor, **When** I type code and press Cmd/Ctrl+S, **Then** the file is saved to the local filesystem via Tauri FS bridge.
2. **Given** a session is active, **When** I make changes, **Then** basic undo/redo functionality (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z) is available.
3. **Given** a save operation is triggered, **When** it completes successfully, **Then** no errors are shown and the actual file on disk is updated.

## Tasks / Subtasks

- [x] **Rust: Implement `save_file` command** (AC: 1, 3)
  - [x] Create `save_file` command in `src-tauri/src/lib.rs` (or `main.rs`).
  - [x] Use `tokio::fs::write` and return `Result<(), String>`.
  - [x] Register command in the Tauri builder.
- [x] **React: Update `CodeEditor` for Editing** (AC: 2)
  - [x] Import `history` and `historyKeymap` from `@codemirror/commands`.
  - [x] Add `history()` and `keymap.of(historyKeymap)` to the extensions array in `CodeEditor.tsx`.
  - [x] Toggle `editable={true}` and `readOnly={false}` in the `CodeMirror` component.
- [x] **React: Implement Save Shortcut** (AC: 1)
  - [x] Add a `keymap` extension for `Mod-s` (Cmd/Ctrl+S).
  - [x] Pass an `onSave` callback from `EditorShell` to `CodeEditor`.
  - [x] Call `invoke("save_file", { path, content })` in the `onSave` handler.
- [x] **UI: Polish**
  - [x] Ensure the "dirty" state is handled (optional for 1.7, but recommended to prevent data loss).

## Dev Notes

### Architecture Compliance
- Use the established **Typed IPC** pattern for the `save_file` command.
- Frontend should not use `@tauri-apps/plugin-fs` directly to maintain the bridge pattern and allow for future backend-side analysis (like triggering a re-analysis on save). [Source: architecture.md#API Patterns]

### Source Tree Components
- `src-tauri/src/lib.rs` (or `main.rs`): Tauri commands.
- `src/components/editor/CodeEditor.tsx`: Editor extensions and props.
- `src/components/editor/EditorShell.tsx`: High-level save orchestration.

### Technical specifics: CodeMirror 6 History
- Since `basicSetup={false}` is used in `CodeEditor.tsx`, you MUST explicitly add the history extensions.
- Shortcuts: `Mod-z` for Undo, `Mod-Shift-z` (or `Mod-y`) for Redo. [Source: CodeMirror 6 Docs]

## Dev Agent Record

### Agent Model Used
Claude Sonnet 4.6 (Thinking)

### Debug Log References
- Research on CodeMirror 6 history (basicSetup=false requires explicit history() + historyKeymap): [Conversation History]
- `write_file` implemented in `integration/fs.rs` following same scoped-path validation pattern as `read_file`.

### Completion Notes List
- `write_file` hardened in `src-tauri/src/integration/fs.rs` with atomic write and scoped validation.
- `isDirty` state tracking implemented in `EditorShell.tsx` with header `*` indicator.
- `saveStatus` feedback (Saving..., Saved, Error) implemented in `StatusBar.tsx`.
- `CodeEditor.tsx` now supports `editable` prop and `onChange` for state synchronization.
- 19/19 Rust tests pass; 64/64 Frontend tests pass.

### File List
- `src-tauri/src/integration/fs.rs`
- `src-tauri/src/ui_bridge/commands.rs`
- `src-tauri/src/lib.rs`
- `src/lib/ipc/client.ts`
- `src/components/editor/CodeEditor.tsx`
- `src/components/editor/EditorShell.tsx`
