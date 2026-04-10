# Story 2.4: Density Guard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want the UI to cap the number of visible hints,
so that overlays never overwhelm code readability.

## Acceptance Criteria

1. **Given** many detected constructs in a viewport  
   **When** hints are shown  
   **Then** only a capped number are rendered  
   **And** excess hints are suppressed without flicker

## Tasks / Subtasks

- [x] Task 1: Implement viewport-aware density guard selection (AC: #1)
  - [x] Add a dedicated density-guard utility in `src/features/concurrency/signalDensity.ts`
  - [x] Select visible candidates from current editor viewport first (do not process whole-file list when avoidable)
  - [x] Return deterministic ordering so hints do not reshuffle frame-to-frame

- [x] Task 2: Integrate density guard into hover hint pipeline (AC: #1)
  - [x] Wire density guard into `useHoverHint` so only capped constructs can activate underlines/hints
  - [x] Keep existing workspace stale-response protection intact (`workspacePathRef` + `startingPath`)
  - [x] Keep behavior scoped to active file only

- [x] Task 3: Define cap and suppression rules for readability (AC: #1)
  - [x] Introduce a named constant for max visible hints per viewport (default 6 unless design token/config already exists)
  - [x] Ensure suppression is silent (no error states) and low-noise
  - [x] Preserve confidence rendering behavior from Story 2.3 for selected hints

- [x] Task 4: Prevent flicker and interaction jitter (AC: #1)
  - [x] Stabilize selected hint set while pointer remains in same visible range unless source data changes
  - [x] Avoid unnecessary class add/remove churn in `CodeEditor` line decoration path
  - [x] Verify hover in/out and scroll interactions do not produce rapid hint popping

- [x] Task 5: Add targeted tests for cap and stability (AC: #1)
  - [x] Add unit tests for density guard utility (cap enforcement + deterministic ordering)
  - [x] Add hook/component tests to verify suppressed hints are not rendered
  - [x] Add regression test covering stable behavior across repeated mouse movement in same viewport

### Review Findings

- [x] [Review][Patch] Viewport upper bound includes potentially off-screen line [src/components/editor/CodeEditor.tsx:47] - resolved

## Dev Notes

### Developer Context (Read First)

- Stories 2.1-2.3 already established the pipeline: static construct detection -> hover targeting -> predicted underline + confidence badge.
- Story 2.4 must add suppression logic without regressing Story 2.2 timing behavior or Story 2.3 confidence labeling.
- This story is frontend-focused and should not require new Rust/Tauri IPC endpoints.

### Technical Requirements

- Density guard must apply to **visible viewport context**, not global file counts.
- Cap must be deterministic and stable to prevent visual churn.
- Suppression must be graceful: no flicker, no error banners, no layout jumps.
- Active-file-only analysis remains unchanged.

### Architecture Compliance

- Keep logic in frontend modules:
  - `src/features/concurrency/`
  - `src/hooks/`
  - `src/components/editor/`
  - `src/components/overlays/`
- Do not add frontend shell/process execution.
- Keep typed contracts untouched (`src/lib/ipc/types.ts`).
- Follow editor-first low-noise UX principles from PRD/UX docs.

### Library / Framework Requirements

- React 18 + TypeScript strict mode.
- CodeMirror 6 for editor rendering; density logic must respect viewport behavior.
- Tauri v2 app shell remains unchanged for this story.

### File Structure Requirements

- Primary expected files:
  - `src/features/concurrency/signalDensity.ts` (new)
  - `src/features/concurrency/signalDensity.test.ts` (new)
  - `src/hooks/useHoverHint.ts` (integration point)
  - `src/components/editor/CodeEditor.tsx` (only if viewport metadata hookup is required)
  - `src/components/editor/CodeEditor.test.tsx` (regression assertions as needed)
- Avoid introducing global stores unless strictly required for cross-component state.

### Testing Requirements

- Validate cap behavior when viewport has more candidate constructs than limit.
- Validate deterministic selection ordering for same input.
- Validate suppressed constructs do not produce active hints/underline classes.
- Validate no flicker-like churn under repeated `mouseMove` within same line/viewport.
- Run:
  - `npm test -- src/features/concurrency/signalDensity.test.ts src/components/editor/CodeEditor.test.tsx`
  - `npm test`
  - `npm run build`

### Previous Story Intelligence (Story 2.3)

- Confidence tokenization and label display are already implemented in `HintUnderline`; density guard must preserve this behavior for selected hints.
- `CodeEditor` currently applies a single underline class via `hintLine`; this creates a natural low-noise path for capping by selecting eligible hints before line activation.
- Existing tests emphasize hover mapping and underline add/remove behavior; extend these patterns rather than creating disconnected test scaffolds.

### Git Intelligence Summary

- Recent work (`63107f5`, `be1ea53`) stabilized confidence label + token behavior; avoid regressions in overlay rendering.
- Prior hover logic (`f093a4b`) established active line mapping and cleanup semantics that should remain stable.
- Current codebase has no `signalDensity.ts`; this story introduces it as the dedicated guardrail module.

### Latest Technical Information

- CodeMirror 6 renders by viewport and exposes visible-range concepts; density calculations should operate on visible content for responsiveness.  
  Source: https://codemirror.net/docs/guide/
- CodeMirror decoration guidance emphasizes update-time decoration sets and viewport-aware strategies to avoid unnecessary work.  
  Source: https://codemirror.net/docs/ref/
- Tauri v2 release index currently reports `tauri v2.10.3`; no framework migration is needed for this story.  
  Source: https://v2.tauri.app/release/
- React 18 automatic batching remains relevant for reducing render churn during rapid hover events.  
  Source: https://react.dev/blog/2022/03/08/react-18-upgrade-guide

### Project Context Reference

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.4)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR2, FR7; AC-FR2)
- UX constraints: `_bmad-output/planning-artifacts/ux-design-specification.md` (low-noise overlays, density guard, hover responsiveness)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (frontend boundaries, performance, module structure)
- Global implementation rules: `_bmad-output/project-context.md`
- Prior story context: `_bmad-output/implementation-artifacts/2-3-confidence-labels-styling-tokens.md`

### Project Structure Notes

- Current implementation already centralizes active hint line in `useHoverHint` + `CodeEditor`; density guard should be injected before `hintLine` derivation.
- Keep suppression logic in feature/hook layer rather than embedding policy in visual component markup.
- Preserve current `PREDICTED_HINT_UNDERLINE_CLASS` usage pattern to avoid style drift.

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- Story selected automatically from first backlog entry in `sprint-status.yaml`: `2-4-density-guard`.
- Loaded artifacts: `epics.md`, `prd.md`, `architecture.md`, `ux-design-specification.md`, `_bmad-output/project-context.md`, and previous story `2-3-confidence-labels-styling-tokens.md`.
- Reviewed current implementation files (`CodeEditor`, `EditorShell`, `HintUnderline`, `useLensSignals`, `lensTypes`) to align tasks with existing architecture.
- Reviewed recent git history to capture established patterns and regression risks.
- Verified latest technical references for CodeMirror viewport/decorations, Tauri v2 release line, and React 18 batching behavior.
- 2026-04-10: Story context created and sprint status updated to `ready-for-dev`.
- 2026-04-10: Updated sprint status to `in-progress` and implemented density guard using viewport-aware construct selection.
- 2026-04-10: Added `signalDensity` utility and integrated visible-range filtering + cap enforcement in `useHoverHint`.
- 2026-04-10: Added viewport range emission from `CodeEditor` and wired it through `EditorShell`.
- 2026-04-10: Added/updated tests for density cap, deterministic ordering, and viewport range stability.
- 2026-04-10: `npm test -- src/features/concurrency/signalDensity.test.ts src/hooks/useHoverHint.test.tsx src/components/editor/CodeEditor.test.tsx` passed (8 tests).
- 2026-04-10: `npm test` passed (19 tests).
- 2026-04-10: `npm run build` passed (`tsc && vite build`).

### Completion Notes List

- Created comprehensive Story 2.4 implementation guide focused on viewport-capped hint rendering and suppression stability.
- Added concrete guardrails to avoid flicker/regressions in hover and underline behavior.
- Kept implementation scope aligned with existing frontend architecture and typed IPC boundaries.
- Implemented `MAX_VISIBLE_HINTS_PER_VIEWPORT` density cap with deterministic predicted-construct selection.
- Applied density guard inside `useHoverHint` so suppressed lines do not activate hint overlays.
- Added viewport range tracking in `CodeEditor` with change-only emissions to reduce render churn.
- Connected viewport state in `EditorShell` to ensure hint suppression is based on visible lines.
- Added targeted regression tests and resolved pre-existing type mismatch in `HintUnderline.test.tsx` to keep build green.

### File List

- _bmad-output/implementation-artifacts/2-4-density-guard.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/features/concurrency/signalDensity.ts
- src/features/concurrency/signalDensity.test.ts
- src/hooks/useHoverHint.ts
- src/hooks/useHoverHint.test.tsx
- src/components/editor/CodeEditor.tsx
- src/components/editor/CodeEditor.test.tsx
- src/components/editor/EditorShell.tsx
- src/components/overlays/HintUnderline.test.tsx

## Change Log

- 2026-04-10: Created Story 2.4 context file and updated sprint status to `ready-for-dev`.
- 2026-04-10: Implemented Story 2.4 density guard, added viewport-aware suppression tests, and moved story to `review`.
