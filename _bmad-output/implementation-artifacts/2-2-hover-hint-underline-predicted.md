# Story 2.2: Hover Hint Underline (Predicted)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want a lightweight predicted hint when I hover a concurrency line,
so that I get instant context without noise.

## Acceptance Criteria

1. **Given** a detected concurrency construct  
   **When** I hover the line  
   **Then** a dotted underline hint appears within 100ms  
   **And** it clears immediately when hover ends

## Tasks / Subtasks

- [x] Task 1: Add hover intent state for active line and construct (AC: #1)
  - [x] Add focused hover model in `src/features/concurrency/lensTypes.ts` (line, column, construct kind, confidence)
  - [x] Extend `useLensSignals` or add a small `useHoverHint` hook to expose hover lifecycle state cleanly
  - [x] Ensure state resets on file switch and workspace switch

- [x] Task 2: Render predicted dotted underline overlay in editor (AC: #1)
  - [x] Add lightweight overlay component under `src/components/overlays/` (for example `HintUnderline.tsx`)
  - [x] Integrate overlay into `CodeEditor.tsx` rendering path without breaking syntax highlighting or editor input
  - [x] Render only for hovered detected construct and only when confidence is `predicted`

- [x] Task 3: Enforce interaction timing and clear-on-exit behavior (AC: #1)
  - [x] Show hint on hover/focus intent with target response under 100ms
  - [x] Clear hint on hover out, selection dismissal, and active-file change
  - [x] Ensure clear operation fits NFR interaction budget (under 16ms)

- [x] Task 4: Implement visual style with approved tokens and accessibility (AC: #1)
  - [x] Use Catppuccin Mocha-compatible token values already used in project styles
  - [x] Dotted underline must remain low-noise and not compete with code text
  - [x] Ensure cue remains distinguishable without color alone (patterned dotted line)
  - [x] Respect reduced motion (no pulse/animation in this story)

- [x] Task 5: Add tests for hover hint visibility and teardown (AC: #1)
  - [x] Add unit/integration tests for hover in/out behavior in `src/components/editor/EditorShell.test.tsx` or overlay-specific tests
  - [x] Verify non-hovered constructs are not rendered
  - [x] Verify hints clear on file switch and stale async responses do not keep overlays visible

## Dev Notes

### Developer Context (Read First)

- Story 2.1 already delivers active-file static construct detection via `useLensSignals`; Story 2.2 must consume this output, not re-run analysis logic.
- Keep this story strictly to predicted hover underline behavior. Confidence labels (2.3), density guard (2.4), and quick actions (2.6) remain out of scope.
- The product rule is "no signal over wrong signal"; only draw when mapping is explicit and stable.

### Technical Requirements

- Hover hint must be scoped to the current active file only.
- Hint appears only when hover target maps to a detected construct from `useLensSignals`.
- Initial implementation targets `predicted` confidence cues only.
- Avoid full-file decoration passes on every mouse move; use debounced/guarded or position-based updates.

### Architecture Compliance

- Keep frontend rendering concerns in `src/components` and `src/features/concurrency`.
- Do not add Rust command/API changes unless absolutely required; this story is primarily UI behavior over existing Story 2.1 data.
- Preserve typed IPC boundaries and avoid introducing ad-hoc payloads.
- Maintain editor-first constraints: no modal overlays, no panel coupling, no additional global state unless justified.

### Library / Framework Requirements

- Use existing stack in repo: React 18 + TypeScript strict + Tailwind + CodeMirror 6 + Tauri v2.
- No dependency upgrades for this story.
- Prefer CodeMirror decoration APIs or extension points already used in `CodeEditor.tsx` to avoid DOM overlay drift.

### File Structure Requirements

- Primary files expected:
  - `src/components/editor/CodeEditor.tsx`
  - `src/components/editor/EditorShell.tsx`
  - `src/features/concurrency/lensTypes.ts`
  - `src/features/concurrency/useLensSignals.ts`
- Likely new files:
  - `src/components/overlays/HintUnderline.tsx` (or equivalent)
  - `src/hooks/useHoverHint.ts` (if extracted)

### Testing Requirements

- Validate hover response under target threshold in local interaction testing (<100ms perceived).
- Validate immediate clear on hover end and on context switch.
- Run:
  - `npm test -- src/components/editor/EditorShell.test.tsx`
  - `npm test -- src/features/concurrency/useLensSignals.test.tsx`
  - any new overlay/hook tests added for Story 2.2

### Previous Story Intelligence (Story 2.1)

- Reuse `useLensSignals` as the single source for detected constructs.
- Preserve stale-response guard pattern (`workspacePathRef` + `startingPath`) so old results cannot keep stale hover hints visible.
- Keep API envelope usage consistent (`ApiResponse<T>` pattern).
- Existing touched integration points indicate `EditorShell` is the orchestration boundary; avoid scattering hover logic across unrelated panels.

### Git Intelligence Summary

- Recent commits (`bf171f8`, `6d24136`, `155c9e5`) focused on static detection and data mapping.
- Integration hotspots are `EditorShell`, IPC types, and gopls detection modules.
- Main regression risk for 2.2 is UI responsiveness in the editor loop; avoid expensive hover recalculations.

### Latest Technical Information

- gopls official docs state current guidance is published at `go.dev/gopls` and describe latest stable install/update flow.  
  Source: https://go.dev/gopls/
- Tauri v2 command pattern remains the canonical typed frontend-to-Rust bridge for app commands.  
  Source: https://v2.tauri.app/develop/calling-rust/
- Delve DAP release stream is active; keep Story 2.2 decoupled from runtime confirmation paths (handled later in Epic 4).  
  Source: https://github.com/go-delve/delve/releases

### Project Context Reference

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.2)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR2, FR7, AC-FR2)
- UX constraints: `_bmad-output/planning-artifacts/ux-design-specification.md` (hover <100ms, low-noise overlays, reduced-motion/accessibility)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (module boundaries, typed IPC, no frontend shell execution)
- Global implementation rules: `_bmad-output/project-context.md`
- Prior implementation context: `_bmad-output/implementation-artifacts/2-1-static-concurrency-detection-gopls.md`

### Project Structure Notes

- Current repo has no `src/components/overlays/` directory yet; create minimal overlay files rather than overloading `EditorShell`.
- Keep logic composable: detection data in `features/concurrency`, render behavior in editor/overlay components.
- Maintain existing Catppuccin-style tokens and avoid introducing a competing style system.

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- Story selected automatically from first backlog entry in `sprint-status.yaml`: `2-2-hover-hint-underline-predicted`.
- Loaded artifacts: `epics.md`, `prd.md`, `architecture.md`, `ux-design-specification.md`, `_bmad-output/project-context.md`, and prior story `2-1-static-concurrency-detection-gopls.md`.
- Reviewed recent commits to extract current implementation patterns.
- Added latest-technical-reference links for gopls, Tauri command bridge, and Delve releases.
- 2026-04-10: `npm test -- src/components/editor/CodeEditor.test.tsx src/components/overlays/HintUnderline.test.tsx src/hooks/useHoverHint.test.tsx src/features/concurrency/useLensSignals.test.tsx src/components/editor/EditorShell.test.tsx` passed (13 tests).
- 2026-04-10: `npm test` passed (13 tests).
- 2026-04-10: `npm run build` passed (`tsc && vite build`).

### Completion Notes List

- Added a typed hover hint model and `useHoverHint` hook to map hovered line to predicted static constructs.
- Integrated predicted hover behavior into `EditorShell` while preserving Story 2.1 construct detection as source of truth.
- Updated `CodeEditor` to emit hovered line events and apply/remove predicted dotted underline styling on active lines.
- Added overlay/hook/editor tests to verify hover mapping, non-hover rendering, and file-switch reset behavior.
- Verified regression safety with full test suite and production build checks.

### File List

- _bmad-output/implementation-artifacts/2-2-hover-hint-underline-predicted.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/components/editor/CodeEditor.tsx
- src/components/editor/CodeEditor.test.tsx
- src/components/editor/EditorShell.tsx
- src/components/editor/codemirrorTheme.ts
- src/components/overlays/HintUnderline.tsx
- src/components/overlays/HintUnderline.test.tsx
- src/features/concurrency/lensTypes.ts
- src/hooks/useHoverHint.ts
- src/hooks/useHoverHint.test.tsx

## Change Log

- 2026-04-10: Created Story 2.2 context file and updated sprint status to `ready-for-dev`.
- 2026-04-10: Implemented predicted hover hint underline flow, added hover state orchestration, and added tests for hook/overlay/editor behavior.
