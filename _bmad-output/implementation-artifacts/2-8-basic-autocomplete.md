# Story 2.8: Basic Autocomplete

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Go developer,
I want basic code completion from the LSP,
so that I can write code more accurately during the "Fix" phase.

## Acceptance Criteria

1. **Given** a cursor is within an active file
   **When** I trigger completion (e.g., via typing `.` or explicit shortcut)
   **Then** a list of completion candidates from `gopls` is displayed
   **And** selecting a candidate inserts it at the cursor.

## Tasks / Subtasks

- [x] Task 1: Add typed autocomplete IPC contract and Tauri command (AC: #1)
  - [x] Add autocomplete DTOs in `src-tauri/src/ui_bridge/types.rs` (label, detail, kind, insert text, optional replacement range).
  - [x] Add `get_active_file_completions` command in `src-tauri/src/ui_bridge/commands.rs` with strict `.go` path validation and cursor-position validation.
  - [x] Register the new command in `src-tauri/src/lib.rs` and preserve existing command ordering/style.
  - [x] Keep API response shape aligned with existing typed contract pattern (`ApiResponse<T>`).

- [x] Task 2: Implement gopls completion integration in Rust (AC: #1)
  - [x] Extend `src-tauri/src/integration/gopls.rs` with a completion function scoped to active workspace/file.
  - [x] Use the currently installed `gopls` completion capability and parse output into deterministic DTO-friendly structures.
  - [x] Gracefully degrade on failures or unavailable completion data (empty completion list, no editor crash).
  - [x] Add tests for parser normalization, path/file guards, and invalid cursor inputs.

- [x] Task 3: Add frontend completion request/response types and client wrapper (AC: #1)
  - [x] Add completion types to `src/lib/ipc/types.ts` with strict optionality for nullable fields.
  - [x] Add a completion client function to `src/lib/ipc/client.ts` invoking `get_active_file_completions`.
  - [x] Keep naming conventions aligned (`snake_case` Rust command names, `camelCase` TS wrapper names).

- [x] Task 4: Integrate CodeMirror completion UI and insertion flow (AC: #1)
  - [x] Add completion extension wiring in `src/components/editor/CodeEditor.tsx` using CodeMirror completion APIs.
  - [x] Trigger completion on dot typing and explicit completion shortcut without changing existing save/jump interactions.
  - [x] Ensure selecting a candidate inserts at the current cursor position and preserves editor focus/keyboard flow.
  - [x] Keep completion rendering lightweight and editor-first (no additional panel or dashboard UI).

- [x] Task 5: Wire lifecycle guards and file/workspace scoping in EditorShell (AC: #1)
  - [x] Ensure completion requests are scoped to current `workspacePath` and `activeFilePath`.
  - [x] Add stale-response guards so completion responses from previous file/workspace/cursor contexts are ignored.
  - [x] Clear completion state appropriately on file/workspace switches.

- [x] Task 6: Add regression tests for completion behavior and safety rules (AC: #1)
  - [x] Add frontend tests for completion trigger, candidate rendering, and insertion behavior in editor test files.
  - [x] Add frontend tests for stale completion response handling across rapid file switches.
  - [x] Add Rust tests for completion parser and command guardrails.
  - [x] Run and verify `npm test`, `npm run build`, and `cargo test`.

## Dev Notes

### Developer Context (Read First)

- Story 2.8 builds directly on Story 2.7 diagnostics and must follow the same typed IPC and stale-response safety model.
- This story is "basic autocomplete", so keep scope focused on `gopls` candidate fetch + insertion only; do not add ranking engines, AI completion, or multi-panel flows.
- Preserve editor-first UX: completion should feel native to typing in code, not a separate workflow.

### Technical Requirements

- Only support active `.go` files for this story.
- Keep process execution in Rust integration layer; frontend only invokes typed commands.
- Prefer deterministic completion payload mapping to avoid flicker and inconsistent UI behavior.
- Treat completion failures as recoverable; return empty list and continue editing.

### Architecture Compliance

- Rust:
  - Integration logic in `src-tauri/src/integration/gopls.rs`
  - IPC command boundary in `src-tauri/src/ui_bridge/commands.rs`
  - IPC DTOs in `src-tauri/src/ui_bridge/types.rs`
- Frontend:
  - IPC types in `src/lib/ipc/types.ts`
  - IPC invoke wrapper in `src/lib/ipc/client.ts`
  - Editor integration in `src/components/editor/CodeEditor.tsx`
  - Lifecycle/scope guards in `src/components/editor/EditorShell.tsx` (only if state orchestration is required there)
- Maintain minimal command surface and typed `ApiResponse` contract.

### Library / Framework Requirements

- Use existing CodeMirror stack already in project (`@uiw/react-codemirror`, `@codemirror/state`, `@codemirror/view`).
- If completion package support is required, add only the minimal CodeMirror package needed for completion and keep dependency additions narrow.
- Keep `gopls` as the source of truth for candidates; do not introduce alternative completion engines.

### File Structure Requirements

- Do not create new top-level feature folders for this story.
- Keep completion-specific IPC and integration changes inside existing IPC/integration files.
- Keep editor behavior changes localized to existing editor component files.

### Testing Requirements

- Frontend:
  - Trigger behavior for typing `.` and explicit completion shortcut.
  - Candidate selection inserts text at the cursor correctly.
  - Existing save (`Mod-s`), jump, hover hint, and diagnostics behavior remain intact.
  - Stale completion responses must not overwrite active file/editor context.
- Backend:
  - Completion command rejects non-go and traversal paths.
  - Parser handles missing/partial completion fields safely.
  - Failure paths return controlled errors or empty data without panics.
- Verification commands:
  - `npm test -- src/components/editor/CodeEditor.test.tsx src/components/editor/EditorShell.diagnostics.test.tsx`
  - `npm run build`
  - `cargo test`

### Previous Story Intelligence (Story 2.7)

- Reuse typed IPC expansion pattern from Story 2.7 (Rust DTO -> command mapping -> TS type -> TS client wrapper).
- Reuse stale-response protection pattern with request IDs + captured workspace/file refs to avoid cross-file races.
- Preserve graceful degradation behavior used for diagnostics (no UI crash when gopls response is unavailable).
- Keep editor extension layering additive and avoid regression in existing hint underline, jump, and diagnostics integrations.

### Git Intelligence Summary

- Recent commits show incremental story-by-story integration in `EditorShell` and `CodeEditor`; follow the same focused change scope.
- Last implemented stories used explicit regression tests for async lifecycle edge cases; keep that standard for completion.
- Maintain existing naming and module boundaries rather than introducing new abstraction layers for a single story.

### Latest Technical Information

- Project context requires `gopls` on latest stable and local-first execution. Implement against installed `gopls` behavior and avoid assumptions that require network services.
- Keep CodeMirror integration aligned with CM6 extension patterns currently used in this repo.

### Project Structure Notes

- Alignment with unified structure:
  - Rust integration/process logic remains in `src-tauri/src/integration/`
  - Tauri command contracts remain in `src-tauri/src/ui_bridge/`
  - Frontend IPC remains in `src/lib/ipc/`
  - Editor UX logic remains in `src/components/editor/`
- No architecture conflicts identified for this story scope.

### References

- Story definition and AC: [Source: _bmad-output/planning-artifacts/epics.md#Story 2.8: Basic Autocomplete]
- Architecture implementation patterns and boundaries: [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- Project structure boundaries: [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- UX editor-first constraints: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Core User Experience]
- PRD experience constraints and responsiveness requirements: [Source: _bmad-output/planning-artifacts/prd.md#Experience Constraints (Critical)]
- Prior story context and race-guard patterns: [Source: _bmad-output/implementation-artifacts/2-7-lsp-diagnostics.md]
- Agent rules and stack constraints: [Source: _bmad-output/project-context.md]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-04-12: Loaded config and artifact paths from `_bmad/bmm/config.yaml`.
- 2026-04-12: Extracted Story 2.8 requirements from `epics.md`.
- 2026-04-12: Reviewed architecture, PRD, UX, and project context constraints.
- 2026-04-12: Reviewed Story 2.7 for prior implementation learnings and test patterns.
- 2026-04-12: Updated sprint tracking status for `2-8-basic-autocomplete` to `in-progress`.
- 2026-04-12: Added Rust completion DTOs/command validation and `gopls completion` parsing with graceful fallback behavior.
- 2026-04-12: Added frontend IPC completion contracts and client invocation wrapper.
- 2026-04-12: Integrated CodeMirror completion source for dot trigger and explicit shortcut (`Ctrl-Space`) with candidate insertion logic.
- 2026-04-12: Added EditorShell completion request lifecycle guardrails for stale workspace/file responses.
- 2026-04-12: Added regression tests for completion parsing, command guardrails, completion trigger behavior, and stale response handling.
- 2026-04-12: Validation passed: `npm test`, `npm run build`, and `cargo test`.

### Completion Notes List

- Story 2.8 context includes concrete backend/frontend/testing tasks tied directly to current code locations.
- Added anti-regression and stale-response guardrails based on established Story 2.7 patterns.
- Kept scope intentionally narrow to "basic autocomplete" from `gopls`.
- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented typed autocomplete command flow end-to-end: Rust integration -> Tauri command -> TS IPC -> editor completion source.
- Completion candidates now load from `gopls` for active `.go` files and insert at cursor via CodeMirror completion apply handlers.
- Added explicit cursor and path guardrails to reject invalid completion requests safely.
- Added stale request invalidation when workspace/file changes so old completion responses cannot overwrite current context.
- Added and passed frontend and backend regression tests covering trigger behavior, insertion path, parser behavior, and safety guardrails.

### File List

- _bmad-output/implementation-artifacts/2-8-basic-autocomplete.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src-tauri/src/lib.rs
- src-tauri/src/integration/gopls.rs
- src-tauri/src/ui_bridge/commands.rs
- src-tauri/src/ui_bridge/types.rs
- src/lib/ipc/types.ts
- src/lib/ipc/client.ts
- src/components/editor/CodeEditor.tsx
- src/components/editor/EditorShell.tsx
- src/components/editor/CodeEditor.test.tsx
- src/components/editor/EditorShell.completions.test.tsx

## Change Log

- 2026-04-12: Created Story 2.8 context file and prepared status transition to `ready-for-dev`.
- 2026-04-12: Implemented Story 2.8 basic autocomplete end-to-end and validated with full frontend/Rust regression suites.
- 2026-04-12: Code review completed with no actionable findings; story advanced to `done`.
