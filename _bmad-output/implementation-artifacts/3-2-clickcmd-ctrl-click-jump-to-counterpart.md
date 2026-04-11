# Story 3.2: Click/Cmd-Ctrl-Click Jump to Counterpart

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want to click or Cmd/Ctrl-click to jump to the counterpart operation,
so that I can follow causal flow instantly.

## Acceptance Criteria

1. **Given** a mapped counterpart pair  
   **When** I click (or Cmd/Ctrl-click) the hint  
   **Then** the editor jumps to the corresponding line  
   **And** focus remains in the editor

## Tasks / Subtasks

- [x] Task 1: Implement jump-to-counterpart action wiring in editor shell (AC: #1)
  - [x] Add a deterministic resolver from current hint context (`activeHintLine`, symbol, and mappings) to one jump target line
  - [x] Wire `InlineActions` `onJump` callback from `EditorShell` so the existing Jump button performs real navigation
  - [x] Keep behavior no-op and non-disruptive when no mapping exists

- [x] Task 2: Implement Cmd/Ctrl-click direct jump from editor surface (AC: #1)
  - [x] Extend `CodeEditor` interaction API to emit modifier-click intent (metaKey on macOS, ctrlKey on Windows/Linux)
  - [x] Route modifier-click through `EditorShell` jump resolver so button click and modifier-click share one target-selection path
  - [x] Prevent accidental jumps on plain click-only selection flow

- [x] Task 3: Ensure editor-state and focus correctness after jump (AC: #1)
  - [x] Update CodeMirror selection to counterpart line and scroll into view with stable viewport behavior
  - [x] Preserve editor focus after jump and avoid focus theft to overlay/button containers
  - [x] Keep current hover/selection/inline-actions behavior coherent after jump (no stale anchor or broken hint state)

- [x] Task 4: Maintain architectural and UX guardrails (AC: #1)
  - [x] Keep all jump logic in frontend editor/concurrency modules; do not add Rust/Tauri IPC for same-file jump
  - [x] Preserve editor-first, low-noise interaction model and under-16ms interaction responsiveness
  - [x] Respect trust rule: jump only when mapping is explicit and unambiguous

- [x] Task 5: Add regression tests for click and modifier-click jump flows (AC: #1)
  - [x] Add tests that validate Jump button triggers same-file counterpart navigation only when mapping exists
  - [x] Add tests for Cmd/Ctrl-click parity and ensure plain click does not auto-jump
  - [x] Add tests for focus retention and stable behavior after repeated jumps/context changes

## Dev Notes

### Developer Context (Read First)

- Story 3.2 is the first executable navigation behavior in Epic 3 and must build directly on Story 3.1 mapping output (`counterpartMappings`), not on heuristics.
- Current UI already exposes a Jump button state (`hasCounterpart`) but does not navigate yet; this story closes that gap with real same-file jump behavior.
- Scope is same-file jump only. Do not include cross-file navigation, causal-thread rendering, or trace-bubble detail expansion (covered by Stories 3.3 and 3.4).

### Technical Requirements

- Use `counterpartMappings` as the single source of truth for jump target eligibility.
- Build one deterministic mapping lookup path reused by both triggers:
  - Inline Jump button
  - Cmd/Ctrl-click direct action
- Keep jump bounded to active file and valid line numbers in current document.
- If mapping cannot be resolved, fail silently (no crash, no modal error).

### Architecture Compliance

- Respect frontend-only responsibility for editor navigation:
  - `src/components/editor/*` for interaction orchestration
  - `src/features/concurrency/*` for mapping/query logic
- Do not add new Tauri commands or Rust integration for Story 3.2; no backend dependency required for same-file cursor jump.
- Preserve typed boundaries and avoid leaking UI-only state into IPC contracts.

### Library / Framework Requirements

- Keep CodeMirror 6 as navigation executor (selection + viewport effects) rather than custom DOM scrolling.
- Keep React/TypeScript strict typing for interaction callbacks and jump payloads.
- Preserve Tailwind visual constraints (no new persistent overlays or panel controls).

### File Structure Requirements

- Primary expected touchpoints:
  - `src/components/editor/EditorShell.tsx`
  - `src/components/editor/CodeEditor.tsx`
  - `src/components/editor/EditorShell.inline-actions.test.tsx`
  - `src/components/editor/CodeEditor.test.tsx`
  - `src/components/overlays/InlineActions.tsx` (only if callback typing/UX affordance needs adjustment)
  - `src/features/concurrency/lensTypes.ts` (only if helper typing needed)
  - `src/features/concurrency/counterpartMapping.ts` (optional helper extraction only; avoid broad refactor)
- Avoid touching Rust files (`src-tauri/*`) unless a hard blocker is found.

### Testing Requirements

- Positive path:
  - Jump button on mapped line moves selection to counterpart line.
  - Cmd/Ctrl-click on mapped hint line triggers same target behavior.
- Negative path:
  - Jump stays disabled or no-ops without mapping.
  - Plain click preserves existing selection behavior and does not trigger jump.
  - Non-channel hints do not trigger jump.
- Stability:
  - Repeated jumps do not desync inline-action anchor/hint state.
  - Focus remains in editor after jump.
- Run targeted and baseline checks:
  - `npm test -- src/components/editor/EditorShell.inline-actions.test.tsx src/components/editor/CodeEditor.test.tsx src/features/concurrency/useLensSignals.test.tsx src/hooks/useHoverHint.test.tsx`
  - `npm test`
  - `npm run build`

### Previous Story Intelligence (Story 3.1)

- Story 3.1 established deterministic `counterpartMappings` and replaced symbol heuristics with explicit mapping availability in `EditorShell`.
- Existing tests already verify Jump enablement/disablement by mapping presence; extend those tests to assert real navigation outcomes, not just button state.
- Preserve stale workspace guards (`workspacePathRef` + `startingPath`) and avoid introducing async race conditions in jump behavior.
- Keep confidence/trust principle: if mapping is uncertain or missing, prefer no jump over wrong jump.

### Git Intelligence Summary

Recent implementation sequence emphasizes incremental UI behavior layering with targeted tests:
- `5c95139`: Story 3.1 counterpart mapping and editor wiring
- `b11f071`: inline quick-actions hover behavior (Story 2.6)
- `d62e5f1`: degraded runtime fallback (Story 2.5)
- `971f6a3`: density guard constraints (Story 2.4)
- `7d1ae9b`: confidence labels + token styling (Story 2.3)

For Story 3.2, follow this pattern:
- implement narrow behavior slice,
- keep UI fast and stable,
- prove behavior with focused tests before broader regression checks.

### Latest Technical Information

- CodeMirror 6 `EditorView.focus()` and `EditorView.scrollIntoView(...)` APIs support explicit focus retention and scroll control after programmatic selection updates; use these instead of manual DOM scrolling for jump behavior.  
  Source: https://codemirror.net/docs/ref/
- Current npm listing indicates `@codemirror/view` latest published line includes `6.38.2`; repo currently uses `^6.41.0`, so keep usage aligned with currently installed API surface and avoid version-downgrade assumptions in implementation.  
  Source: https://www.npmjs.com/package/%40codemirror/view
- Current npm listing indicates React `19.1.1`; repo is already on React 19 (`^19.1.0`), so keep implementation in existing functional-component/event-handler model without class-component patterns.  
  Source: https://www.npmjs.com/react
- Tauri crate listing shows latest `2.10.3`; Story 3.2 should remain frontend-local and not expand Tauri command surface for same-file jumps.  
  Source: https://docs.rs/crate/tauri/latest/builds
- Delve latest release page shows `v1.25.2`; this story must not depend on runtime Delve state because acceptance criteria are satisfied by static mapped counterpart navigation.  
  Source: https://github.com/go-delve/delve/releases

### Project Context Reference

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 3, Story 3.2)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR3, FR7, FR8; AC-FR3)
- UX constraints: `_bmad-output/planning-artifacts/ux-design-specification.md` (hover -> explain -> jump loop, <100ms interaction expectation, keyboard parity)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (frontend boundaries, typed contracts, local-only model)
- Global implementation rules: `_bmad-output/project-context.md`
- Previous story context: `_bmad-output/implementation-artifacts/3-1-counterpart-mapping-static.md`

### Project Structure Notes

- `EditorShell` is the correct orchestration point for deciding whether a jump should execute and for sharing one resolver across all jump triggers.
- `CodeEditor` currently emits hover/selection anchors; extend it minimally to expose modifier-click jump intent without breaking existing selection behavior.
- Keep jump target lookup deterministic and derived from current hint line + mappings to prevent ambiguous navigation.

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- Story selected automatically from first backlog entry in `sprint-status.yaml`: `3-2-clickcmd-ctrl-click-jump-to-counterpart`.
- Loaded artifacts: `epics.md`, `prd.md`, `architecture.md`, `ux-design-specification.md`, `_bmad-output/project-context.md`.
- Loaded previous story context: `_bmad-output/implementation-artifacts/3-1-counterpart-mapping-static.md`.
- Reviewed current implementation touchpoints: `EditorShell`, `CodeEditor`, `InlineActions`, `useLensSignals`, counterpart mapping tests.
- Reviewed recent commit history to preserve implementation style and testing pattern continuity.
- Verified latest external references relevant to Story 3.2 interaction implementation.
- 2026-04-11: Story status moved to `ready-for-dev` in `sprint-status.yaml`.
- 2026-04-11: Story status moved to `in-progress` in `sprint-status.yaml`.
- 2026-04-11: Added red-phase tests for Jump execution and modifier-click parity in `EditorShell` and `CodeEditor`.
- 2026-04-11: Implemented deterministic counterpart resolver and shared jump request flow in `EditorShell`.
- 2026-04-11: Implemented CodeMirror jump request handling (`dispatch` + `scrollIntoView` + `focus`) and modifier-click signaling in `CodeEditor`.
- 2026-04-11: `npm test -- src/components/editor/EditorShell.inline-actions.test.tsx src/components/editor/CodeEditor.test.tsx` passed (14 tests).
- 2026-04-11: `npm test -- src/components/editor/EditorShell.inline-actions.test.tsx src/components/editor/CodeEditor.test.tsx src/features/concurrency/useLensSignals.test.tsx src/hooks/useHoverHint.test.tsx` passed (23 tests).
- 2026-04-11: `npm test` passed (47 tests).
- 2026-04-11: `npm run build` passed.
- 2026-04-11: Story status moved to `review` in `sprint-status.yaml`.

### Completion Notes List

- Created comprehensive Story 3.2 implementation guide for click and Cmd/Ctrl-click counterpart jump behavior.
- Defined a deterministic shared jump-resolution strategy for button and modifier-click triggers.
- Added explicit guardrails for focus retention, same-file scope, and no-op safety when mapping is absent.
- Documented concrete file touchpoints and targeted regression test expectations for this story.
- Implemented shared deterministic jump resolution for both inline Jump button and Cmd/Ctrl-click triggers.
- Added `jumpRequest` flow in `CodeEditor` to execute CodeMirror selection changes, viewport centering, and explicit editor focus retention.
- Added modifier-click path in `CodeEditor` that emits line intent without interfering with plain-click selection behavior.
- Added regression coverage for Jump button execution, modifier-click parity, and no-jump plain-click behavior in editor-shell integration tests.
- Updated test mock typing to align with `LensConstruct` union and keep TypeScript build clean.

### File List

- _bmad-output/implementation-artifacts/3-2-clickcmd-ctrl-click-jump-to-counterpart.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/components/editor/CodeEditor.tsx
- src/components/editor/EditorShell.tsx
- src/components/editor/CodeEditor.test.tsx
- src/components/editor/EditorShell.inline-actions.test.tsx

## Change Log

- 2026-04-11: Implemented Story 3.2 counterpart jump behavior (inline Jump and Cmd/Ctrl-click), added regression tests, and marked story as done after successful code review.
