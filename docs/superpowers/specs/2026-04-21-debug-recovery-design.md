# Debug Recovery Design

Date: 2026-04-21
Project: GoIDE
Status: Draft approved in conversation, written for user review

## Context

GoIDE previously exposed a frontend debug experience, but the debug UI was disabled because the end-to-end flow was not reliable enough for real-world use. The user now wants the IDE to restore full debug capability, not just a partial or cosmetic re-enable. This restored flow must work for both simple Go applications and more realistic long-running server projects that may use `internal/...`, environment variables, configuration, and databases.

The user explicitly chose a “rebuild by layers” approach rather than merely re-enabling the old UI. That means the implementation should preserve useful existing Delve/DAP foundations where possible, but should re-establish the architecture around clearer boundaries:
- backend debug session service
- frontend debug controller/state layer
- debug UI layer

The user also chose these product requirements up front:
- the restored version should include full debug controls in the first release: Start, Stop, Continue, Pause, Step Over, Step Into, Step Out
- it must work for both small apps and realistic server-style Go projects
- when debug start fails, the IDE should show a dedicated modal error experience rather than only writing to terminal output

## Goals

1. Restore a reliable debug experience in the IDE.
2. Support both simple Go apps and realistic server-style package layouts.
3. Make debug target resolution correct for Go package/module semantics.
4. Restore breakpoint handling and step controls in a trustworthy way.
5. Surface debug start failures through a clean, user-facing modal.
6. Keep the architecture maintainable so debug can continue evolving later.

## Non-goals

This design does not include:
- attach-to-process support
- conditional breakpoints
- watch expressions / variable explorer beyond what already exists
- `launch.json`-style configuration profiles
- multiple concurrent debug sessions
- remote debugging

## Chosen approach

The selected approach is a layered rebuild:
- keep useful Delve/DAP backend pieces
- redesign the flow boundaries around explicit backend services and frontend state
- then re-enable the full frontend debug surface on top of those stabilized layers

This is intentionally more structured than simply flipping the old UI back on.

## Product behavior

### Entry points
The IDE should restore:
- a Debug action near the editor run controls
- runtime session controls in the existing debug/runtime area of the shell
- breakpoint toggling in the editor gutter

### Full control surface
The restored debug feature should include:
- Start debug session
- Stop session
- Continue
- Pause
- Step Over
- Step Into
- Step Out

### Error handling UX
If debug start fails, the IDE should show a dedicated modal instead of relying only on terminal output.

The modal should present:
- a short human-readable title
- a concise user-facing message
- optional expandable details if useful later

Typical error families to support:
- missing tooling (`dlv`, `go`)
- invalid/runnable target resolution failure
- build or launch failure
- Delve session startup failure

## Architecture

### Layer 1: Backend debug session service
The Rust/Tauri backend should own:
- debug target resolution
- Delve DAP process startup and teardown
- debugger control commands
- breakpoint synchronization
- normalized debug session state
- structured error production

The backend should not rely on the frontend to guess how Go package targets should be debugged.

### Layer 2: Frontend debug controller
The React shell should own:
- when debug is considered idle / starting / running / paused / errored
- session polling or refresh orchestration
- wiring debugger state into editor markers and runtime panels
- showing the dedicated failure modal
- clearing stale debug state on session end or failure

### Layer 3: Debug UI layer
The visible components should only render the state they are given:
- debug action button(s)
- runtime/debug toolbar
- runtime session panel
- breakpoint markers
- debug failure modal

This keeps UI refinements separate from session correctness logic.

## Debug target resolution

This is one of the most important design decisions.

The backend should resolve debug targets using Go package/module context, not single-file semantics. That means:
- if the active file belongs to `cmd/app`, debug should resolve that package target
- if the active file is the root runnable `main.go`, debug should resolve the root package
- if the active file is not part of a valid runnable package, the backend should return a structured error instead of trying to start anyway

The frontend should send enough information for backend resolution:
- workspace root
- active file relative path
- current breakpoints for relevant files

But the frontend should not attempt to build the final Delve command line itself.

## Session lifecycle

### Start
1. Frontend requests debug start for the active file context.
2. Backend resolves the package target.
3. Backend starts `dlv dap` and initializes the DAP session.
4. Backend applies known breakpoints.
5. Frontend transitions through `starting` to `running` when state is confirmed.

### Stop
1. User clicks Stop.
2. Frontend sends stop command.
3. Backend terminates the Delve session and child process safely.
4. Frontend clears session-specific state and returns to idle.

### Continue / Pause / Step
Frontend sends explicit commands for:
- continue
- pause
- step over
- step into
- step out

Backend performs the DAP command and returns success/failure, while frontend refreshes session state after the transition.

## Breakpoint model

Breakpoint behavior should support both pre-session and active-session usage.

### Before a session starts
- breakpoint state may be edited in the gutter
- frontend stores the desired breakpoint set

### When a session starts
- backend applies those breakpoints to Delve

### While session is active
- toggling a breakpoint should sync immediately with the backend session
- frontend should still reflect breakpoints even if debug state polling is in flight

## Frontend state model

The frontend debug controller should explicitly model states such as:
- idle
- starting
- running
- paused
- stopping
- failed

This should prevent ambiguous UI transitions like showing pause controls before a session is really active, or leaving stale current-line markers after a failed start.

## Error handling

### Start-time errors
Errors at debug start should surface through the dedicated modal. The modal copy should be user-facing and not leak internal transport prefixes or raw backend formatting.

### Runtime errors
Errors while already debugging should still be visible in the debug/runtime area, but they should also transition the session state cleanly so the IDE does not appear stuck.

### Structured backend errors
The backend should expose stable error codes so the frontend can choose the right UX while still showing readable messages.

## Testing strategy

### Backend tests
Backend tests should cover:
- target resolution for root package and `cmd/...` package layouts
- rejection of invalid/non-runnable targets
- Delve launch failure handling
- session start and stop behavior
- control command behavior for continue/pause/step
- breakpoint pre-apply and active-session sync paths

### Frontend tests
Frontend tests should cover:
- debug button visibility and disabled states
- modal error rendering on start failure
- control toolbar rendering across session states
- breakpoint UX in the editor shell
- state transitions idle → starting → running → paused → stopped / failed

### Manual validation
Manual validation should include:
1. debug a simple runnable `main.go`
2. debug a `cmd/app` project layout
3. debug a realistic server process that stays running
4. stop a running debug session
5. hit breakpoints successfully
6. continue and pause correctly
7. step over / into / out correctly
8. verify failure modal when `dlv` is unavailable or target is invalid
9. verify editor execution-line state clears correctly after stop/failure

## Rollout scope

### In scope
- full debug UI restored
- start/stop session flow
- breakpoint sync
- continue/pause/step controls
- runtime session panel operational again
- modal error flow for debug start failures

### Out of scope
- attach to existing process
- advanced variable/watch tooling
- conditional breakpoints
- multi-session debugging
- launch profile management

## Why this design

The user explicitly rejected a partial rollback or a minimal re-enable and wants full debug restored. A layered rebuild is the safest way to satisfy that request without simply reviving the old brittle flow. It preserves useful existing infrastructure while making the rebuilt debug system easier to reason about, test, and evolve.

## Open questions resolved

These decisions are already fixed by the conversation:
- restore full debug controls now, not in phases
- support both simple apps and real server-style Go projects
- use a dedicated modal for start failures
- rebuild by layers rather than just unhiding the old UI

## Implementation readiness check

This spec is focused enough for a single implementation plan. It stays within one feature family, avoids unrelated Git/runtime work, and gives clear backend/frontend boundaries for execution.