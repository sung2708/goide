# Story 3.1: Counterpart Mapping (Static)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want sender/receiver counterparts mapped in the active file,
so that I can jump between related concurrency operations.

## Acceptance Criteria

1. **Given** a Go file with matched send/receive operations  
   **When** static analysis completes  
   **Then** counterpart pairs are mapped within the same file  
   **And** mappings are limited to the active file only

## Tasks / Subtasks

- [x] Task 1: Add explicit counterpart-mapping model for static analysis output (AC: #1)
  - [x] Extend frontend lens types with a counterpart mapping entity keyed by active file scope (for example source line, counterpart line, symbol/channel key, confidence)
  - [x] Keep mapping data typed end-to-end and compatible with existing `ApiResponse` contract style
  - [x] Ensure the model can represent "no counterpart found" without throwing or leaking invalid state

- [x] Task 2: Implement same-file counterpart pairing pipeline in static analysis flow (AC: #1)
  - [x] Add counterpart pairing logic in the existing analysis path (`useLensSignals` pipeline and/or Rust gopls integration) without introducing a parallel analysis subsystem
  - [x] Constrain pairing to `activeFilePath` only and drop cross-file candidates
  - [x] Favor deterministic pairing rules and stable output ordering to prevent flicker and jump ambiguity

- [x] Task 3: Wire mapping state for downstream jump interactions (AC: #1)
  - [x] Surface counterpart availability to editor shell state in a way Story 3.2 can consume without refactor churn
  - [x] Keep current hover-hint and inline-action behavior intact while adding mapping metadata
  - [x] Preserve stale-workspace protection (`workspacePathRef` + `startingPath`) when async analysis resolves

- [x] Task 4: Preserve UX, trust, and performance guardrails (AC: #1)
  - [x] Keep editor-first low-noise behavior (no persistent overlay additions in this story)
  - [x] Maintain interaction-performance targets (under 16ms UI updates, no additional blocking on main thread)
  - [x] Prefer no mapping over incorrect mapping; do not emit misleading pairs

- [x] Task 5: Add regression tests for counterpart mapping correctness and boundaries (AC: #1)
  - [x] Add frontend tests for deterministic same-file mapping from representative construct inputs
  - [x] Add backend/unit tests for path validation and active-file-only analysis boundaries if contract changes touch Rust commands
  - [x] Add tests for negative cases: unmatched operations, duplicate symbols, workspace/file switch during analysis

## Dev Notes

### Developer Context (Read First)

- Story 3.1 is the data foundation for Epic 3 navigation stories (jump, thread line, trace bubble, summary jump). Keep scope to mapping data and guardrails, not full jump UI.
- Existing Story 2 pipeline already detects predicted constructs and powers hover hints. Reuse that path and extend it; do not create a duplicate signal-analysis flow.
- This story should produce trustworthy counterpart metadata for same-file navigation while preserving low-noise UX and fallback behavior established in Epic 2.

### Technical Requirements

- Counterpart mapping must be generated from static analysis and attached to active-file constructs.
- Mapping must remain strictly in-file (`activeFilePath`) and reset cleanly on file/workspace changes.
- Mapping behavior must be deterministic to avoid inconsistent jump targets.
- Soft-fail behavior required: analysis errors or ambiguous mapping states must not break the editor UI.

### Architecture Compliance

- Respect boundaries from architecture and project context:
  - Rust analysis/integration: `src-tauri/src/integration/*`
  - Tauri command surface and DTO mapping: `src-tauri/src/ui_bridge/*`
  - Frontend concurrency feature state: `src/features/concurrency/*`
  - UI composition only in editor/overlay components: `src/components/*`
- Keep Tauri IPC typed and minimal (`{ ok, data, error }`), with no raw internal errors exposed to UI.
- No frontend shell execution, no network access, local-only analysis.

### Library / Framework Requirements

- Tauri v2 command architecture stays in place; avoid adding broad generic commands.
- React + TypeScript strict mode remains the frontend baseline; no `any` for mapping types.
- Keep current CodeMirror-based interaction flow; this story adds mapping data, not a new editor engine.
- gopls/lexer-backed static analysis remains best-effort; mapping should tolerate partial symbol data.

### File Structure Requirements

- Primary expected touchpoints:
  - `src/features/concurrency/lensTypes.ts`
  - `src/features/concurrency/useLensSignals.ts`
  - `src/hooks/useHoverHint.ts` (only if hint payload needs mapped metadata)
  - `src/components/editor/EditorShell.tsx` (mapping availability wiring for next-story jump actions)
  - `src/lib/ipc/types.ts`
  - `src/lib/ipc/client.ts` (if command response shape changes)
  - `src-tauri/src/integration/gopls.rs` (if pairing logic implemented in Rust)
  - `src-tauri/src/ui_bridge/types.rs` and `src-tauri/src/ui_bridge/commands.rs` (if DTO/command output expands)
- Keep business logic out of visual components. Components should consume precomputed mapping data.

### Testing Requirements

- Validate positive pairing for representative same-file send/receive patterns.
- Validate strict boundary behavior:
  - no cross-file mapping
  - no stale mapping after workspace/file switch
  - no mapping emitted for unmatched constructs
- Validate deterministic ordering and stable identity for repeated analyses on unchanged input.
- Run targeted tests plus project baselines:
  - `npm test -- src/features/concurrency/useLensSignals.test.tsx src/features/concurrency/signalDensity.test.ts src/components/editor/EditorShell.test.tsx src/hooks/useHoverHint.test.tsx`
  - `cargo test`
  - `npm test`
  - `npm run build`

### Git Intelligence Summary

- Recent commits show an incremental, layering strategy:
  - `f093a4b`: hover hint baseline
  - `7d1ae9b`: confidence labels and styling tokens
  - `971f6a3`: density guard
  - `d62e5f1`: degraded runtime fallback
  - `b11f071`: inline quick actions scaffolding
- Story 3.1 should follow the same pattern: extend analysis/state contracts with focused tests, avoid broad refactors.

### Latest Technical Information

- Tauri crate docs list `tauri` `2.10.3` (published 2026-03-04). Keep Story 3.1 changes compatible with Tauri v2 command/DTO patterns already used in this repo.  
  Source: https://docs.rs/tauri/latest/tauri/struct.App.html
- Delve releases page shows `v1.25.2` as latest stable release in the captured index. Counterpart mapping must not depend on runtime-only signals from Delve for this static story.  
  Source: https://github.com/go-delve/delve/releases
- React 19 remains the active major line (official upgrade guidance). Keep state additions minimal and compatible with existing functional-component patterns.  
  Source: https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- `gopls` package listing indicates `v0.21.1` and flags that newer module versions exist; avoid locking Story 3.1 logic to fragile output assumptions from a single CLI format variant.  
  Source: https://pkg.go.dev/golang.org/x/tools/gopls

### Project Context Reference

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 3, Story 3.1)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR3, FR7, FR8; AC-FR3)
- UX constraints: `_bmad-output/planning-artifacts/ux-design-specification.md` (hover -> explain -> jump loop, low-noise overlays, trust-first signaling)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (module boundaries, typed IPC, local-only execution)
- Global implementation rules: `_bmad-output/project-context.md`
- Recent implementation pattern references: `_bmad-output/implementation-artifacts/2-6-inline-quick-actions-on-hover.md`

### Project Structure Notes

- `useLensSignals` is the right orchestration point for extending static-analysis output into mapping data while preserving current stale-response guards.
- `EditorShell` already computes `hasCounterpart` heuristically from symbols; Story 3.1 should replace that heuristic with explicit mapping state once available.
- `useHoverHint` should remain focused on hint selection; avoid overloading it with heavy pairing logic.

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- Story selected automatically from first backlog entry in `sprint-status.yaml`: `3-1-counterpart-mapping-static`.
- Loaded artifacts: `epics.md`, `prd.md`, `architecture.md`, `ux-design-specification.md`, `_bmad-output/project-context.md`.
- Reviewed current implementation touchpoints: `useLensSignals`, `lensTypes`, `useHoverHint`, `EditorShell`, IPC TS/Rust command/type files, and `gopls.rs`.
- Reviewed recent commit history to preserve existing implementation sequence and avoid regressions.
- Verified latest technical references for Tauri v2, Delve releases, React major guidance, and gopls listing status.
- 2026-04-11: Story status moved to `ready-for-dev` in `sprint-status.yaml`.
- 2026-04-11: Story status moved to `in-progress` in `sprint-status.yaml`.
- 2026-04-11: Added red-phase tests for counterpart mapping logic and editor counterpart wiring.
- 2026-04-11: Implemented `buildCounterpartMappings` and wired counterpart mappings into `useLensSignals`.
- 2026-04-11: Updated `EditorShell` to use explicit counterpart mapping state for Jump availability.
- 2026-04-11: Improved static channel marker detection in Rust gopls integration for send/receive flows.
- 2026-04-11: `npm test -- src/features/concurrency/counterpartMapping.test.ts src/features/concurrency/useLensSignals.test.tsx src/components/editor/EditorShell.inline-actions.test.tsx` passed (9 tests).
- 2026-04-11: `cargo test` passed (9 Rust tests).
- 2026-04-11: `npm test` passed (36 tests).
- 2026-04-11: `npm run build` passed.
- 2026-04-11: Story status moved to `review` in `sprint-status.yaml`.

### Completion Notes List

- Created comprehensive Story 3.1 implementation guide for static same-file counterpart mapping.
- Added explicit guardrails for module boundaries, deterministic mapping behavior, and active-file-only scope.
- Included concrete testing expectations for correctness, stale-state protection, and regression prevention.
- Added a dedicated counterpart mapping model and deterministic mapping algorithm for same-file channel counterparts.
- Wired counterpart mapping output into `useLensSignals` so UI state can consume typed mapping data directly.
- Switched inline Jump enablement in `EditorShell` from heuristic symbol search to explicit mapping presence on the active line.
- Added frontend regression tests covering deterministic mapping output, unmatched/symbol-less behavior, and hook-level mapping output.
- Added Rust unit coverage for channel send/receive symbol extraction and kept all existing Rust tests green.
- Verified full regression gates (`cargo test`, `npm test`, `npm run build`) before marking story for review.

### File List

- _bmad-output/implementation-artifacts/3-1-counterpart-mapping-static.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/components/editor/EditorShell.inline-actions.test.tsx
- src/components/editor/EditorShell.tsx
- src/features/concurrency/counterpartMapping.test.ts
- src/features/concurrency/counterpartMapping.ts
- src/features/concurrency/lensTypes.ts
- src/features/concurrency/useLensSignals.test.tsx
- src/features/concurrency/useLensSignals.ts
- src-tauri/src/integration/gopls.rs

## Change Log

- 2026-04-11: Created Story 3.1 context file and updated sprint status to `ready-for-dev`.
- 2026-04-11: Implemented Story 3.1 counterpart mapping and updated story status to `review`.
- 2026-04-11: Addressed code review findings and updated story status to `done`.
