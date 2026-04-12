# Story 3.5: Jump from Summary Panel Item

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want to jump from a summary panel item to code,
so that navigation stays fast even when using the panel.

## Acceptance Criteria

1. **Given** the right summary panel is open
   **When** I click a listed item
   **Then** the editor jumps to the corresponding line
   **And** the panel remains optional and non-dominant

## Tasks / Subtasks

- [x] Task 1: Build clickable summary list items from active-file lens data (AC: #1)
  - [x] Extend `SummaryPeek` to accept typed items (line, label, confidence, optional symbol) and render a text-first list.
  - [x] Ensure list entries map to active-file lines only (no cross-file navigation).
  - [x] Keep empty-state fallback ("No signals yet") when no listable items exist.

- [x] Task 2: Wire summary item click to existing editor jump mechanism (AC: #1)
  - [x] Add `onJumpToLine` callback prop from `EditorShell` to `SummaryPeek`.
  - [x] Reuse `requestJump` / `jumpRequest` flow in `EditorShell` so summary-click jump behavior matches existing inline jump behavior.
  - [x] Preserve editor focus after jump (must remain in editor interaction model).

- [x] Task 3: Preserve optional, non-dominant panel behavior (AC: #1)
  - [x] Keep panel collapsible via existing status bar toggle and `Close` button.
  - [x] Maintain current panel width constraints (`w-[260px] max-w-[320px]`) and avoid introducing persistent dashboard behavior.
  - [x] Keep panel content text-first and low-noise (no charts, no heavy visualization).

- [x] Task 4: Add regression tests for summary-to-editor jump (AC: #1)
  - [x] Add/extend tests for `SummaryPeek` item rendering and click dispatch.
  - [x] Add integration-style test in `EditorShell` suite to verify summary item click issues a jump request with the expected line.
  - [x] Confirm no regression to existing jump behavior (inline actions and modifier-click).

### Review Findings

- [x] [Review][Patch] Unintended sprint status mutation for Story 3.4 [_bmad-output/implementation-artifacts/sprint-status.yaml:59]

## Dev Notes

### Developer Context (Read First)

- Story 3.5 extends Epic 3 navigation by making the optional summary panel a second entry point into the same jump pipeline already used for inline actions.
- The implementation should reuse existing counterpart/jump logic instead of creating a parallel navigation mechanism.
- Scope remains single-file, editor-first, and low-noise.

### Technical Requirements

- Reuse existing jump state and dispatch primitives in `EditorShell` (`requestJump`, `jumpRequest`, `CodeEditor` jump handling).
- Summary data should derive from current active-file lens context (`detectedConstructs` and/or `counterpartMappings`) already available in `EditorShell`.
- Keep jump deterministic and bounded:
  - ignore invalid lines (`< 1`)
  - ignore lines outside current document bounds
- Keep behavior resilient when no active file or no signals are available.

### Architecture Compliance

- Frontend-only story; no new Rust/Tauri commands expected.
- Respect module boundaries:
  - UI composition and interaction in `src/components/*`
  - concurrency-derived data shaping in `src/features/concurrency/*` (if helper extraction is needed)
- Keep IPC contracts unchanged unless strictly necessary.

### Library / Framework Requirements

- React 18 functional components with strict TypeScript typing (no `any`).
- Tailwind styling aligned to existing Catppuccin Mocha tokens.
- Preserve current interaction semantics of `CodeEditor` jump behavior.

### File Structure Requirements

- Expected primary touchpoints:
  - `src/components/panels/SummaryPeek.tsx`
  - `src/components/editor/EditorShell.tsx`
  - `src/components/editor/EditorShell.test.tsx` and/or `src/components/editor/EditorShell.inline-actions.test.tsx`
  - Add `src/components/panels/SummaryPeek.test.tsx` if panel tests are not present
- Keep summary-panel logic inside panel/editor components; do not introduce unrelated global state.

### Testing Requirements

- Validate summary list rendering with and without items.
- Validate click-to-jump dispatch from summary item to editor jump request.
- Validate panel remains optional/collapsible while navigation works.
- Keep existing interaction tests green (inline jump, modifier-click jump, hover interaction behavior).

### Previous Story Intelligence

- Story 3.4 added `TraceBubble` and completed review follow-ups around viewport guard, type safety, and coordinate fallback consistency.
- Carry forward those standards here:
  - prefer typed mappings/constants over loose string indexing
  - avoid hardcoded geometry assumptions that break on viewport edge cases
  - maintain subtle, non-blocking overlay/panel behavior

### Git Intelligence Summary

Recent commits show repeated touchpoints and stable patterns for this story:
- `d724c4d` touched `EditorShell`, `CodeEditor`, and typed IPC integrations for diagnostics.
- `3658495` reinforced panel + status bar integration patterns (`BottomPanel`, `StatusBar`, `EditorShell`).
- `d4cfe22` and `97907b6` established the Epic 3 approach: isolate visual/navigation logic in frontend components, add focused tests, and keep interactions lightweight.

Implementation guidance:
- Prefer incremental changes in `EditorShell` + panel components.
- Reuse existing jump pipeline and test style from Epic 3 stories.

### Project Context Reference

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 3, Story 3.5)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR3, FR8; AC-FR3/AC-FR8)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (editor-first structure, typed IPC boundaries)
- UX constraints: `_bmad-output/planning-artifacts/ux-design-specification.md` (optional summary panel, low-noise text-first UI, fast navigation)
- Global guardrails: `_bmad-output/project-context.md` (strict TS typing, frontend/backend boundary, responsiveness)

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- Story selected from user input: `3-5`.
- Story key resolved from sprint tracking: `3-5-jump-from-summary-panel-item`.
- Loaded artifacts: `epics.md`, `prd.md`, `architecture.md`, `ux-design-specification.md`, `project-context.md`, previous story `3-4`.
- Git intelligence derived from last 5 commits.
- Verified implementation behavior in `SummaryPeek`, `EditorShell`, and `CodeEditor` against AC #1.
- Validation executed: `npm test` (16 files, 73 tests passed) and `npm run build` (TypeScript + Vite build passed).

### Completion Notes List

- Implemented summary list click-to-jump by using typed `SummaryItem` entries and `onJumpToLine` callback wired through `EditorShell` to the existing `requestJump`/`jumpRequest` flow.
- Kept summary panel optional and non-dominant: existing toggle, `Close` action, width guardrails, and text-first presentation remain intact.
- Confirmed focus-preserving jump behavior through existing `CodeEditor` jump handling (`view.focus()` on jump request).
- Added/validated regression coverage for summary panel rendering and summary-click jump integration, while preserving existing inline jump/modifier-click behavior.
- Story status advanced to `review` after validation gates passed.

### File List

- src/components/panels/SummaryPeek.tsx
- src/components/panels/SummaryPeek.test.tsx
- src/components/editor/EditorShell.tsx
- src/components/editor/EditorShell.inline-actions.test.tsx
- src/components/editor/CodeEditor.tsx
- _bmad-output/implementation-artifacts/3-5-jump-from-summary-panel-item.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-04-12: Generated Story 3.5 context document and marked as ready-for-dev.
- 2026-04-12: Completed Story 3.5 implementation and validation; summary panel items now jump via existing editor jump pipeline and story moved to review.
