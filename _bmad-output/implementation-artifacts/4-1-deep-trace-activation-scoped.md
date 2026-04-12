# Story 4.1: Deep Trace Activation (Scoped)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want to activate Deep Trace scoped to the current flow,
so that runtime sampling remains focused and lightweight.

## Acceptance Criteria

1. **Given** a concurrency line is in focus
   **When** I activate Deep Trace
   **Then** tracing is scoped to the current functional flow
   **And** the UI remains responsive without blocking

## Tasks / Subtasks

- [x] Task 1: Add explicit Deep Trace activation state and request payload in frontend shell (AC: #1)
  - [x] Promote `mode` from a fixed value to mutable state in `EditorShell` and switch to `"deep-trace"` only when activation succeeds.
  - [x] Capture scope from current interaction (`activeHintLine`, `activeHint.kind`, `activeHint.symbol`, `activeFilePath`) and construct a typed activation request.
  - [x] Ensure activation is no-op when required scope context is missing.

- [x] Task 2: Wire InlineActions `Deep Trace` action to real activation flow (AC: #1)
  - [x] Pass `onDeepTrace` from `EditorShell` into `InlineActions`.
  - [x] Keep action contextual and local to active file; do not introduce global toolbar behavior.
  - [x] Preserve existing `Jump` behavior and avoid regressions in counterpart navigation.

- [x] Task 3: Add typed Tauri IPC contract for starting scoped Deep Trace session (AC: #1)
  - [x] Add request/response DTOs in `src-tauri/src/ui_bridge/types.rs` and mirrored TS types in `src/lib/ipc/types.ts`.
  - [x] Add frontend client wrapper in `src/lib/ipc/client.ts` and a new command in `src-tauri/src/ui_bridge/commands.rs`.
  - [x] Keep command surface minimal and validate path/scope inputs to remain inside workspace boundaries.

- [x] Task 4: Ensure non-blocking runtime behavior and graceful fallback (AC: #1)
  - [x] Run activation work asynchronously on Rust side (no UI-thread blocking).
  - [x] If runtime is unavailable or activation fails, keep `mode` in `"quick-insight"`, retain static hints, and surface low-noise status/error handling.
  - [x] Keep editor interaction budgets intact (no long synchronous handlers in React events).

- [x] Task 5: Add focused tests for activation, scoping, and resilience (AC: #1)
  - [x] Add/extend `EditorShell` tests to verify `Deep Trace` click issues scoped activation request from active hint context.
  - [x] Add tests ensuring missing scope does not trigger activation and does not flip mode.
  - [x] Add tests ensuring failed activation preserves fallback behavior (Quick Insight + static hints).

### Review Findings

- [x] [Review][Patch] Stale Deep Trace activation response can flip mode in the wrong workspace/file context [src/components/editor/EditorShell.tsx:245]
- [x] [Review][Patch] Deep Trace command accepts invalid workspace/file targets and still returns success; workspace boundary is not actually validated [src-tauri/src/ui_bridge/commands.rs:253]
- [x] [Review][Patch] Runtime availability indicator is inferred from `.go` extension, not runtime health, so status can report Available when runtime is actually unavailable [src/components/editor/EditorShell.tsx:654]

## Dev Notes

### Developer Context (Read First)

- Epic 4 introduces runtime-confirmed signals on top of the static and navigation foundations from Epics 2 and 3.
- Story 4.1 is activation and scoping only; do not implement full runtime sampling/rendering here (that belongs to Stories 4.2+).
- Reuse existing interaction primitives (`activeHint`, `interactionAnchor`, `InlineActions`) and avoid creating parallel state models.

### Technical Requirements

- Activation scope must be derived from the active file and active hint context only.
- Activation flow must be idempotent and safe to re-trigger while preserving UI responsiveness.
- Mode transition rules:
  - success: `quick-insight -> deep-trace`
  - failure/unavailable: remain in `quick-insight`
- Runtime-unavailable path must remain graceful and low-noise; no error panel takeover.

### Architecture Compliance

- Maintain module boundaries:
  - Frontend orchestration in `src/components/editor/*` and `src/components/overlays/*`
  - IPC contracts in `src/lib/ipc/*` and `src-tauri/src/ui_bridge/*`
  - Runtime/process integration remains in Rust `src-tauri/src/integration/*`
- No frontend shell/process execution. All runtime session startup stays in Rust.
- Keep typed `ApiResponse` pattern (`{ ok, data?, error? }`) consistent.

### Library / Framework Requirements

- React + TypeScript strict typing; no `any` for Deep Trace payloads.
- Tauri v2 command invocation via `@tauri-apps/api/core` invoke wrappers.
- Rust async execution via `tauri::async_runtime`/Tokio to keep activation non-blocking.

### File Structure Requirements

- Expected touchpoints for this story:
  - `src/components/editor/EditorShell.tsx`
  - `src/components/overlays/InlineActions.tsx`
  - `src/components/editor/EditorShell.inline-actions.test.tsx` (or `EditorShell.test.tsx`)
  - `src/lib/ipc/types.ts`
  - `src/lib/ipc/client.ts`
  - `src-tauri/src/ui_bridge/types.rs`
  - `src-tauri/src/ui_bridge/commands.rs`
  - optional: `src-tauri/src/integration/process.rs` (only if a minimal activation/session primitive is required)

### Testing Requirements

- Verify scoped payload creation from active hint context.
- Verify `Deep Trace` action path is disabled/unavailable when runtime is unavailable (existing behavior) and does not regress.
- Verify mode changes only on success.
- Verify fallback behavior keeps static hinting intact on activation error.
- Suggested commands:
  - `npm test -- src/components/editor/EditorShell.inline-actions.test.tsx src/components/overlays/InlineActions.test.tsx`
  - `npm test`
  - `npm run build`
  - `cargo test` (if Rust command/DTO logic is added)

### Git Intelligence Summary

Recent commits indicate stable integration points to reuse for this story:
- `9600813` and `2cb0ff3` reinforce `EditorShell` jump orchestration and interaction-state patterns.
- `d724c4d` and `ec8b0b7` show current IPC + backend command extension style (`client.ts` + `commands.rs` + typed DTOs).
- `d4cfe22` demonstrates low-noise overlay behavior and viewport-safe interaction anchoring.

Implementation guidance:
- Keep changes incremental in existing shell/overlay + IPC seams.
- Do not bypass current command-response and test conventions.

### Latest Technical Information

- Delve releases page currently lists `v1.25.2` as latest. Keep runtime activation compatible with current DAP behavior and tolerate debugger/session precondition failures gracefully.
  Source: https://github.com/go-delve/delve/releases
- Tauri v2 release page shows active `2.x` stream (including `@tauri-apps/api` `2.10.1` entries). Keep implementation within existing v2 APIs and avoid custom migration logic.
  Source: https://v2.tauri.app/release/
- gopls documentation specifies installation via `gopls@latest` and describes stable-release docs at `go.dev/gopls`. Keep this story independent of unreleased gopls-specific features.
  Source: https://go.dev/gopls/
- Go race detector command behavior remains `go run -race` (relevant for upcoming Story 4.6; ensure 4.1 activation design does not block that extension path).
  Source: https://go.dev/doc/articles/race_detector

### Project Context Reference

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 4, Story 4.1)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR4, FR5, FR8; AC-FR4/AC-FR5)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (Tauri IPC boundaries, non-blocking runtime integration, module layout)
- UX constraints: `_bmad-output/planning-artifacts/ux-design-specification.md` (editor-first, low-noise overlays, hover/click flow, degraded fallback behavior)
- Global guardrails: `_bmad-output/project-context.md` (strict TS typing, local-only runtime, Rust-owned process control)

### Project Structure Notes

- `EditorShell` already owns the interaction context needed for scoped activation (`activeHint`, `activeHintLine`, file path).
- `InlineActions` already exposes `onDeepTrace`; wiring is missing and should be connected to shell logic.
- Current status bar mode/runtime indicators are present but mode is currently fixed; this story should make mode changes real and controlled.

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- Auto-selected from first backlog story in sprint status: `4-1-deep-trace-activation-scoped`.
- Loaded: `epics.md`, `prd.md`, `architecture.md`, `ux-design-specification.md`, `_bmad-output/project-context.md`, recent implementation stories and commit history.
- Verified current code seams in `EditorShell`, `InlineActions`, status bar, TS IPC client/types, and Rust command DTO layers.
- Collected latest external technical references for Delve, Tauri v2 release stream, gopls stable install guidance, and race-detector command contract.
- Updated sprint tracking from `ready-for-dev` to `in-progress` before implementation.
- Red phase: `npm test -- src/components/editor/EditorShell.inline-actions.test.tsx` (failed: new Deep Trace activation tests).
- Green phase implementation: wired frontend activation flow and added typed IPC contracts in TS and Rust.
- Validation: `npm test -- src/components/editor/EditorShell.inline-actions.test.tsx` passed (11/11).
- Regression validation: `npm test` passed (17 files, 81 tests).
- Rust validation: `cargo test` passed (43/43 in `src-tauri`).
- Build validation: `npm run build` fails on pre-existing TypeScript errors in `src/components/editor/CodeEditor.test.tsx` (unknown `state` property in mock view object at lines 495 and 583).
- Patch validation cycle after review findings:
  - `npm test -- src/components/editor/EditorShell.inline-actions.test.tsx src/components/editor/EditorShell.diagnostics.test.tsx src/components/editor/EditorShell.completions.test.tsx` passed (15/15).
  - `cargo test` passed (46/46 in `src-tauri`).
  - `npm test` passed (17 files, 81 tests).
  - `npm run build` still fails on the same pre-existing TypeScript errors in `src/components/editor/CodeEditor.test.tsx`.

### Completion Notes List

- Created Story 4.1 implementation context with scoped activation boundaries and anti-regression guardrails.
- Aligned tasks with existing architecture boundaries and current repository implementation patterns.
- Included explicit fallback and non-blocking requirements to protect UX/NFR constraints.
- Implemented real Deep Trace activation from inline actions with scoped payload (`workspaceRoot`, `relativePath`, `line`, `column`, `constructKind`, `symbol`).
- Made mode state mutable and switched to `Deep Trace` only on successful activation response.
- Preserved graceful fallback by keeping mode as `Quick Insight` when runtime is unavailable, scope is missing, or activation fails.
- Added typed cross-layer IPC contracts and a new Tauri command `activate_scoped_deep_trace`.
- Added targeted tests for success, failure fallback, and runtime-unavailable no-op activation behavior.
- Fixed race condition by guarding Deep Trace activation responses with request-id + workspace/file staleness checks.
- Added backend workspace/file existence boundary validation for scoped Deep Trace activation requests.
- Replaced extension-based runtime availability with explicit runtime probe (`dlv version`) via typed IPC command.

### File List

- _bmad-output/implementation-artifacts/4-1-deep-trace-activation-scoped.md
- src/components/editor/EditorShell.tsx
- src/components/editor/EditorShell.inline-actions.test.tsx
- src/lib/ipc/types.ts
- src/lib/ipc/client.ts
- src-tauri/src/ui_bridge/types.rs
- src-tauri/src/ui_bridge/commands.rs
- src-tauri/src/lib.rs
- src/components/editor/EditorShell.diagnostics.test.tsx
- src/components/editor/EditorShell.completions.test.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-04-12: Created Story 4.1 context file and set status to `ready-for-dev`.
- 2026-04-12: Implemented Story 4.1 scoped Deep Trace activation flow, added tests, and moved story to `review`.
- 2026-04-12: Addressed code review patch findings (stale async guard, workspace path validation, runtime probe) and returned story to `review`.
- 2026-04-12: Re-ran code review after patch pass; no new actionable findings, story marked `done`.
