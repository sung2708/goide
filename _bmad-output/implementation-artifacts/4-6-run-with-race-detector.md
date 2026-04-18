# Story 4.6: Run-with-Race-Detector

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want to run my code with the Go race detector enabled,
so that I can get data-driven internal confirmation of race conditions.

## Acceptance Criteria

1. **Given** Deep Trace mode is available
   **When** I trigger a "Run with Race Detector" command
   **Then** the command executes `go run -race {file}`
   **And** any race warnings detected are captured and piped into the Concurrency Lens as Confirmed signals

## Tasks / Subtasks

- [x] Task 1: Add race-detector run action at command and UI entry points (AC: #1)
  - [x] Add a dedicated run action for `go run -race {activeFile}` through existing command palette and inline run pathways.
  - [x] Keep execution workspace-scoped and Rust-owned (no frontend shell execution).
  - [x] Ensure action is gated by runtime availability and active Go file presence.

- [x] Task 2: Extend Rust integration to run and stream race output safely (AC: #1)
  - [x] Reuse existing process execution flow used by baseline run (`go run {file}`) and add race mode option.
  - [x] Capture stdout/stderr with exit code and timeout handling; preserve non-blocking UI.
  - [x] Normalize race output payload into typed IPC shape (no raw internal error leakage).

- [x] Task 3: Parse race detector reports into structured runtime evidence (AC: #1)
  - [x] Detect race blocks from `WARNING: DATA RACE` reports.
  - [x] Extract source file + line references for conflicting accesses when present.
  - [x] Map parsed races to active-file locations only; ignore cross-file locations in MVP.

- [x] Task 4: Surface race findings in Concurrency Lens as Confirmed signals (AC: #1)
  - [x] Convert parsed race findings into lens signal model with `confirmed` confidence.
  - [x] Merge with existing predicted/likely signals using current conflict/override rules (confirmed overrides same-location predicted/likely).
  - [x] Keep density guard, reduced-motion, and overlay cleanup behavior intact.

- [x] Task 5: Provide resilient fallback and trust-preserving UX (AC: #1)
  - [x] If command fails, keep static hints operational with no editor crash.
  - [x] Show low-noise status/output messaging in existing bottom panel/status bar patterns.
  - [x] Do not display false confirmed signals when parsing is partial or ambiguous.

- [x] Task 6: Add focused tests for race-run flow and signal integration (AC: #1)
  - [x] Rust tests: race-run command construction and output parsing (positive + malformed output).
  - [x] Frontend tests: confirmed-signal rendering from race payload and override behavior.
  - [x] Regression tests: fallback behavior remains stable when race command errors/timeouts.

## Dev Notes

### Story Foundation

- Epic context: Epic 4 adds runtime-backed signal confidence; Story 4.6 extends this with explicit race-detector verification.
- Business intent: improve trust with concrete runtime evidence from native Go tooling.
- Scope boundary: single-file race-run integration only; no multi-file correlation expansion in this story.

### Technical Requirements

- Primary command is `go run -race {file}` in workspace directory.
- Race output must be captured from stderr/stdout and parsed for data-race reports.
- Only active-file findings are surfaced to overlays in MVP.
- Confirmed race signals must not break existing deep-trace fallback model from Story 4.5.

### Architecture Compliance

- Keep process spawning in Rust integration layer (`src-tauri/src/integration`), exposed via typed commands in `src-tauri/src/ui_bridge`.
- Keep rendering and interaction updates in frontend concurrency feature modules.
- Maintain typed IPC mirrors between Rust and TypeScript; no ad-hoc JSON blobs.
- Preserve local-only execution and explicit permissions.

### Library / Framework Requirements

- Tauri v2 + React + TypeScript strict + Tailwind patterns remain unchanged.
- Continue using existing signal confidence enum (`predicted | likely | confirmed`).
- Reuse existing Deep Trace runtime status conventions (`healthy/static/degraded`) when surfacing run state.

### File Structure Requirements

- Likely Rust/backend touch points:
  - `src-tauri/src/integration/fs.rs`
  - `src-tauri/src/integration/delve.rs`
  - `src-tauri/src/ui_bridge/commands.rs`
  - `src-tauri/src/ui_bridge/types.rs`
- Likely frontend touch points:
  - `src/components/command-palette/CommandPalette.tsx`
  - `src/components/editor/EditorShell.tsx`
  - `src/components/panels/BottomPanel.tsx`
  - `src/features/concurrency/useLensSignals.ts`
  - `src/features/concurrency/lensTypes.ts`
  - `src/lib/ipc/types.ts`

### Testing Requirements

- Command path tests: verifies `-race` flag inclusion and workspace/file scoping.
- Parser tests: verifies robust extraction from canonical race report format and graceful handling of partial output.
- UI tests: verifies confirmed race indicators render correctly and clear correctly.
- Regression tests: Story 4.5 degraded fallback behavior remains valid after integrating race-run flow.

### Previous Story Intelligence (4.5)

- Reuse degraded-runtime transition patterns and stale-request protections from Story 4.5.
- Preserve trust rule from 4.5: fallback to static when runtime path fails; no disruptive error UI.
- Keep overlays atomic when switching signal sets to avoid flicker and stale confirmed markers.

### Git Intelligence Summary

- `d958ddf` updated editor shell, inline actions, status bar, and Rust integration surfaces; prefer extending these existing paths over creating parallel workflows.
- `c78f8ba` and Story 4.5 established runtime-failure fallback semantics; race-run must integrate without regressing degraded behavior.
- `1880c07` expanded runtime counterpart and confirmed-signal mapping; use same mapping/override mechanics for race evidence.

### Latest Technical Information

- Go official race detector usage supports `go run -race`, `go test -race`, `go build -race`, and `go install -race`.
- Race detector reports are runtime-triggered and include stack traces for conflicting accesses and goroutine creation sites; parsing should key off the `WARNING: DATA RACE` report structure.
- Official docs note race detector overhead (often higher CPU/memory), so run should remain explicit user intent, not always-on.
- Go release history indicates Go 1.24.x line in 2025; project guardrail remains Go 1.21+ compatibility.
- Delve DAP command documentation confirms DAP runs headless and local; this story should keep local-only runtime/debug posture and avoid remote assumptions.

### Project Context Reference

- Epic source: [Source: _bmad-output/planning-artifacts/epics.md#Epic-4-Deep-Trace-Runtime-Signals]
- Story source: [Source: _bmad-output/planning-artifacts/epics.md#Story-46-Run-with-Race-Detector]
- Product requirements: [Source: _bmad-output/planning-artifacts/prd.md#FR4-Deep-Trace-Activation--Runtime-Sampling]
- Product requirements: [Source: _bmad-output/planning-artifacts/prd.md#FR11-Baseline-Execution-Capability]
- UX guidance: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Empty--Loading--Degraded-States-Priority-3]
- Architecture boundaries: [Source: _bmad-output/planning-artifacts/architecture.md#Architectural-Boundaries]
- Global guardrails: [Source: _bmad-output/project-context.md#Critical-Dont-Miss-Rules]
- External reference: [Source: https://go.dev/doc/articles/race_detector.html]
- External reference: [Source: https://go.dev/doc/devel/release]
- External reference: [Source: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv_dap.md]

### Project Structure Notes

- Extend existing run/trace pathways; do not fork a separate execution architecture.
- Keep race evidence as one more runtime signal source feeding the same lens pipeline.
- Preserve editor-first UX and low-noise interaction defaults while exposing race-run results.

## Dev Agent Record

### Agent Model Used

GPT-5 (Codex)

### Debug Log References

- Auto-selected first backlog story from `sprint-status.yaml`: `4-6-run-with-race-detector`.
- Loaded Epic 4 story definitions and FR/NFR constraints from planning artifacts.
- Analyzed Story 4.5 completion notes and latest commits for continuity and regression guardrails.
- Researched current official references for Go race detector and Delve DAP usage to avoid outdated implementation assumptions.
- Added Rust run mode support (`standard` vs `race`) and introduced `run_workspace_file_with_race` command in Tauri IPC.
- Wired command palette and inline/bottom-panel pathways to trigger race runs with runtime availability gating.
- Implemented frontend race report parsing (`WARNING: DATA RACE` + file/line extraction) and mapped matched lines to confirmed runtime signals for Concurrency Lens overlays.
- Added regression coverage for race-run pathway via new editor test and bottom panel action test.
- Validation runs:
  - `cargo test process:: --quiet` (pass)
  - `cargo test ui_bridge::commands:: --quiet` (pass)
  - Frontend Vitest execution was not runnable in this environment (`npm`/`pnpm` unavailable on PATH).

### Completion Notes List

- Implemented race-run command plumbing end-to-end using existing workspace-scoped Rust process execution.
- Added explicit race run actions in command palette, editor toolbar, and bottom panel.
- Parsed race detector stderr output into active-file confirmed signals and surfaced them in Trace Bubble / hint confidence.
- Preserved fallback behavior by only emitting race-confirmed overlays when warning marker and valid active-file line references are both present.
- Added/updated tests for run-mode arguments and race-run UI action path.

### File List

- _bmad-output/implementation-artifacts/4-6-run-with-race-detector.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src-tauri/src/integration/process.rs
- src-tauri/src/ui_bridge/commands.rs
- src-tauri/src/lib.rs
- src/lib/ipc/client.ts
- src/components/editor/EditorShell.tsx
- src/components/editor/EditorShell.race-run.test.tsx
- src/components/command-palette/CommandPalette.tsx
- src/components/panels/BottomPanel.tsx
- src/components/panels/BottomPanel.test.tsx
- src/components/statusbar/StatusBar.tsx

## Change Log

- 2026-04-18: Created story context for race-detector run integration and marked story ready-for-dev.
- 2026-04-18: Implemented race detector run flow, confirmed signal parsing/rendering, and supporting tests; story moved to review.
