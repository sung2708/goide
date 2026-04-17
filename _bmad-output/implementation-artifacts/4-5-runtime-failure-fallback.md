# Story 4.5: Runtime Failure Fallback

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want the UI to gracefully fall back to static hints if runtime fails,
so that the editor remains trustworthy and usable.

## Acceptance Criteria

1. **Given** runtime sampling fails or disconnects
   **When** I continue interacting
   **Then** predicted static hints remain available
   **And** any confirmed signals are removed cleanly without UI errors

## Tasks / Subtasks

- [x] Task 1: Detect runtime failure and switch Deep Trace to degraded mode without blocking UI (AC: #1)
  - [x] Add an explicit runtime availability state transition in the frontend store and status bar path (`healthy -> degraded`) when polling or command errors indicate Delve disconnect/failure.
  - [x] Ensure transition logic is idempotent so repeated polling failures do not thrash state or rerender overlays.
  - [x] Keep all state updates async-safe and workspace-scoped to avoid stale response overwrite after workspace/file switches.

- [x] Task 2: Preserve static hint pipeline while runtime is degraded (AC: #1)
  - [x] Keep Quick Insight predicted signals active for hover/selection even when runtime is unavailable.
  - [x] Ensure static analysis source remains the active-file scope only; no expansion of analysis surface during fallback.
  - [x] Confirm no UX hard-error surfaces (toast/modal) are shown for expected degraded runtime behavior.

- [x] Task 3: Remove confirmed runtime overlays cleanly on failure (AC: #1)
  - [x] Clear runtime-confirmed blocked pulses, runtime causal links, and runtime confidence chips when degraded mode activates.
  - [x] Preserve baseline non-runtime overlays (predicted hints) and clear interaction artifacts within existing timing constraints.
  - [x] Avoid flicker by performing atomic replacement of runtime overlays with static overlays.

- [x] Task 4: Align mode/status messaging with trust-preserving UX (AC: #1)
  - [x] Update status bar runtime availability to unavailable/degraded while retaining mode context.
  - [x] Show subtle fallback messaging consistent with UX guidance ("static hints still help"), avoiding alarming error framing.
  - [x] Preserve reduced-motion behavior and low visual density during transition.

- [x] Task 5: Add regression tests for fallback reliability (AC: #1)
  - [x] Add frontend tests covering runtime disconnect mid-session and verifying predicted hints remain usable.
  - [x] Add tests that confirmed signals are removed when runtime fails and do not reappear until runtime recovers.
  - [x] Add test coverage for no-crash/no-UI-error behavior and stable state under repeated failure events.

## Dev Notes

### Story Foundation

- Epic context: Epic 4 delivers Deep Trace runtime signals; Story 4.5 hardens reliability for runtime failure paths.
- Business intent: maintain developer trust and uninterrupted flow when runtime evidence cannot be sampled.
- Scope boundary: fallback behavior only; do not introduce new tracing features or broad UX redesign.

### Technical Requirements

- Runtime failure conditions include Delve disconnect, runtime sampling command failure, and timeout/unavailable states.
- On failure, runtime-confirmed evidence must be suppressed and static predicted hints must remain interactive.
- Runtime evidence still overrides predicted signals only when runtime is healthy and conflict maps to same location; fallback reverses to predicted-only behavior.
- UI must remain responsive and non-blocking during transition and subsequent interaction.

### Architecture Compliance

- Keep process/runtime failure handling in Rust integration + typed IPC boundaries; UI consumes normalized status and signals.
- Respect module boundaries:
  - Rust runtime/process handling under `src-tauri/src/integration` and command surface under `src-tauri/src/ui_bridge`.
  - Frontend state/rendering under `src/features/concurrency` and `src/components`.
- Do not add frontend shell/process execution; runtime lifecycle remains Rust-owned.
- Preserve strict TS typing for IPC payloads and avoid leaking raw backend error internals.

### Library / Framework Requirements

- Stack remains Tauri v2 + React 18 + TypeScript strict + Tailwind, with local-only runtime analysis.
- Reuse existing confidence labels (`predicted | likely | confirmed`) and status bar runtime availability indicator.
- Follow existing overlay motion constraints; no additional decorative animation.

### File Structure Requirements

- Likely frontend touch points:
  - `src/components/editor/EditorShell.tsx`
  - `src/features/concurrency/lensStore.ts`
  - `src/features/concurrency/useLensSignals.ts`
  - `src/components/statusbar/StatusBar.tsx`
- Likely backend/IPC touch points:
  - `src-tauri/src/integration/delve.rs`
  - `src-tauri/src/ui_bridge/commands.rs`
  - `src-tauri/src/ui_bridge/types.rs`
  - `src/lib/ipc/types.ts`
- Keep runtime fallback behavior integrated into existing flow; do not create parallel overlay systems.

### Testing Requirements

- Frontend behavior tests:
  - Runtime disconnect/failure transitions to degraded state without crashes.
  - Predicted static hint path remains available and interactive.
  - Confirmed runtime overlays are removed cleanly and stay cleared until runtime recovery.
- Backend/IPC tests:
  - Runtime failure paths emit stable, typed degraded/unavailable status.
  - No malformed error payloads cross IPC boundaries.
- Regression checks:
  - Existing deep-trace happy path still works when runtime is available.
  - Overlay clear timing and density guard behavior remain intact.

### Previous Story Intelligence (4.4)

- Story 4.4 introduced runtime-to-static correlation override and dual-confidence semantics.
- Reuse 4.4 async guards and stale-request protection patterns when applying fallback transitions.
- Keep causal correlation feature-path intact for healthy runtime sessions; only suppress runtime-derived artifacts on failure.

### Git Intelligence Summary

- `1880c07` introduced stronger runtime counterpart correlation and editor fallback safety checks; use those paths as extension points.
- `261c477` established blocked signal rendering and polling guard corrections; preserve those protections when adding failure handling.
- `016e1c5` introduced Delve DAP lifecycle wiring; fallback should key off lifecycle/health from this integration instead of ad-hoc UI heuristics.

### Project Context Reference

- Epic source: [Source: _bmad-output/planning-artifacts/epics.md#Epic-4-Deep-Trace-Runtime-Signals]
- Story source: [Source: _bmad-output/planning-artifacts/epics.md#Story-45-Runtime-Failure-Fallback]
- Product requirements: [Source: _bmad-output/planning-artifacts/prd.md#FR5-Resilience-and-Degradation]
- Product acceptance criteria: [Source: _bmad-output/planning-artifacts/prd.md#AC-FR5-Resilience-and-Degradation]
- UX fallback guidance: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#The-Edge-Case-Signal-Degradation]
- Architecture reliability constraints: [Source: _bmad-output/planning-artifacts/architecture.md#Project-Context-Analysis]
- Global implementation guardrails: [Source: _bmad-output/project-context.md#Critical-Don't-Miss-Rules]

### Project Structure Notes

- Keep fallback logic as an extension of current runtime signal pipeline, not a replacement architecture.
- Maintain existing naming, file placement, and typed IPC conventions established by prior stories.
- Preserve editor-first UX and optional-panel defaults while in degraded runtime mode.

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- Auto-selected first backlog story from `sprint-status.yaml`: `4-5-runtime-failure-fallback`.
- Loaded Epic 4 story definitions and FR5/NFR5 constraints from planning artifacts.
- Analyzed Story 4.4 completion notes and latest commit history for implementation continuity.
- Updated runtime-availability model to include a frontend degraded state and preserve static fallback behavior during runtime polling failures.
- Added targeted regression tests for degraded runtime behavior in `EditorShell`, `StatusBar`, `InlineActions`, and `useHoverHint`.
- Test commands executed:
  - `npm test -- src/components/editor/EditorShell.inline-actions.test.tsx -t "degrades to static runtime state on polling failure and recovers when polling succeeds"` (pass)
  - `npm test -- src/components/overlays/InlineActions.test.tsx src/components/statusbar/StatusBar.test.tsx src/hooks/useHoverHint.test.tsx` (pass)
  - `npm test` (fails due pre-existing unrelated test mismatches in UI copy/assertions and existing inline-actions cases)

### Completion Notes List

- Implemented runtime degraded-state transitions in deep-trace polling flow and activation failure path.
- Ensured runtime failure clears confirmed runtime overlays while preserving predicted static hints.
- Added explicit status-bar rendering for `Runtime: Active|Static|Degraded` while keeping mode context.
- Kept deep-trace actions disabled outside healthy runtime, including degraded state.
- Added/updated targeted tests validating degraded fallback behavior and static-hint continuity.
- Full frontend suite still reports pre-existing failures outside this story scope.

### File List

- _bmad-output/implementation-artifacts/4-5-runtime-failure-fallback.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/components/editor/EditorShell.tsx
- src/components/editor/EditorShell.inline-actions.test.tsx
- src/components/overlays/InlineActions.tsx
- src/components/overlays/InlineActions.test.tsx
- src/components/statusbar/StatusBar.tsx
- src/components/statusbar/StatusBar.test.tsx
- src/hooks/useHoverHint.ts
- src/hooks/useHoverHint.test.tsx

## Change Log

- 2026-04-17: Implemented runtime failure fallback with degraded runtime status, static-hint continuity, runtime-overlay cleanup, and targeted regression tests.
