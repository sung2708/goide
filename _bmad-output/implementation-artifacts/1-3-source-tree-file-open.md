# Story 1.3: Source Tree + File Open

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Go developer,
I want to browse files and open a Go file from the source tree,
so that I can view and work on code in the editor.

## Acceptance Criteria

1. **Given** a workspace is open
   **When** I click a file in the source tree
   **Then** the file opens in the editor
   **And** only the active file is considered for analysis

## Tasks / Subtasks

- [x] Task 1: Add workspace file access via typed IPC (AC: #1)
  - [x] Define IPC types for directory entries + file contents
  - [x] Add Rust commands to list directory entries and read a file, scoped to the selected workspace path only
  - [x] Enforce path safety (canonicalize + ensure requested path is inside workspace root)
  - [x] Add minimal frontend IPC client wrapper to invoke the commands
- [x] Task 2: Build the Source Tree UI (AC: #1)
  - [x] Replace placeholder in `src/components/sidebar/SourceTree.tsx` with a real tree
  - [x] Show directories and files in a low-noise, editor-first style
  - [x] Support expand/collapse for directories (lazy-load children on expand)
  - [x] Ignore noisy folders by default (e.g., `node_modules`, `.git`, `target`, `dist`) to preserve performance
- [x] Task 3: Open file into editor view (AC: #1)
  - [x] Add `activeFilePath` + `activeFileContent` state in `src/components/editor/EditorShell.tsx`
  - [x] When a file is clicked in the tree, load its contents and render in the editor region
  - [x] Keep the view read-only, monospace, and without syntax highlighting (that is Story 1.4)
- [x] Task 4: Active-file-only guard (AC: #1)
  - [x] Ensure the UI and any future analysis hooks only track `activeFilePath` (no multi-file analysis)
  - [x] Do not preload or index other files in this story
- [x] Task 5: Error handling + empty states (AC: #1)
  - [x] If file read fails, show a compact inline error but keep the shell stable
  - [x] If no workspace is selected, show the existing empty state

## Dev Notes

### Technical Requirements

- Source tree + file open is UI-only; no gopls, no analysis engine yet.
- File access must be strictly scoped to the selected workspace path.
- Prefer lazy-loading for directories to keep the tree responsive and memory light.
- Keep the editor region dominant (70-80% width) and avoid introducing right/bottom panels.
- Read-only file view only; no syntax highlighting, line numbers, or editing in this story.

### Architecture Compliance

- Keep the Tauri layer thin and use typed IPC contracts.
- Rust owns filesystem access; frontend only requests data via IPC.
- Respect module boundaries:
  - Rust commands in `src-tauri/src/ui_bridge/commands.rs`
  - Rust types in `src-tauri/src/ui_bridge/types.rs`
  - Optional Rust helper in `src-tauri/src/integration/fs.rs`
  - Frontend IPC types in `src/lib/ipc/types.ts`
  - Frontend IPC client in `src/lib/ipc/client.ts`
- Do not introduce global state beyond `EditorShell` local state for this story.

### Library / Framework Requirements (Latest)

- Tauri v2 supports filesystem access via the `@tauri-apps/plugin-fs` APIs (e.g., `readDir`, `readTextFile`). If you choose the plugin path instead of custom IPC, ensure permissions/scopes are configured to only allow the selected workspace path.
- Tauri FS plugin scoping uses a permission entry (e.g., `fs:scope`) with explicit allow globs; any paths outside scope are denied.

### File Structure Requirements

- Update existing files:
  - `src/components/sidebar/SourceTree.tsx`
  - `src/components/editor/EditorShell.tsx`
  - `src/components/statusbar/StatusBar.tsx` (optional: show active file name)
- New files (if needed):
  - `src/lib/ipc/types.ts`
  - `src/lib/ipc/client.ts`
  - `src-tauri/src/ui_bridge/commands.rs`
  - `src-tauri/src/ui_bridge/types.rs`
  - `src-tauri/src/integration/fs.rs`

### Testing Requirements

- No automated tests required for this story.
- Manual verification:
  - Open workspace -> source tree renders within sidebar.
  - Click a `.go` file -> content appears in editor region.
  - Active file path updates; no background indexing of other files.
  - Cancel workspace dialog -> empty state remains.

### Previous Story Intelligence

- `EditorShell` already holds `workspacePath` state and handles Open Workspace via dialog; reuse that state as the root for the tree.
- `SourceTree` is currently a placeholder and should be replaced, not duplicated.
- Tailwind tokens and fonts are set in `src/styles/global.css`; keep styling consistent.

### Git Intelligence Summary

- Story 1.2 added `EditorShell`, `SourceTree`, `StatusBar`, Tailwind setup, and dialog plugin wiring; no existing file tree or IPC patterns to preserve.

### Latest Tech Information

- If using the Tauri FS plugin, `readDir` returns directory entries and `readTextFile` returns UTF-8 file contents; both are available in `@tauri-apps/plugin-fs`.
- Scope permissions control which paths the FS plugin can access; keep scope limited to the opened workspace.

### Project Context Reference

- Local-only execution, no network calls, and editor-first UI must be preserved.
- Follow `project-context.md`, `architecture.md`, and `ux-design-specification.md` for stack, boundaries, and UX constraints.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design System Foundation]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Overlay Patterns]
- [Source: _bmad-output/planning-artifacts/prd.md#Output Definition]
- [Source: _bmad-output/project-context.md#Critical Implementation Rules]
- [Source: https://tauri.app/reference/javascript/fs/]

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- 2026-04-09: `cargo test` failed with zig toolchain; reran with `CC=cl` and `CXX=cl` to pass.

### Completion Notes List

- Implemented typed IPC contracts and Rust filesystem commands scoped to the workspace root with path safety checks.
- Built a lazy-loading source tree UI with ignored noisy folders and active file highlighting.
- Wired file open to render read-only contents in the editor region with inline error states.
- Ensured only the active file is tracked for UI and future analysis hooks.
- Tests: `cargo test` (with `CC=cl` and `CXX=cl`) in `src-tauri`.

### File List

- src/components/sidebar/SourceTree.tsx
- src/components/editor/EditorShell.tsx
- src/components/statusbar/StatusBar.tsx
- src/lib/ipc/types.ts
- src/lib/ipc/client.ts
- src-tauri/src/ui_bridge/types.rs
- src-tauri/src/ui_bridge/commands.rs
- src-tauri/src/integration/fs.rs
- src-tauri/src/lib.rs
- src-tauri/Cargo.toml
- src-tauri/Cargo.lock
- _bmad-output/implementation-artifacts/1-3-source-tree-file-open.md

## Change Log

- 2026-04-09: Implemented workspace-scoped source tree, file open flow, and IPC wiring with path safety.

