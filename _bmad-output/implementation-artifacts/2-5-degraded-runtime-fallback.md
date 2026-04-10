# Story 2.5: Degraded Runtime Fallback

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want static hints to remain available when runtime sampling fails,
so that the editor remains useful even without Deep Trace.

## Acceptance Criteria

1. **Given** runtime sampling is unavailable or fails  
   **When** I hover a concurrency line  
   **Then** static predicted hints still appear  
   **And** no UI errors are shown

## Tasks / Subtasks

- [x] Task 1: Model runtime-unavailable fallback state in the lens flow (AC: #1)
  - [x] Add or reuse an explicit runtime status source (`available` or `unavailable`) that can be read by hint rendering flow
  - [x] Keep fallback state local-first and non-blocking (no retries that freeze interactions)
  - [x] Ensure active-file-only scope remains unchanged

- [x] Task 2: Keep predicted hints active while runtime is unavailable (AC: #1)
  - [x] Preserve hover-to-hint behavior in `useHoverHint` for predicted constructs when runtime is `unavailable`
  - [x] Ensure density guard behavior from Story 2.4 still applies in degraded mode
  - [x] Keep confidence label as `Predicted` for fallback hints

- [x] Task 3: Prevent runtime failures from surfacing UI errors (AC: #1)
  - [x] Guard runtime-path failures so they do not render error banners/toasts in editor hint flow
  - [x] Ensure runtime disconnect/failure does not clear valid static analysis results
  - [x] Maintain graceful soft-fail behavior (`no signal` preferred to wrong signal)

- [x] Task 4: Reflect fallback trust state in status bar and interaction copy (AC: #1)
  - [x] Confirm status bar continues to show runtime availability accurately
  - [x] Keep copy low-noise (informative, not alarming)
  - [x] Ensure mode/runtime indicators remain consistent during failures

- [x] Task 5: Add regression tests for degraded fallback behavior (AC: #1)
  - [x] Add hook tests showing hover hints still appear when runtime is unavailable
  - [x] Add tests confirming no UI error surface is triggered in degraded mode
  - [x] Add tests confirming confidence label remains `Predicted` during fallback

### Review Findings

- [x] [Review][Patch] Preserve no-signal guarantee on analysis failure instead of reusing previous-file constructs [src/features/concurrency/useLensSignals.ts:59] - resolved

## Dev Notes

### Developer Context (Read First)

- Story 2.4 already introduced viewport-based density guard and stable predicted hint selection; Story 2.5 must preserve those guarantees in degraded runtime state.
- Current shell state already includes runtime availability and defaults to unavailable; this story formalizes fallback semantics so static hints remain trustworthy when runtime signal path fails.
- Scope is primarily frontend behavior and resilience handling; avoid introducing new backend/runtime protocols unless required by an uncovered gap.

### Technical Requirements

- Degraded mode must still satisfy hover responsiveness targets and keep editor interactions smooth.
- Static predicted hints must continue rendering from existing detection results even when runtime is unavailable/fails.
- No UI errors should be shown for runtime unavailability in the Quick Insight hover path.
- Confidence semantics must remain explicit and truthful (`Predicted` during fallback).

### Architecture Compliance

- Respect module boundaries:
  - Frontend signal flow in `src/features/concurrency` and `src/hooks`
  - Editor/status shell behavior in `src/components/editor` and `src/components/statusbar`
  - Typed contracts in `src/lib/ipc`
- Do not add frontend shell/process execution.
- Keep local-only behavior and graceful fallback guarantees from PRD/architecture.

### Library / Framework Requirements

- React 18 + TypeScript strict mode.
- CodeMirror 6 viewport-aware behavior should remain unchanged while fallback state is active.
- Tauri v2 app shell remains unchanged for this story.
- Delve DAP remains best-effort: UI must tolerate absence/failure without breaking static hint flow.

### File Structure Requirements

- Expected implementation touchpoints:
  - `src/components/editor/EditorShell.tsx`
  - `src/components/statusbar/StatusBar.tsx`
  - `src/hooks/useHoverHint.ts`
  - `src/features/concurrency/useLensSignals.ts`
  - `src/features/concurrency/lensTypes.ts` (only if type-level fallback metadata is needed)
  - Corresponding test files in `src/hooks/` and `src/components/`
- Keep fallback policy in hook/feature logic; keep visual components focused on rendering.

### Testing Requirements

- Validate degraded runtime does not block predicted hover hint rendering.
- Validate runtime unavailable/failure does not create UI error surfaces in the editor hint path.
- Validate predicted confidence label remains visible and unchanged in fallback mode.
- Validate density guard still caps hints in degraded mode.
- Run:
  - `npm test -- src/hooks/useHoverHint.test.tsx src/components/statusbar/StatusBar.test.tsx`
  - `npm test`
  - `npm run build`

### Previous Story Intelligence (Story 2.4)

- Story 2.4 already stabilized viewport hint selection and deterministic capping; reuse `signalDensity` and avoid duplicating filtering logic.
- Hover hint behavior is currently derived from predicted constructs; fallback should preserve that model rather than branching to a separate rendering path.
- Workspace stale-response protection (`workspacePathRef` + `startingPath`) must be retained to avoid cross-workspace state leaks.

### Git Intelligence Summary

- Recent commits (`971f6a3`, `7d1ae9b`, `f093a4b`) establish the current sequence: hover hint behavior -> confidence labels -> density guard.
- Story 2.5 should be a resilience layer on top of this sequence, not a rewrite of hint selection logic.
- Preserve existing low-noise UX and avoid introducing persistent fallback UI that competes with code focus.

### Latest Technical Information

- Delve latest release shown by GitHub is `v1.25.2`, with multiple DAP stability fixes; runtime clients should treat DAP interruptions as recoverable and keep static fallback active.  
  Source: https://github.com/go-delve/delve/releases
- `gopls` docs state the site tracks the most recent release and follows regular minor/patch cadence; integration should target latest stable behavior and avoid pinning deprecated assumptions.  
  Source: https://go.dev/gopls/
- Tauri v2 release pages remain active and evolving; this story should not require framework migration, only resilient UI behavior around runtime availability signals.  
  Source: https://v2.tauri.app/release/

### Project Context Reference

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.5)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR2, FR5, FR7; AC-FR2, AC-FR5)
- UX constraints: `_bmad-output/planning-artifacts/ux-design-specification.md` (degraded states, low-noise trust, confidence labels)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (frontend boundaries, local-only resilience, IPC patterns)
- Global implementation rules: `_bmad-output/project-context.md`
- Prior story context: `_bmad-output/implementation-artifacts/2-4-density-guard.md`

### Project Structure Notes

- `EditorShell` already owns runtime availability state and passes it to `StatusBar`; this is the primary integration point for degraded-state signaling.
- `useHoverHint` currently depends on predicted construct selection and should remain the central source for fallback hint activation.
- `useLensSignals` currently soft-fails analysis errors; preserve this resilience pattern while ensuring UI remains useful and non-alarming.

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- Story selected automatically from first backlog entry in `sprint-status.yaml`: `2-5-degraded-runtime-fallback`.
- Loaded artifacts: `epics.md`, `prd.md`, `architecture.md`, `ux-design-specification.md`, `_bmad-output/project-context.md`, and previous story `2-4-density-guard.md`.
- Reviewed current implementation touchpoints: `EditorShell`, `StatusBar`, `useHoverHint`, `useLensSignals`, and shared IPC/lens types.
- Reviewed recent git history for established Story 2 implementation sequence and regression risks.
- Verified latest technical references for Delve releases, gopls release policy/docs, and Tauri v2 release stream.
- 2026-04-10: Story status moved to `in-progress` in `sprint-status.yaml`.
- 2026-04-10: Added red-phase tests for degraded runtime fallback behavior in `useHoverHint` and `useLensSignals`.
- 2026-04-10: Updated `useHoverHint` to consume explicit `runtimeAvailability` from shell state.
- 2026-04-10: Updated `useLensSignals` to preserve last successful static constructs on failed analysis responses.
- 2026-04-10: Added `StatusBar` tests validating runtime availability copy and low-noise fallback messaging.
- 2026-04-10: `npm test -- src/hooks/useHoverHint.test.tsx src/features/concurrency/useLensSignals.test.tsx src/components/statusbar/StatusBar.test.tsx` passed (9 tests).
- 2026-04-10: `npm test` passed (23 tests).
- 2026-04-10: `npm run build` passed (`tsc && vite build`).

### Completion Notes List

- Created comprehensive Story 2.5 implementation guide focused on graceful degraded runtime behavior.
- Added concrete guardrails to preserve predicted hint visibility and prevent runtime-failure UI noise.
- Aligned tasks to existing module boundaries and current Story 2 code patterns.
- Implemented degraded-runtime fallback contract by wiring explicit runtime availability into the hover hint pipeline.
- Preserved static hint continuity by preventing failed analyses from clearing the last successful constructs.
- Added regression tests for fallback behavior in hook-level and status bar UI-level coverage.
- Verified no regressions via full test suite and production build.

### File List

- _bmad-output/implementation-artifacts/2-5-degraded-runtime-fallback.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/components/editor/EditorShell.tsx
- src/components/statusbar/StatusBar.test.tsx
- src/features/concurrency/useLensSignals.test.tsx
- src/features/concurrency/useLensSignals.ts
- src/hooks/useHoverHint.test.tsx
- src/hooks/useHoverHint.ts

## Change Log

- 2026-04-10: Created Story 2.5 context file and updated sprint status to `ready-for-dev`.
- 2026-04-10: Implemented Story 2.5 degraded runtime fallback and moved story status to `review`.
- 2026-04-10: Resolved code-review patch finding and moved story status to `done`.
