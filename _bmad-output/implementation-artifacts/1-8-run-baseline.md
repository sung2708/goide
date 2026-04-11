# Story 1.8: Run Baseline

Status: done

## Story

As a Go developer,
I want to run the current file and see the output,
So that I can verify that my fix or logic works as expected.

## Acceptance Criteria

1. **Trigger Run**: A "Run" button is available in the editor header (visible when a file is open).
2. **Execute Go**: Clicking "Run" executes `go run {active_file}` in the workspace directory.
3. **Capture Output**: Both `stdout` and `stderr` are captured and streamed to the UI.
4. **Bottom Panel**: The "Bottom Panel" automatically reveals and displays the console output in a scrollable, terminal-styled region.
5. **Session Management**: Repeated runs clear the previous output; only one run session is active at a time.
6. **Error Handling**: Visible feedback is provided if the go command fails to start or exits with a non-zero code.

## Tasks / Subtasks

- [x] Task 1: Rust Backend — process.rs module + run_workspace_file command
  - [x] 1a: Create `src-tauri/src/integration/process.rs` with `run_go_file` that spawns `go run` and emits output lines via Tauri events
  - [x] 1b: Register `pub mod process` in `src-tauri/src/integration/mod.rs`
  - [x] 1c: Implement `run_workspace_file` Tauri command in `commands.rs` accepting `AppHandle`
  - [x] 1d: Register `run_workspace_file` in `lib.rs` invoke_handler
- [x] Task 2: Frontend — BottomPanel receives and displays streamed output
  - [x] 2a: Add `run-output` event listener to `EditorShell.tsx`; manage `runOutput` / `isRunning` state
  - [x] 2b: Pass `runOutput`, `isRunning`, `onRun`, `onClear` props via `BottomPanel`
  - [x] 2c: Revamp `BottomPanel.tsx` into a scrollable terminal pane (mono font, auto-scroll)
  - [x] 2d: Add "Run" button to editor header in `EditorShell.tsx` (only when file is open)
  - [x] 2e: Add `runWorkspaceFile` to `src/lib/ipc/client.ts`
- [x] Task 3: StatusBar — show run status indicator
  - [x] 3a: Add `runStatus?: "idle" | "running" | "done" | "error"` prop to `StatusBar.tsx`
  - [x] 3b: Display run status label in status bar (right side)
- [x] Task 4: Tests
  - [x] 4a: Rust unit tests for `process.rs` (path validation, empty-path guard)
  - [x] 4b: Frontend vitest for `BottomPanel` (renders output, clears on demand)

### Review Findings
- [x] [Review][Patch] Run start failures are not surfaced to UI, leaving run state stuck [src-tauri/src/ui_bridge/commands.rs:83]
- [x] [Review][Patch] Shared process handle can report wrong exit and mix stale output across overlapping runs [src-tauri/src/integration/process.rs:83]
- [x] [Review][Patch] Async `run-output` listener can leak if component unmounts before `listen()` resolves [src/components/editor/EditorShell.tsx:266]

## Developer Context

- **Backend**: Implement `run_workspace_file` in `src-tauri/src/ui_bridge/commands.rs`.
- **Process Management**: Use `tokio::process::Command` in a new `src-tauri/src/integration/process.rs` module. Tokio is a transitive dep via Tauri — use `tauri::async_runtime::spawn` for async execution.
- **IPC Pattern**: Output streaming via Tauri events (`AppHandle::emit`). Event name: `run-output`. Frontend listens with `@tauri-apps/api/event`.
- **Event Payload**: `{ line: string, stream: "stdout" | "stderr" | "exit", exitCode?: number }`
- **Frontend**:
  - Update `EditorShell` to manage `isBottomPanelOpen` state and handle the "Run" event.
  - Revamp `BottomPanel.tsx` to include a scrollable `<pre>` or similar console area.
  - Update `StatusBar` to show run status.

### Technical Requirements
- Output should use JetBrains Mono or mono font for a terminal feel.
- Workspace security: call existing `resolve_scoped_path` equivalent for the file path before spawning.
- Only one `go run` process at a time — kill the previous one if "Run" is triggered again.

### Architecture Constraints (from architecture.md)
- Process spawning: Rust only — no frontend shell execution.
- IPC: only `Tauri commands` + `events`. Use `AppHandle::emit` pattern.
- Module placement: `src-tauri/src/integration/process.rs`.
- IPC boundary: `src-tauri/src/ui_bridge/commands.rs`.

## Dev Agent Record

### Completion Notes
- 2026-04-11: Starting fresh implementation. Using Tauri AppHandle events for streaming output.
- 2026-04-12: Implemented run baseline end-to-end: backend process execution with single-session management, frontend run output streaming panel, Run controls, and status-bar run indicator.
- 2026-04-12: Added frontend BottomPanel tests and stabilized EditorShell test environment by mocking Tauri event listener in test setup.
- 2026-04-12: Validation passed: `npm test`, `npm run build`, `cargo test`.

### File List
- `src-tauri/src/integration/process.rs` [NEW]
- `src-tauri/src/integration/mod.rs` [MODIFY]
- `src-tauri/src/ui_bridge/commands.rs` [MODIFY]
- `src-tauri/src/lib.rs` [MODIFY]
- `src-tauri/Cargo.toml` [MODIFY]
- `src-tauri/Cargo.lock` [MODIFY]
- `src/lib/ipc/client.ts` [MODIFY]
- `src/lib/ipc/types.ts` [MODIFY]
- `src/components/editor/EditorShell.tsx` [MODIFY]
- `src/components/panels/BottomPanel.tsx` [MODIFY]
- `src/components/panels/BottomPanel.test.tsx` [NEW]
- `src/components/statusbar/StatusBar.tsx` [MODIFY]
- `src/test/setup.ts` [MODIFY]

### Change Log
- 2026-04-11: Story 1.8 implementation started.
- 2026-04-12: Completed Story 1.8 implementation and verification; story moved to review.
- 2026-04-12: Addressed code review patch findings and finalized story status to done.
