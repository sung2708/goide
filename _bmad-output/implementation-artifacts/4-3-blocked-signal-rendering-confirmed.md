# Story 4.3: Blocked Signal Rendering (Confirmed)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want blocked operations highlighted with confirmed signals,
so that I can see the real runtime bottleneck.

## Acceptance Criteria

1. **Given** a blocked operation is detected
   **When** it is rendered
   **Then** a soft pulse is shown with Confirmed confidence
   **And** it does not overwhelm code readability

## Tasks / Subtasks

- [x] Task 1: Derive blocked runtime UI state from Deep Trace runtime sampling (AC: #1)
  - [x] Reuse existing `getRuntimeSignals` IPC (`src/lib/ipc/client.ts`) and fetch only while mode is `"deep-trace"`.
  - [x] Treat blocking wait reasons from Delve (`chan receive`, `chan send`, `semacquire`, `select`, `sleep`, `io wait`) as blocked candidates.
  - [x] Keep updates bounded and non-blocking (light polling cadence aligned with backend sampler, no busy loop).

- [x] Task 2: Render Confirmed blocked signal on the scoped code location (AC: #1)
  - [x] Use the active Deep Trace scope anchor (from successful activation context in `EditorShell`) as the source line for blocked highlighting.
  - [x] Add a dedicated blocked visual state that uses Catppuccin blocked token (`--goide-signal-blocked`) with subtle pulse behavior.
  - [x] Ensure only one dominant blocked signal treatment is visible at a time for the scoped location.

- [x] Task 3: Preserve trust semantics and avoid misleading overlays (AC: #1)
  - [x] Show `Confirmed` confidence when runtime blocked evidence exists.
  - [x] Do not invent exact line mappings from thread metadata alone; if runtime evidence is ambiguous, keep static hint behavior and avoid false precision.
  - [x] Keep fallback intact: if runtime signal stream is empty/error, clear blocked render state and continue static hints.

- [x] Task 4: Keep readability and performance guardrails (AC: #1)
  - [x] Respect density and editor-first constraints: avoid persistent/noisy overlays and avoid full-file pulse effects.
  - [x] Respect reduced-motion preference; pulse should degrade to static emphasis when reduced motion is requested.
  - [x] Prevent stale async updates on workspace/file switches using the same request-guard pattern used in prior stories.

- [x] Task 5: Add focused tests for blocked confirmed rendering behavior (AC: #1)
  - [x] Add/extend `EditorShell` tests to verify blocked signal appears only in `deep-trace` mode with runtime evidence.
  - [x] Add tests that verify `Confirmed` label is rendered for blocked state and removed when runtime evidence disappears.
  - [x] Add tests for graceful fallback and no stale updates during workspace/file changes.

## Dev Notes

### Developer Context (Read First)

- Story 4.1 established scoped activation and mode transitions.
- Story 4.2 established Delve DAP sampling and runtime-signal IPC.
- Story 4.3 is UI rendering and confidence behavior for confirmed blocked state; do not redesign runtime sampling architecture in this story.

### Technical Requirements

- Runtime blocked evidence source is `get_runtime_signals` (thread status + wait reason + confirmed confidence).
- Current runtime signal payload has no file/line coordinate; rendering must be tied to scoped active context, not inferred from thread id alone.
- Blocking signal must be lightweight and deterministic: soft pulse plus explicit `Confirmed` confidence semantics.
- Keep existing degraded behavior from Epic 2/FR5: static hints remain available when runtime evidence is absent.

### Architecture Compliance

- Keep Rust/TS boundaries intact:
  - Rust owns Delve process + sampling (`src-tauri/src/integration/*`, `src-tauri/src/ui_bridge/commands.rs`).
  - Frontend owns rendering/state orchestration (`src/components/editor/*`, `src/components/overlays/*`, `src/features/concurrency/*`).
- Reuse typed IPC contracts; no untyped payload path.
- No frontend process spawning or direct shell behavior.

### Library / Framework Requirements

- React + TypeScript strict typing; avoid `any` for blocked-state models.
- Tauri invoke wrappers remain the only runtime signal entry point.
- CSS/Tailwind + existing token system in `src/styles/global.css`; use `--goide-signal-blocked` for blocked emphasis.

### File Structure Requirements

- Primary expected files:
  - `src/components/editor/EditorShell.tsx`
  - `src/components/editor/EditorShell.inline-actions.test.tsx`
  - `src/components/overlays/HintUnderline.tsx`
  - `src/components/overlays/TraceBubble.tsx`
  - `src/styles/global.css`
  - `src/lib/ipc/client.ts` (reuse existing runtime-signal fetch path)
  - optional: `src/lib/ipc/types.ts` (only if minimal typed UI mapping needs expansion)

### Testing Requirements

- Validate mode-gated runtime fetch/render behavior (`quick-insight` vs `deep-trace`).
- Validate confirmed blocked state lifecycle (appear, update, clear).
- Validate reduced-motion behavior for pulse treatment.
- Validate no stale updates after workspace/file switch.
- Suggested commands:
  - `npm test -- src/components/editor/EditorShell.inline-actions.test.tsx src/components/overlays/HintUnderline.test.tsx src/components/overlays/TraceBubble.test.tsx`
  - `npm test`
  - `npm run build`

### Previous Story Intelligence (4.2)

- Reuse the existing `get_runtime_signals` backend command and avoid creating parallel runtime channels.
- 4.2 review fixes established two critical patterns that must continue here:
  - Proper async mutex/session lifecycle handling on Rust side.
  - Clean sampler/session shutdown and signal clearing on failure/deactivation.
- Keep frontend behavior resilient to temporary runtime polling failures; never leave stale confirmed UI state visible.

### Git Intelligence Summary

Recent commits reinforce the path for this story:
- `016e1c5`: Added Delve DAP runtime sampling, runtime signal IPC, and Deep Trace session lifecycle.
- `5586c7b`: Added scoped Deep Trace activation flow and stale-request guards in editor shell.
- `ec8b0b7` and `d724c4d`: Show current cross-layer extension pattern (`types` + `client` + `commands` + focused tests).

Implementation guidance:
- Extend existing `EditorShell` orchestration, not a new global state architecture.
- Keep changes incremental and bounded to overlay rendering and runtime-state wiring.

### Latest Technical Information

- Delve releases currently show `v1.25.2` as latest, with several DAP stability fixes in recent releases; treat runtime-thread responses as dynamic and failure-prone.
  Source: https://github.com/go-delve/delve/releases
- Delve `dlv dap` command is documented as a headless TCP Debug Adapter Protocol server; UI-side code must tolerate transient DAP session disruption.
  Source: https://github.com/go-delve/delve/blob/master/Documentation/usage/dlv.md
- DAP latest spec stream is listed as `1.71.0`; thread metadata should be handled as adapter-driven protocol data, not hardcoded beyond required fields.
  Source: https://microsoft.github.io/debug-adapter-protocol/

### Project Context Reference

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 4, Story 4.3)
- Product requirements: `_bmad-output/planning-artifacts/prd.md` (FR4, FR5, FR7; AC-FR4/AC-FR7)
- Architecture constraints: `_bmad-output/planning-artifacts/architecture.md` (module boundaries, IPC, non-blocking runtime integration)
- UX constraints: `_bmad-output/planning-artifacts/ux-design-specification.md` (soft pulse, low noise, editor-first readability, reduced-motion)
- Global guardrails: `_bmad-output/project-context.md` (strict typing, local-only runtime, Rust-owned process management)

### Project Structure Notes

- `EditorShell` already owns mode and Deep Trace activation context; this is the correct location to orchestrate blocked confirmed rendering state.
- Existing overlays already support confidence labels; blocked confirmed behavior should extend these components, not duplicate them.
- Use existing runtime availability and fallback patterns to avoid regressions in static hinting.

## Dev Agent Record

### Agent Model Used

gpt-5.4

### Debug Log References

- Auto-selected first backlog story from sprint tracking: `4-3-blocked-signal-rendering-confirmed`.
- Loaded full context from epics, PRD, architecture, UX spec, project context, previous story (4.2), and recent git history.
- Red phase: added blocked-runtime tests in `EditorShell.inline-actions.test.tsx`; confirmed failures before implementation (`npm test -- src/components/editor/EditorShell.inline-actions.test.tsx`).
- Implemented frontend runtime polling path in `EditorShell` using existing `getRuntimeSignals` IPC, gated by `deep-trace` mode and scoped workspace/file guards.
- Implemented blocked runtime visual treatment in `TraceBubble` with `Confirmed` confidence + blocked indicator, including reduced-motion behavior.
- Added/updated tests:
  - `npm test -- src/components/editor/EditorShell.inline-actions.test.tsx src/components/overlays/TraceBubble.test.tsx` (pass)
  - `npm test` (pass: 17 files, 86 tests)
  - `npm run build` (pass)
- Quality checks: `npm run lint` not available (script missing).

### Completion Notes List

- Created comprehensive Story 4.3 implementation context with architecture-aligned guardrails and explicit anti-regression constraints.
- Included previous-story learnings and runtime-signal limitations to prevent false-precision rendering mistakes.
- Added deep-trace runtime signal polling and blocked wait-reason classification with bounded interval polling.
- Rendered confirmed blocked visual state in trace bubble with tokenized blocked pulse indicator.
- Added reduced-motion handling to suppress pulse animation when user preference requests reduced motion.
- Ensured stale async guardrails by checking active workspace/file before applying runtime signal updates.
- Added tests for: quick-insight no polling, deep-trace blocked rendering, blocked state clearing when evidence disappears, and reduced-motion pulse behavior.

### File List

- _bmad-output/implementation-artifacts/4-3-blocked-signal-rendering-confirmed.md
- src/components/editor/EditorShell.tsx
- src/components/editor/EditorShell.inline-actions.test.tsx
- src/components/overlays/TraceBubble.tsx
- src/components/overlays/TraceBubble.test.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-04-12: Created Story 4.3 context file and set status to `ready-for-dev`.
- 2026-04-12: Implemented blocked runtime signal rendering with confirmed confidence in Deep Trace mode, added reduced-motion handling, and expanded targeted test coverage.
- 2026-04-12: Story status advanced to `review` after regression tests and build validation passed.
