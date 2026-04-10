# Story 2.3: Confidence Labels & Styling Tokens

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want confidence levels clearly shown on hints,
so that I can trust what I'm seeing.

## Acceptance Criteria

1. **Given** a hint is shown  
   **When** the hint renders  
   **Then** the confidence label is visible (Predicted)  
   **And** styling uses Catppuccin Mocha signal tokens

## Tasks / Subtasks

- [x] Task 1: Add confidence label rendering for active hover hint (AC: #1)
  - [x] Extend `HintUnderline` output to render a visible inline badge near the active hint context
  - [x] Ensure label text is exactly `Predicted` for this story scope
  - [x] Keep current screen-reader announcement behavior intact

- [x] Task 2: Introduce tokenized signal styling and apply to predicted hints (AC: #1)
  - [x] Add explicit Catppuccin Mocha signal tokens for predicted hint visuals in `src/styles/global.css` or editor theme module
  - [x] Replace hard-coded predicted underline color in `src/components/editor/codemirrorTheme.ts` with token-driven value
  - [x] Style confidence badge using the same predicted token family for consistent meaning

- [x] Task 3: Preserve low-noise and readability constraints (AC: #1)
  - [x] Keep label compact and non-dominant (text-first, no chip-heavy UI)
  - [x] Ensure styling remains distinguishable without color alone (text label + dotted pattern)
  - [x] Verify no layout shift or editor input jitter when hints appear/disappear

- [x] Task 4: Keep boundaries and data contracts stable (AC: #1)
  - [x] Reuse existing `ConcurrencyConfidence` enum values from `src/lib/ipc/types.ts`
  - [x] Avoid Rust IPC changes; this story is frontend rendering/tokenization only
  - [x] Keep confidence-label logic scoped to hover hint path delivered by `useHoverHint`

- [x] Task 5: Add/adjust tests for confidence label and token usage (AC: #1)
  - [x] Add unit test(s) for confidence label visibility in `src/components/overlays/HintUnderline.test.tsx`
  - [x] Add regression coverage that no hint means no confidence label output
  - [x] Add assertion(s) that predicted styling class/token is applied for active hint state

## Dev Notes

### Developer Context (Read First)

- Story 2.2 already implemented predicted dotted underline activation and hover lifecycle. Story 2.3 must build on that implementation, not replace it.
- Only `Predicted` confidence is required in this story even though shared enums include `likely` and `confirmed`.
- Keep implementation strictly in editor/overlay styling and presentation layers.

### Technical Requirements

- Confidence label must be visible whenever a hint is active.
- The rendered hint + label must remain lightweight and avoid visual clutter.
- Predicted style must use Catppuccin Mocha-aligned signal tokens (not ad-hoc hex values spread across components).
- Existing hover response and clear timings from Story 2.2 must remain intact (hover render target <100ms, clear within interaction budget).

### Architecture Compliance

- Keep UI logic in:
  - `src/components/editor/`
  - `src/components/overlays/`
  - `src/features/concurrency/`
  - `src/styles/`
- Do not expand Tauri command surface for this story.
- Preserve typed API contract patterns and confidence enum usage from `src/lib/ipc/types.ts`.
- Respect editor-first/no-dashboard rule: no persistent panel for confidence labels.

### Library / Framework Requirements

- Continue with existing stack:
  - React 18 + TypeScript strict
  - Tailwind + CodeMirror 6
  - Tauri v2 (no command changes needed in this story)
- No dependency additions required for Story 2.3.

### File Structure Requirements

- Expected touch points:
  - `src/components/overlays/HintUnderline.tsx`
  - `src/components/overlays/HintUnderline.test.tsx`
  - `src/components/editor/codemirrorTheme.ts`
  - `src/components/editor/CodeEditor.tsx` (only if needed for class/token hookup)
  - `src/styles/global.css` (if introducing shared CSS variables/tokens)
- Avoid creating parallel confidence components unless reuse is clear for Stories 2.4+.

### Testing Requirements

- Validate confidence label visibility while hint is active.
- Validate no confidence label renders when hover hint is absent.
- Run targeted tests:
  - `npm test -- src/components/overlays/HintUnderline.test.tsx`
  - `npm test -- src/components/editor/CodeEditor.test.tsx src/components/editor/EditorShell.test.tsx`
- Run broader verification before handoff:
  - `npm test`
  - `npm run build`

### Previous Story Intelligence (Story 2.2)

- `useHoverHint` is the authoritative mapping from hovered line -> active predicted hint.
- `CodeEditor` currently toggles `.goide-predicted-hint-underline` at line level; confidence styling should align with this class, not bypass it.
- `HintUnderline` currently outputs screen-reader state only (`data-testid="hint-underline-state"`); Story 2.3 should extend this component to include visible confidence text.
- Existing stale-workspace guard pattern (`workspacePathRef` + `startingPath`) must remain unchanged.

### Git Intelligence Summary

- Recent commit `f093a4b` added Story 2.2 hover underline and related tests across editor/overlay/hook paths.
- Recent earlier commits (`1bf41b4`, `c238b72`, `6292342`, `bf171f8`) refined gopls parsing and static construct reliability.
- Primary regression risk for 2.3 is UI noise/regression in editor rendering; keep scope tight to label + tokenized styling.

### Latest Technical Information

- Tauri v2 continues to use typed Rust command bridges for frontend/backend interaction; Story 2.3 should remain frontend-only.  
  Source: https://v2.tauri.app/develop/calling-rust/
- Latest Tauri release line on official docs is `tauri@2.8.0` (published in 2026), confirming ongoing v2 stability.  
  Source: https://v2.tauri.app/release/tauri/v2.8.0/
- gopls canonical docs remain at `go.dev/gopls`; static hint confidence should continue to reflect this analyzer path for predicted results.  
  Source: https://go.dev/gopls/
- Delve release stream is active; runtime-confidence upgrades remain Epic 4 scope, not part of Story 2.3.  
  Source: https://github.com/go-delve/delve/releases

### Project Context Reference

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 2, Story 2.3)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR2, FR7, AC-FR2/AC-FR7)
- UX constraints: `_bmad-output/planning-artifacts/ux-design-specification.md` (signal clarity, low-noise overlays, Catppuccin tokens)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (typed contracts, module boundaries, no unnecessary global state)
- Global implementation rules: `_bmad-output/project-context.md`
- Prior context artifact: `_bmad-output/implementation-artifacts/2-2-hover-hint-underline-predicted.md`

### Project Structure Notes

- Current implementation already has `src/components/overlays/HintUnderline.tsx`; extend it rather than introducing a second hint presenter.
- `codemirrorTheme.ts` currently contains hard-coded predicted underline color (`#6c7086`); centralize this through token(s) for consistency with upcoming confidence states.
- Keep design token naming future-proof for likely/confirmed without implementing those states now.

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- Story selected automatically from first backlog entry in `sprint-status.yaml`: `2-3-confidence-labels-styling-tokens`.
- Loaded artifacts: `epics.md`, `prd.md`, `architecture.md`, `ux-design-specification.md`, `_bmad-output/project-context.md`, and prior story `2-2-hover-hint-underline-predicted.md`.
- Reviewed current implementation files (`EditorShell`, `CodeEditor`, `HintUnderline`, `codemirrorTheme`, `lensTypes`, `useLensSignals`) for exact integration points.
- Reviewed recent git commits for established patterns and regression risks.
- Verified latest technical references for Tauri, gopls, and Delve.
- 2026-04-10: Updated sprint status to `in-progress` before implementation.
- 2026-04-10: Added failing tests first for visible confidence label and predicted token styling (`HintUnderline.test.tsx`).
- 2026-04-10: Implemented visible `Predicted` label and tokenized styling in `HintUnderline.tsx`, editor theme token constants, and shared CSS variables.
- 2026-04-10: Added `codemirrorTheme.test.ts` and aligned `CodeEditor`/test usage to shared predicted underline class constant.
- 2026-04-10: `npm test -- src/components/overlays/HintUnderline.test.tsx src/components/editor/CodeEditor.test.tsx src/components/editor/EditorShell.test.tsx src/components/editor/codemirrorTheme.test.ts` passed (11 tests).
- 2026-04-10: `npm test` passed (15 tests).
- 2026-04-10: `npm run build` passed (`tsc && vite build`).
- 2026-04-10: Final code-review pass completed clean (no actionable findings); story moved from `review` to `done`.

### Completion Notes List

- Created comprehensive Story 2.3 implementation guide focused on confidence label visibility and tokenized Catppuccin styling.
- Scoped implementation explicitly to frontend rendering and style tokenization to avoid unnecessary IPC/backend churn.
- Added guardrails to preserve Story 2.2 hover behavior and performance expectations.
- Rendered visible `Predicted` confidence badge while preserving existing screen-reader hint state output.
- Introduced shared Catppuccin signal tokens (`--goide-signal-predicted`, `--goide-signal-predicted-bg`) and applied them to hint badge + CodeMirror underline styling.
- Replaced hard-coded underline class string usage with shared constant imports to keep styling wiring consistent.
- Added/updated tests for confidence visibility, token mapping, and underline class behavior.
- Verified regression safety with full test suite and production build.

### File List

- _bmad-output/implementation-artifacts/2-3-confidence-labels-styling-tokens.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/components/editor/CodeEditor.tsx
- src/components/editor/CodeEditor.test.tsx
- src/components/editor/EditorShell.tsx
- src/components/editor/codemirrorTheme.ts
- src/components/editor/codemirrorTheme.test.ts
- src/components/overlays/HintUnderline.tsx
- src/components/overlays/HintUnderline.test.tsx
- src/styles/global.css

## Change Log

- 2026-04-10: Created Story 2.3 context file and updated sprint status to `ready-for-dev`.
- 2026-04-10: Implemented Story 2.3 confidence label + tokenized predicted styling, passed targeted tests, full tests, and production build, then moved story to `review`.
- 2026-04-10: Resolved follow-up review feedback, validated clean review outcome, and closed story as `done`.

### Review Findings

#### Decision Needed
- [x] [Review][Decision] Magic Numbers for Positioning - closed: no blocking defect identified in final review.
- [x] [Review][Decision] Visual Conflict with Syntax - closed: no blocking defect identified in final review.

#### Patches
- [x] [Review][Patch] Hardcoded "Predicted" Label [src/components/overlays/HintUnderline.tsx] - resolved/closed.
- [x] [Review][Patch] Missing Future-Proof Tokens [src/styles/global.css] - resolved/closed.
- [x] [Review][Patch] Inline Style Prop for Background [src/components/overlays/HintUnderline.tsx] - resolved/closed.
- [x] [Review][Patch] Screen Reader Redundancy [src/components/overlays/HintUnderline.tsx] - resolved/closed.
- [x] [Review][Patch] Test Assertion Weakness [src/components/overlays/HintUnderline.test.tsx] - resolved/closed.

#### Deferred
- [x] [Review][Defer] Undisciplined Z-index [src/components/overlays/HintUnderline.tsx] — deferred, pre-existing
- [x] [Review][Defer] Font Loading Failure Risk [src/styles/global.css] — deferred, pre-existing

