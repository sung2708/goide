# Story 3.4: Trace Bubble (Static Details)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want a compact trace bubble with confidence labels,
so that I can understand the relationship without noise.

## Acceptance Criteria

1. **Given** a hover on a mapped operation (Epic 3)
   **When** details are shown
   **Then** a compact bubble appears with confidence label (Predicted/Likely/Confirmed)
   **And** it remains text-first and low-noise (Catppuccin Mocha tokens)
   **And** it clears immediately when interaction ends (within 16ms)

## Tasks / Subtasks

- [x] Task 1: Create TraceBubble component (AC: #1)
  - [x] Implement `TraceBubble.tsx` in `src/components/overlays/`
  - [x] Add unit tests in `src/components/overlays/TraceBubble.test.tsx`
  - [x] Support `confidence` and `label` (e.g., "Channel Send") props

- [x] Task 2: Implement styling for confidence levels (AC: #1)
  - [x] Use `var(--goide-signal-predicted)`, `var(--goide-signal-likely)`, and `var(--goide-signal-confirmed)`
  - [x] Ensure compact, single-line layout (4px border radius, text-10px)

- [x] Task 3: Integrate into EditorShell (AC: #1)
  - [x] Render `TraceBubble` within the concurrency lens layer
  - [x] Position it relative to `interactionAnchor` (coordinate with `InlineActions`)
  - [x] Gate rendering with `isInlineActionsVisible`

- [x] Task 4: Viewport & Layout Handling (AC: #1)
  - [x] Use `interactionAnchor` to avoid overlapping the `InlineActions` if possible (e.g., place it side-by-side or stacked)
  - [x] Ensure the bubble disappears immediately on hover-out

### Review Follow-ups (AI)
- [x] [AI-Review] Implement viewport guard for TraceBubble (Severity: High)
- [x] [AI-Review] Add type safety to KIND_LABELS mapping (Severity: Medium)
- [x] [AI-Review] Unify coordinate fallback handling (Severity: Low)

## Dev Notes

### Goal
Story 3.4 introduces the contextual "explanation" layer of the Concurrency Lens. While `HintUnderline` provides global confidence, `TraceBubble` provides local, operation-specific context.

### Constraints
- **Lightweight**: Use minimal DOM objects.
- **Low Noise**: Strictly Catppuccin Mocha palette. No heavy borders or high-opacity backgrounds.
- **Interaction**: Must not block mouse events (`pointer-events: none` on container, but the bubble itself should be readable).

### Technical Requirements
- Coordinate extraction is already managed in `EditorShell` via `interactionAnchor`.
- The bubble should display the `kind` from the `activeHint` (e.g., "channel" -> "Channel Operation").
- In Phase 1 (Static), wait-times are not available, so only show the confidence chip and type.

### File Structure Requirements
- `src/components/overlays/TraceBubble.tsx`
- `src/components/overlays/TraceBubble.test.tsx`
- Integration in `src/components/editor/EditorShell.tsx`

### Architecture Compliance
- Frontend only.
- Adhere to the `design-tokens` in `src/styles/global.css`.

### Previous Story Intelligence
- **Story 3.3**: Implemented `ThreadLine` and established the pattern for passing anchors from `CodeEditor` to `EditorShell`.
- **Story 2.3**: Defined signal tokens (predicted/likely/confirmed).
- **InlineActions**: Positioned at `anchorTop`, `anchorLeft`. `TraceBubble` should likely append to this or sit slightly above/below.

### Project Context Reference
- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 3, Story 3.4)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR7, AC-FR7)
- UX constraints: `_bmad-output/planning-artifacts/ux-design-specification.md` (Trace Bubble, small text-first overlays).

## Dev Agent Record

### Agent Model Used

Antigravity (Claude Sonnet 4.6 Thinking)

### Debug Log References

- Story selected: `3-4-trace-bubble-static-details` from sprint-status.yaml.
- Followed red-green-refactor cycle: wrote 8 failing tests, implemented component, all pass.
- KIND_LABELS initially inside render, refactored to module scope after green phase.

### Completion Notes List

- Created `TraceBubble.tsx` with full confidence-tier styling via CSS variables (`--goide-signal-predicted/likely/confirmed`).
- Component is `pointer-events-none`, compact, single-line layout with confidence chip and operation type label.
- Integrated into `EditorShell` positioned above `InlineActions` using `interactionAnchor.top - 28`.
- `KIND_LABELS` extracted to module scope for render performance.
- All 63 tests pass (13 test files), no regressions.

### File List

- src/components/overlays/TraceBubble.tsx
- src/components/overlays/TraceBubble.test.tsx
- src/components/editor/EditorShell.tsx
- _bmad-output/implementation-artifacts/3-4-trace-bubble-static-details.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Senior Developer Review (AI)

**Outcome:** Approve with minor changes (Resolved)
**Date:** 2026-04-11

### Action Items
- [x] Fix potential viewport clipping when hovered line is at the top of the editor.
- [x] Improve type safety for KIND_LABELS mapping in EditorShell.
- [x] Ensure coordinate fallback logic is consistent across overlay components.

## Change Log

- 2026-04-11: Story 3.4 created.
- 2026-04-11: Implemented TraceBubble overlay with confidence chips and EditorShell integration. 63/63 tests passing. Story ready for review.
- 2026-04-11: Addressed code review findings (viewport guard, type safety). 64/64 tests passing.
