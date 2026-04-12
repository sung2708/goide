# Story 2.7: LSP Diagnostics

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Go developer,
I want to see error and warning squiggles in the editor,
so that I get immediate feedback on my code changes.

## Acceptance Criteria

1. **Given** an LSP (gopls) is connected
   **When** I save a file with errors or warnings
   **Then** diagnostics are rendered in the editor gutter and as squiggles on the code
   **And** hover details show the specific diagnostic message.

## Tasks / Subtasks

- [x] Task 1: Add typed diagnostics request/response across Rust and TS IPC boundary (AC: #1)
  - [x] Add diagnostics DTOs in `src-tauri/src/ui_bridge/types.rs` (severity, range, message, source/code).
  - [x] Add a new diagnostics command in `src-tauri/src/ui_bridge/commands.rs` for active Go files only.
  - [x] Add frontend types in `src/lib/ipc/types.ts` and client function in `src/lib/ipc/client.ts`.
  - [x] Reuse existing path validation and scoped file constraints from current analysis/save command patterns.

- [x] Task 2: Implement gopls diagnostics integration in Rust integration layer (AC: #1)
  - [x] Extend `src-tauri/src/integration/gopls.rs` with a diagnostics-oriented API returning normalized diagnostics per file.
  - [x] Parse gopls output deterministically and map to stable line/column ranges expected by CodeMirror.
  - [x] Ensure diagnostics failures degrade gracefully (empty diagnostics + structured error), without crashing editor workflows.
  - [x] Keep diagnostics scoped to active file path only.

- [x] Task 3: Render diagnostics in CodeMirror with squiggles, gutter markers, and hover messages (AC: #1)
  - [x] Add diagnostics rendering support to `src/components/editor/CodeEditor.tsx` using CodeMirror diagnostic/lint extensions.
  - [x] Ensure severity styling differentiates warning vs error while staying aligned with existing theme tokens.
  - [x] Enable hover tooltip content from diagnostic message text.
  - [x] Preserve existing hover-hint and overlay interactions (no regressions to Quick Insight overlays).

- [x] Task 4: Wire save-to-diagnostics refresh in EditorShell with stale-response guards (AC: #1)
  - [x] In `src/components/editor/EditorShell.tsx`, trigger diagnostics refresh only after successful save.
  - [x] Add stale-guard checks so diagnostics responses from prior file/workspace do not overwrite current state.
  - [x] Clear diagnostics on workspace/file switch and for non-Go files.
  - [x] Keep dirty/save/run behaviors consistent with current save flow.

- [x] Task 5: Add regression tests for diagnostics fetch, rendering, and lifecycle rules (AC: #1)
  - [x] Add/extend Rust tests for diagnostics parsing + path validation in `src-tauri/src/integration/gopls.rs` and/or `src-tauri/src/ui_bridge/commands.rs`.
  - [x] Add frontend tests for CodeEditor diagnostics rendering and hover tooltip behavior.
  - [x] Add EditorShell tests for save-triggered refresh and stale-response protection during file switches.
  - [x] Verify no regressions in existing lens/run/save tests.

## Dev Notes

### Developer Context (Read First)

- Story 2.7 must integrate LSP diagnostics into the existing editor-first loop without introducing extra panel noise or non-local workflows.
- Diagnostics are save-triggered for this story scope. Avoid adding background polling or persistent diagnostics jobs unless required for correctness.
- Current architecture already uses typed Tauri commands and deterministic state guards; diagnostics should follow the same pattern.

### Implementation Guidance

- Backend:
  - Prefer extending existing `gopls` integration (`src-tauri/src/integration/gopls.rs`) rather than introducing a parallel diagnostics integration module.
  - Keep command input constrained to relative `.go` active-file paths using the same traversal protections used in current analysis commands.
- Frontend:
  - Keep diagnostics state local to editor shell orchestration and pass a typed diagnostics prop into `CodeEditor`.
  - Use CodeMirror-native diagnostics/lint extension path for squiggles + gutter + hover tooltip behavior.
  - Ensure diagnostics rendering does not break current highlight classes (`PREDICTED_HINT_UNDERLINE_CLASS`) or jump/anchor behavior.

### Architecture Compliance

- Rust module boundaries:
  - Integration logic in `src-tauri/src/integration/`
  - Command bridge in `src-tauri/src/ui_bridge/commands.rs`
  - DTO contracts in `src-tauri/src/ui_bridge/types.rs`
- Frontend boundaries:
  - IPC models in `src/lib/ipc/types.ts`
  - IPC invocation wrapper in `src/lib/ipc/client.ts`
  - Editor shell orchestration in `src/components/editor/EditorShell.tsx`
  - Rendering logic in `src/components/editor/CodeEditor.tsx`
- Do not bypass typed IPC by calling filesystem or process APIs directly from frontend.

### Testing Requirements

- Frontend:
  - Validate squiggle + gutter presence for diagnostics data.
  - Validate hover message rendering for warnings and errors.
  - Validate diagnostics clear/reset semantics on file change/workspace change.
  - Validate stale save/diagnostics completions do not mutate state for newly active file.
- Backend:
  - Validate diagnostics command path constraints and `.go` extension guardrails.
  - Validate parser normalization into expected line/column ranges and severities.
- Verification commands:
  - `npm test -- src/components/editor/CodeEditor.test.tsx src/components/editor/EditorShell.test.tsx src/features/concurrency/useLensSignals.test.tsx`
  - `npm run build`
  - `cargo test`

### Project Structure Notes

- Existing signal analysis (`useLensSignals`) provides a model for async IPC with stale guards; mirror this lifecycle pattern for diagnostics state updates.
- `EditorShell` already coordinates save lifecycle and file/workspace switching, so diagnostics refresh belongs there.
- Keep styling changes within existing editor theme conventions in `codemirrorTheme.ts` unless diagnostics-specific classes are necessary.

### References

- Story definition and AC: [Source: _bmad-output/planning-artifacts/epics.md#Story 2.7: LSP Diagnostics]
- PRD requirements coverage (FR10 diagnostics in editor-first workflow): [Source: _bmad-output/planning-artifacts/epics.md#Functional Requirements]
- Architecture module boundaries and integration flow: [Source: _bmad-output/planning-artifacts/architecture.md#Codebase-Start-Point]
- UX editor-first/noise constraints: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Information-Architecture]
- Prior story context patterns for save lifecycle + state guards: [Source: _bmad-output/implementation-artifacts/1-7-write-save.md]
- Current implementation touchpoints:
  - `src-tauri/src/integration/gopls.rs`
  - `src-tauri/src/ui_bridge/commands.rs`
  - `src-tauri/src/ui_bridge/types.rs`
  - `src/lib/ipc/client.ts`
  - `src/lib/ipc/types.ts`
  - `src/components/editor/EditorShell.tsx`
  - `src/components/editor/CodeEditor.tsx`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-04-12: Loaded and analyzed `epics.md`, `prd.md`, `architecture.md`, `ux-design-specification.md`, `project-context.md`, and previous story artifacts.
- 2026-04-12: Reviewed current implementation modules for gopls integration, typed IPC bridge, editor orchestration, and existing async stale-guard patterns.
- 2026-04-12: Created Story 2.7 implementation artifact and set status to `ready-for-dev`.
- 2026-04-12: Updated sprint/story status to `in-progress` and executed red-phase tests for diagnostics contracts/rendering/save-refresh behavior.
- 2026-04-12: Implemented Rust diagnostics models, `gopls check` parsing, diagnostics command bridge, and command registration.
- 2026-04-12: Implemented frontend diagnostics types/client, CodeMirror lint integration, and `EditorShell` save-triggered diagnostics refresh with stale guards.
- 2026-04-12: Added and stabilized diagnostics regression tests in `CodeEditor` and `EditorShell`.
- 2026-04-12: Validation passed: `npm test`, `npm run build`, and `cargo test`.

### Completion Notes List

- Story 2.7 context now contains implementation-ready backend/frontend/test tasks scoped to save-triggered LSP diagnostics.
- Included explicit anti-regression guardrails for file-switch races and existing overlay/save behavior.
- Added concrete file-level guidance aligned to current module boundaries and naming conventions.
- Added a typed diagnostics IPC contract end-to-end (Rust DTOs, command bridge, TS types/client) for active `.go` files.
- Added `gopls check` diagnostics parsing with normalized ranges/severity and graceful fallback to empty diagnostics when unavailable.
- Added CodeMirror diagnostics rendering (lint gutter + squiggles + hover messages) with warning/error styling in the existing theme.
- Added save-triggered diagnostics refresh in `EditorShell` and protected against stale diagnostics updates after file/workspace changes.
- Added regression tests for diagnostics application in `CodeEditor` and save-triggered diagnostics lifecycle in `EditorShell`.

### File List

- _bmad-output/implementation-artifacts/2-7-lsp-diagnostics.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src-tauri/src/integration/gopls.rs
- src-tauri/src/ui_bridge/types.rs
- src-tauri/src/ui_bridge/commands.rs
- src-tauri/src/lib.rs
- src/lib/ipc/types.ts
- src/lib/ipc/client.ts
- src/components/editor/CodeEditor.tsx
- src/components/editor/codemirrorTheme.ts
- src/components/editor/EditorShell.tsx
- src/components/editor/CodeEditor.test.tsx
- src/components/editor/EditorShell.diagnostics.test.tsx

## Change Log

- 2026-04-12: Created Story 2.7 context file and moved sprint status to `ready-for-dev`.
- 2026-04-12: Story moved to `in-progress` and diagnostics implementation started.
- 2026-04-12: Implemented Story 2.7 diagnostics flow end-to-end and moved story status to `review`.

### Review Findings

- [x] [Review][Patch] Brittle parsing of gopls check output (missing column) [src-tauri/src/integration/gopls.rs:103]
- [x] [Review][Patch] Missing column boundary checks in CodeMirror mapping [src/components/editor/CodeEditor.tsx:494]
- [x] [Review][Defer] Incomplete error handling for missing gopls [src-tauri/src/integration/gopls.rs:47] — deferred, pre-existing
- [x] [Review][Defer] Potential missing diagnostics from stderr [src-tauri/src/integration/gopls.rs:57] — deferred, pre-existing
