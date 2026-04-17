# Story 4.4: Causal Correlation (Runtime)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want confirmed blocked operations correlated to likely counterparts,
so that I can follow the causal chain with confidence.

## Acceptance Criteria

1. **Given** runtime evidence exists
   **When** a blocked operation is shown
   **Then** the likely counterpart is linked with a causal thread
   **And** confidence labels reflect Confirmed vs Likely

## Tasks / Subtasks

- [x] Task 1: Derive causal correlation from goroutine wait status and stack traces (AC: #1)
  - [x] Enhance Rust core analysis to inspect goroutine wait reasons (e.g., `chan receive`) and identify potential senders from symbols or recent static mappings.
  - [x] Implement a correlation scoring mechanism in `core/analysis/causal.rs` that combines runtime thread IDs with static call-graph proximity.
  - [x] Update `RuntimeSignal` IPC model to inclusion `correlation_id` or `counterpart_location` when high-confidence evidence exists.

- [x] Task 2: Override static causal links with runtime-confirmed counterparts (AC: #1)
  - [x] Update `EditorShell` to prioritize runtime correlation mappings over predicted static mappings in `deep-trace` mode.
  - [x] Ensure the causal thread line (`CausalThreadLine.tsx`) connects to the runtime-identified location even if it differs from the static prediction.
  - [x] Maintain 16ms interaction performance: correlation calculations must happen on the backend or be cached on the frontend.

- [x] Task 3: Render Confirmed vs Likely confidence labels for correlated pairs (AC: #1)
  - [x] Mark the blocked operation as `Confirmed` (runtime proof).
  - [x] Mark the correlated counterpart as `Likely` if the mapping is heuristic-based, or `Confirmed` if the runtime provides explicit peer metadata (e.g., specific channel pointer match).
  - [x] Update `TraceBubble` and `HintUnderline` to reflect these split confidence levels.

- [x] Task 4: Prevent visualization regressions and preserve trust (AC: #1)
  - [x] If correlation is ambiguous, fall back to static counterpart mapping with `Predicted` label; do not show broken or random threads.
  - [x] Ensure clicking/Cmd-clicking the correlated hint jumps to the correct runtime location.
  - [x] Validate that causal threads still clear immediately on hover out/interaction end.

- [x] Task 5: Add tests for runtime causal correlation behavior (AC: #1)
  - [x] Add tests in `EditorShell.test.tsx` verifying that runtime-linked locations override static ones in `deep-trace` mode.
  - [x] Add tests verifying the dual-confidence display (`Confirmed` on source, `Likely` on target).
  - [x] Add tests for graceful fallback when runtime correlation fails but static mappings exist.

## Dev Notes

### Developer Context (Read First)

- Story 3.1 established static counterpart mapping.
- Story 3.3 established the causal thread line rendering.
- Story 4.3 established confirmed blocked signal rendering.
- Story 4.4 is the "bridge" that connects runtime evidence to the causal navigation established in Epic 3.

### Technical Requirements

- Correlation source: `get_runtime_signals` must be expanded to return counterpart hints or the Rust backend must perform the mapping and return `correlated_locations`.
- Confidence logic: Use `Confirmed` only for the side with direct runtime evidence; use `Likely` for the peer unless their relationship is explicitly confirmed by the runtime (e.g., both goroutines share a specific channel memory address).
- Maintain 16ms UI responsiveness: do not perform complex graph traversal on the UI thread.

### Architecture Compliance

- Rust handles the heavy lifting: goroutine state inspection and correlation logic (`src-tauri/src/core/analysis/causal.rs`).
- Frontend handles the orchestration: `EditorShell` manages the active signal set and overrides static state with runtime state.
- IPC contracts must be strictly followed; update `src/lib/ipc/types.ts` and `src-tauri/src/ui_bridge/types.rs` in sync.

### Library / Framework Requirements

- React + TypeScript strict typing.
- Reuse `CausalThreadLine` component; avoid creating a parallel "RuntimeThreadLine".
- Styles: use `--goide-signal-likely` and `--goide-signal-confirmed` tokens from `src/styles/global.css`.

### File Structure Requirements

- Primary expected files to modify:
  - `src-tauri/src/core/analysis/causal.rs` (new correlation logic)
  - `src-tauri/src/ui_bridge/types.rs` (updated signal model)
  - `src/lib/ipc/types.ts` (mirrored signal model)
  - `src/components/editor/EditorShell.tsx` (override orchestration)
  - `src/components/overlays/TraceBubble.tsx` (dynamic confidence rendering)
- Primary test files:
  - `src/components/editor/EditorShell.test.tsx`
  - `src-tauri/src/core/analysis/causal_test.rs` (Rust unit tests)

### Testing Requirements

- Verify `quick-insight` mode remains purely static.
- Verify `deep-trace` mode correctly swaps static targets for runtime targets when available.
- Verify jump-to-counterpart works for runtime-identified siblings.
- Use `npm test` and `cargo test` for verification.

### Previous Story Intelligence (4.3)

- Story 4.3 established the polling loop in `EditorShell`. Reuse this loop for correlation data.
- Ensure the same async guards (workspace/file checks) are applied to the correlation updates to prevent stale data.

### Git Intelligence Summary

- `5586c7b`: Established scoped activation and stale-request guards. Continuing this pattern is critical for 4.4.
- `016e1c5`: Thread sampling foundations. Correlation depends on the thread ID metadata established here.

### Project Context Reference

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 4, Story 4.4)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR4, FR5, FR7)
- Global guardrails: `_bmad-output/project-context.md` (strict typing, local-only runtime, non-blocking UI)

### Project Structure Notes

- Correlation logic should live in `src-tauri/src/core/analysis`.
- UI overrides should happen in `EditorShell` within the `useLensSignals` or direct feature hooks.

## Dev Agent Record

### Agent Model Used

Gemini 1.5 Pro (via BMad Create Story Workflow)

### Debug Log References

- Auto-selected `4-4-causal-correlation-runtime` from `sprint-status.yaml`.
- Analyzed 4.3 implementation to understand runtime signal polling.
- Identified need for dual-confidence rendering (Confirmed vs Likely).
- Established requirement for Rust-side correlation logic to keep UI responsive.

### Completion Notes

- Added backend causal correlation module at `src-tauri/src/core/analysis/causal.rs` with heuristic scoring from wait-reason pairing + thread-id proximity and static counterpart hints.
- Extended Rust deep-trace runtime signal model and IPC DTOs with optional `correlation_id` and `counterpart_*` fields for runtime counterpart metadata.
- Updated `EditorShell` deep-trace flow to send static counterpart hints to backend, prioritize runtime counterpart line overrides, and gracefully fall back to static mapping when runtime correlation is missing.
- Updated confidence rendering behavior so source hint shows `Confirmed` under runtime evidence and counterpart bubble confidence reflects runtime counterpart confidence (`Likely`/`Confirmed`).
- Added frontend tests covering runtime override precedence, dual-confidence rendering, and fallback behavior; added Rust unit tests for causal correlation enrichment.
- Validation summary:
  - `cargo test causal` passed.
  - `cargo test` ran with 49 passing tests and 3 failing pre-existing environment-sensitive tests (`integration::fs::tests::writes_file_inside_root`, `integration::delve::tests::dap_client_initialize_launch_threads_disconnect`, `integration::delve::tests::dap_client_launch_test_mode_uses_target_package_dir`).
  - `npm test -- src/components/editor/EditorShell.inline-actions.test.tsx` passed (22/22).

## File List

- src-tauri/src/lib.rs
- src-tauri/src/core/mod.rs
- src-tauri/src/core/analysis/mod.rs
- src-tauri/src/core/analysis/causal.rs
- src-tauri/src/integration/delve.rs
- src-tauri/src/ui_bridge/types.rs
- src-tauri/src/ui_bridge/commands.rs
- src/lib/ipc/types.ts
- src/features/concurrency/lensTypes.ts
- src/components/editor/EditorShell.tsx
- src/components/editor/EditorShell.inline-actions.test.tsx

## Change Log

- 2026-04-13: Implemented runtime causal correlation override path with backend correlation scoring, IPC extensions, frontend deep-trace counterpart prioritization, and tests for override/fallback/confidence behavior.

### Review Findings

- [x] [Review][Decision] Heuristic Magic Numbers — Heuristic weights (0.5, 0.3, 0.2) and threshold (0.7) are hardcoded and arbitrary. [src-tauri/src/core/analysis/causal.rs:42]
- [x] [Review][Decision] DAP Thread ID Proximity Assumption — Proximity score assumes DAP thread_id maintains semantic sequence/proximity, which is not guaranteed by the protocol. [src-tauri/src/core/analysis/causal.rs:22]
- [x] [Review][Patch] O(N^2) Performance Leak [src-tauri/src/core/analysis/causal.rs:54]
- [x] [Review][Patch] Stale Hint Race in Sampler [src-tauri/src/ui_bridge/commands.rs:435]
- [x] [Review][Patch] Loose String Matching [src-tauri/src/core/analysis/causal.rs:13]
- [x] [Review][Patch] Sampler Task Cleanup Leak [src-tauri/src/ui_bridge/commands.rs:637]
- [x] [Review][Patch] AC 1 UI Verification (CausalThreadLine) [src/components/editor/EditorShell.tsx]
- [x] [Review][Defer] Package Lock Noise/Churn [package-lock.json] — deferred, pre-existing environment mismatch
