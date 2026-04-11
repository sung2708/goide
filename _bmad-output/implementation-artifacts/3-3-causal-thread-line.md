# Story 3.3: Causal Thread Line

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want a lightweight causal thread between related operations,
so that I can see the relationship at a glance.

## Acceptance Criteria

1. **Given** a counterpart pair is active  
   **When** I hover or select the line  
   **Then** a thin causal thread renders between the two locations  
   **And** it clears immediately when the interaction ends

## Tasks / Subtasks

- [x] Task 1: Expose coordinate geometry for counterpart lines (AC: #1)
  - [x] Extend editor logic (likely `CodeEditor` or a new hook) to resolve and emit bounding box / coordinates for the counterpart line if it exists.
  - [x] Synchronize source line and counterpart line coordinates into `EditorShell` state so an overlay component can draw a path between them.

- [x] Task 2: Implement ThreadLine overlay component (AC: #1)
  - [x] Create a new SVG overlay component (`ThreadLine.tsx` or similar) positioned completely absolutely over the editor container (pointer-events: none).
  - [x] Use Catppuccin Mocha styling tokens to draw a thin, subtle thread (e.g., cubic bezier curve) between the source point and counterpart point.
  - [x] Adhere to "low noise" visual requirements by ensuring the line opacity or stroke does not obscure text.

- [x] Task 3: Wire interaction logic for immediate rendering/clearing (AC: #1)
  - [x] In `EditorShell`, pass connection points to the overlay only when an active hint has a counterpart AND it is currently hovered or selected.
  - [x] Ensure the thread line hides instantly without flickering (within 16ms) when hover/selection ends or the mouse leaves.

- [x] Task 4: Handle viewport edge cases and performance (AC: #1)
  - [x] Prevent UI freezing by ensuring the coordinate calculation is fast.
  - [x] If the counterpart line is scrolled out of view, ensure the thread line gracefully terminates at the boundary edge, or hides entirely. Use CodeMirror's `viewport` to determine eligibility.

- [x] Task 5: Regression and logic testing (AC: #1)
  - [x] Add tests ensuring the overlay renders safely when valid anchor coords are provided.
  - [x] Verify interaction boundaries (hides upon deselection).

## Dev Notes

### Developer Context (Read First)

- **Goal**: Story 3.3 focuses on visual context. It adds an SVG/DOM thread line between the active line and its counterpart, directly utilizing `counterpartMappings` completed in Story 3.1.
- **Constraints**: 
  - Keep it inline and lightweight. 
  - Do not introduce any persistent panels or heavy DOM objects.
  - The thread line must NOT block mouse events (`pointer-events: none`).

### Technical Requirements

- Use pure `React` SVG elements or a minimal Canvas layer for the thread. SVG is preferred for resolution independence and CSS styling.
- Coordinate extraction MUST come from CodeMirror's reliable `view.coordsAtPos(from)` API (similar to how `InteractionAnchor` was extracted in `CodeEditor.tsx`).
- The overlay logic should handle the edge case where the counterpart line is out of the CodeMirror viewport.

### Architecture Compliance

- Frontend overlay only. Do not add any Tauri backend components or Rust commands for this feature.
- Component structure should remain within `src/components/overlays/`.
- Respect `design-tokens`: prefer subtle colors over vibrant colors for background syntax decoration.

### Library / Framework Requirements

- CodeMirror 6 (`@codemirror/view`). Use `posAtCoords` or `coordsAtPos` for geometry.
- React functional components for the overlay.
- Tailwind CSS for absolute positioning and basic colors.

### File Structure Requirements

- Primary touchpoints expected:
  - `src/components/editor/EditorShell.tsx`
  - `src/components/editor/CodeEditor.tsx` (to emit counterpart coordinates)
  - `src/components/overlays/ThreadLine.tsx` (New)
  - `src/components/overlays/ThreadLine.test.tsx` (New)

### Previous Story Intelligence

- **Story 3.2** established `resolveCounterpartLine` and `hasCounterpart` state in `EditorShell` and proved we can use exact coordinate geometry with CodeMirror viewport. We can use the existing `hasCounterpart` logic to gate rendering of the thread line.

### Git Intelligence Summary

Recent implementation sequences:
- `00e9316` (Story 3.2): Jump navigation
- `5c95139` (Story 3.1): Counterpart mapping state
- `b11f071` (Story 2.6): Hover actions
- `971f6a3` (Story 2.4): Density guards
- `7d1ae9b` (Story 2.3): Confidence labels

For Story 3.3, build on the exact `CodeEditor`/`EditorShell` communication pattern established in 3.1 & 3.2, passing coordinate payloads upstream to render an isolated absolute component.

### Project Context Reference

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 3, Story 3.3)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR3, FR7)
- UX constraints: `_bmad-output/planning-artifacts/ux-design-specification.md` (Causal Thread Line, low-noise overlay layers, stable behavior).

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex) / Gemini 3.1 Pro (High)

### Debug Log References

- Story selected automatically from `sprint-status.yaml`: `3-3-causal-thread-line`.
- Loaded artifacts: epics.md, ux-design-specification.md, architecture.md.
- Context derived from `3-2-clickcmd-ctrl-click-jump-to-counterpart.md`.
- No new web research required as CodeMirror 6 geometry API is already well established in project context.
- Story status set to `ready-for-dev`.

### Completion Notes List

- Implemented pure React SVG ThreadLine component with absolute coordinate anchoring based on CodeMirror view bounds.
- Hooked `EditorView.updateListener` in CodeEditor to dynamically sync source and counterpart anchors smoothly on geometry or viewport scroll events without thrashing the DOM.
- Passed `counterpartAnchor` safely into EditorShell state.
- Component passes all unit tests, rendering visually subtle cubic bezier threads dynamically tracking line anchors.
- Verified test suite and TypeScript build success.

### File List

- src/components/overlays/ThreadLine.tsx
- src/components/overlays/ThreadLine.test.tsx
- src/components/editor/CodeEditor.tsx
- src/components/editor/CodeEditor.test.tsx
- src/components/editor/EditorShell.tsx
- _bmad-output/implementation-artifacts/3-3-causal-thread-line.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-04-11: Generated Story 3.3 context document.
### Review Findings

- [x] [Review][Patch] Hardcoded Layout Offsets [src/components/editor/CodeEditor.tsx]
- [x] [Review][Patch] Hardcoded Theme Colors [src/components/overlays/ThreadLine.tsx]
- [x] [Review][Patch] z-index Verification [src/components/overlays/ThreadLine.tsx]
- [x] [Review][Defer] Sync Logic Performance [src/components/editor/CodeEditor.tsx] — deferred, pre-existing
