# Story 2.6: Inline Quick Actions on Hover

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want inline actions to appear only when I hover or select,
so that the UI stays clean by default.

## Acceptance Criteria

1. **Given** I hover a concurrency line  
   **When** inline actions appear  
   **Then** they are minimal and contextual  
   **And** they disappear immediately on hover out

## Tasks / Subtasks

- [x] Task 1: Add inline quick-action UI surface scoped to active hint context (AC: #1)
  - [x] Create `src/components/overlays/InlineActions.tsx` as a small overlay component near the current hint context
  - [x] Keep actions text-first and compact (no persistent toolbar, no panel-level controls)
  - [x] Ensure actions render only when an active hint/selection context exists

- [x] Task 2: Wire hover + selection interaction state to action visibility (AC: #1)
  - [x] Extend editor shell interaction state to support both hover-driven and keyboard/focus selection-driven action reveal
  - [x] Reuse existing active hint/line state from `useHoverHint` and editor line focus where possible
  - [x] Hide actions immediately on hover out, file switch, and workspace switch

- [x] Task 3: Define contextual action set and boundaries (AC: #1)
  - [x] Provide minimal actions aligned to current roadmap: `Jump` and `Deep Trace` entry points as contextual stubs/wiring targets
  - [x] Disable or soft-hide actions that are not currently available (for example when counterpart mapping is absent)
  - [x] Keep all actions local to the active file and active construct context

- [x] Task 4: Enforce UX/noise/performance constraints (AC: #1)
  - [x] Ensure overlay does not violate density-guard intent or produce persistent visual clutter
  - [x] Preserve hover response budget and interaction smoothness (target under 100ms reveal, under 16ms UI updates)
  - [x] Respect reduced-motion settings and keep transitions functional/minimal

- [x] Task 5: Add regression tests for visibility and dismissal semantics (AC: #1)
  - [x] Add component tests for `InlineActions` rendering and action-state permutations
  - [x] Add editor integration tests to validate show-on-hover and immediate hide-on-hover-out behavior
  - [x] Add keyboard/focus path tests to confirm parity with hover reveal behavior

### Review Findings

- [x] [Review][Patch] Inline actions are not positioned near the active hint context [src/components/overlays/InlineActions.tsx:25] - resolved
- [x] [Review][Patch] Selection-based actions do not clear on editor blur, so intent can persist beyond focus loss [src/components/editor/CodeEditor.tsx:127] - resolved
- [x] [Review][Patch] `Jump` action is never enabled because counterpart availability is not wired from shell state [src/components/editor/EditorShell.tsx:267] - resolved

## Dev Notes

### Developer Context (Read First)

- Story 2.6 is a UX-constrained extension of the existing Quick Insight path, not a new workflow surface.
- Inline actions must remain contextual and ephemeral. Persistent controls would violate editor-first and low-noise requirements.
- Existing hook and editor state already provide active-line and hover context; reuse these paths instead of introducing parallel signal-state pipelines.

### Technical Requirements

- Show inline quick actions only when intent is present (hover/focus selection on an active concurrency hint).
- Hide actions immediately when intent ends (hover out, blur, file change, workspace change).
- Keep actions minimal and contextual; avoid global menus/toolbars for this story.
- Maintain active-file-only scope and existing graceful fallback behavior.

### Architecture Compliance

- Respect frontend boundaries:
  - Overlay components in `src/components/overlays`
  - Concurrency signal logic in `src/features/concurrency`
  - Interaction hooks in `src/hooks`
- Do not add frontend process execution or external calls.
- Keep Tauri IPC typed and minimal; do not widen command surface for this story unless action execution requires it.

### Library / Framework Requirements

- React 18 + TypeScript strict mode for interaction state and overlay composition.
- CodeMirror 6 editor integration should remain the source of hover line context.
- Tauri v2 shell constraints remain unchanged; this is primarily frontend interaction/rendering work.
- gopls and Delve are integration dependencies for broader roadmap actions, but Story 2.6 should keep action rendering robust even when runtime is unavailable.

### File Structure Requirements

- Primary touchpoints:
  - `src/components/editor/EditorShell.tsx`
  - `src/components/editor/CodeEditor.tsx` (only if extra hover/focus callbacks are needed)
  - `src/components/overlays/InlineActions.tsx` (new)
  - `src/components/overlays/HintUnderline.tsx` (if co-locating confidence + actions improves positioning consistency)
  - `src/hooks/useHoverHint.ts`
  - Relevant tests under `src/components/overlays/` and `src/components/editor/`
- Keep business logic out of visual components. Components render from precomputed hint/selection state.

### Testing Requirements

- Validate show/hide semantics:
  - reveal on hover/selection
  - immediate dismissal on hover out/blur
- Validate contextual minimality:
  - no actions without active hint
  - no persistent actions after intent end
- Validate resilience:
  - degraded runtime (`unavailable`) still allows predicted hint context and action gating behavior
- Run:
  - `npm test -- src/components/overlays/InlineActions.test.tsx src/components/editor/EditorShell.test.tsx src/hooks/useHoverHint.test.tsx`
  - `npm test`
  - `npm run build`

### Previous Story Intelligence (Story 2.5)

- `useHoverHint` already consumes `runtimeAvailability` explicitly; keep inline-action visibility dependent on the same stable hint contract.
- `EditorShell` already uses workspace stale-response protection (`workspacePathRef` + `startingPath`); action state must reset with the same workspace/file transitions.
- Degraded runtime path must remain low-noise and non-alarming. Inline actions should not introduce error surfaces when runtime is unavailable.
- Preserve density-guard and active-file-only behavior established in Stories 2.4 and 2.5.

### Git Intelligence Summary

- Recent implementation sequence is stable and incremental:
  - `f093a4b`: hover hint baseline
  - `7d1ae9b`: confidence labels + styling tokens
  - `971f6a3`: viewport density guard + deterministic filtering
  - `d62e5f1`: degraded runtime fallback and resilience
- Story 2.6 should layer contextual actions on top of this sequence without refactoring existing hint selection flow.
- File-level conventions in recent commits indicate editor/hook/overlay co-evolution with targeted tests; follow the same change pattern.

### Latest Technical Information

- Delve releases page currently shows `v1.26.1` as latest (tagged 2026-03-03), including multiple DAP updates; action handlers that depend on runtime should tolerate debugger/session preconditions cleanly.
  Source: https://github.com/go-delve/delve/releases
- gopls release docs currently show `v0.22.0` as forthcoming. Inference: implementations should target latest stable behavior and avoid depending on unpublished/forthcoming gopls features.
  Source: https://go.dev/gopls/release/v0.22.0
- Tauri v2 docs/release stream remains active; keep this story framework-stable (UI behavior only), with no migration assumptions.
  Source: https://v2.tauri.app/release/

### Project Context Reference

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.6)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR2, FR5, FR7; AC-FR2, AC-FR7)
- UX constraints: `_bmad-output/planning-artifacts/ux-design-specification.md` (inline actions on hover/selection, editor-first low-noise behavior, keyboard parity)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (module boundaries, local-only IPC patterns)
- Global implementation rules: `_bmad-output/project-context.md`
- Prior story context: `_bmad-output/implementation-artifacts/2-5-degraded-runtime-fallback.md`

### Project Structure Notes

- `EditorShell` is currently the best orchestration point for active hint, visible range, and overlay mounting.
- `CodeEditor` already emits hover line and viewport range. Add new callbacks only if required for selection/focus parity.
- `HintUnderline` currently handles confidence label rendering; consider colocating inline actions at this overlay layer to avoid duplicate positioning logic.

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- Story selected automatically from first backlog entry in `sprint-status.yaml`: `2-6-inline-quick-actions-on-hover`.
- Loaded artifacts: `epics.md`, `prd.md`, `architecture.md`, `ux-design-specification.md`, `_bmad-output/project-context.md`, previous story `2-5-degraded-runtime-fallback.md`.
- Reviewed current implementation touchpoints: `EditorShell`, `CodeEditor`, `HintUnderline`, `useHoverHint`, and signal-density interactions.
- Reviewed recent git commit sequence to preserve established Story 2 patterns and avoid regressions.
- Verified latest technical references for Delve releases, gopls release docs status, and Tauri v2 release stream.
- 2026-04-10: Story status moved to `ready-for-dev` in `sprint-status.yaml`.
- 2026-04-10: Story status moved to `in-progress` in `sprint-status.yaml`.
- 2026-04-10: Added red-phase tests for inline actions visibility and selection-reveal behavior.
- 2026-04-10: Implemented `InlineActions` overlay with contextual `Jump` and `Deep Trace` actions and disabled-state guardrails.
- 2026-04-10: Extended `CodeEditor` with selected-line callback support for click/keyboard-driven reveal.
- 2026-04-10: Extended `useHoverHint` to support selection-based interaction line fallback.
- 2026-04-10: Wired `EditorShell` to render/hide inline actions from hover and selection state.
- 2026-04-10: `npm test -- src/components/overlays/InlineActions.test.tsx src/components/editor/EditorShell.inline-actions.test.tsx src/components/editor/CodeEditor.test.tsx src/hooks/useHoverHint.test.tsx` passed (14 tests).
- 2026-04-10: `npm test` passed (30 tests).
- 2026-04-10: `npm run build` passed (`tsc && vite build`).
- 2026-04-10: Code-review patch fixes implemented for inline-action anchoring, selection blur dismissal, and counterpart enablement wiring.
- 2026-04-10: `npm test -- src/components/overlays/InlineActions.test.tsx src/components/editor/EditorShell.inline-actions.test.tsx src/components/editor/CodeEditor.test.tsx src/hooks/useHoverHint.test.tsx` passed (15 tests).
- 2026-04-10: `npm test` passed (31 tests).
- 2026-04-10: `npm run build` passed (`tsc && vite build`).

### Completion Notes List

- Created comprehensive Story 2.6 implementation guide focused on contextual, low-noise inline quick actions.
- Added explicit guardrails for hover/selection-only visibility and immediate dismissal semantics.
- Aligned tasks with existing module boundaries and established Story 2 implementation patterns.
- Included regression-test expectations and latest technical context for tooling stability decisions.
- Implemented inline quick actions overlay that appears only when a predicted hint is active via hover or selected line context.
- Added action gating: `Jump` requires counterpart availability, and `Deep Trace` requires runtime availability.
- Preserved low-noise behavior by immediately dismissing hover-driven actions and resetting selection on workspace/file transitions.
- Added focused regression tests for component behavior, editor interaction behavior, and hook selection fallback behavior.
- Verified full suite and build to ensure no regressions.

### File List

- _bmad-output/implementation-artifacts/2-6-inline-quick-actions-on-hover.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/components/overlays/InlineActions.tsx
- src/components/overlays/InlineActions.test.tsx
- src/components/editor/EditorShell.tsx
- src/components/editor/EditorShell.inline-actions.test.tsx
- src/components/editor/CodeEditor.tsx
- src/components/editor/CodeEditor.test.tsx
- src/hooks/useHoverHint.ts
- src/hooks/useHoverHint.test.tsx

## Change Log

- 2026-04-10: Created Story 2.6 context file and updated sprint status to `ready-for-dev`.
- 2026-04-10: Implemented Story 2.6 inline quick actions on hover/selection and moved story to `review`.
- 2026-04-10: Addressed code review findings and moved story to `done`.
