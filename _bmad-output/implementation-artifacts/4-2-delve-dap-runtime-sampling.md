# Story 4.2: Delve DAP Runtime Sampling

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Go developer,
I want runtime goroutine wait states sampled via Delve (DAP),
so that confirmed blocking signals can be surfaced.

## Acceptance Criteria

1. **Given** Deep Trace is active
   **When** Delve connects locally
   **Then** goroutine wait states are sampled
   **And** sampling remains local-only

## Tasks / Subtasks

- [x] Task 1: Implement Delve DAP client in Rust (`src-tauri/src/integration/delve.rs`) (AC: #1)
  - [x] Implement `DapClient` struct with async TCP connection handling to `dlv dap`.
  - [x] Implement DAP lifecycle: `initialize`, `launch` (with `debug` or `test` mode), and `disconnect`.
  - [x] Implement `threads` request to retrieve the current list of goroutines.
  - [x] Implement logic to parse `waitReason` and `status` from `Thread.name` (e.g., `Goroutine 1 [chan receive]`).
- [x] Task 2: Integrate Delve DAP sampling into the `activate_scoped_deep_trace` command (AC: #1)
  - [x] Spawn `dlv dap --listen=127.0.0.1:0` (random port) when Deep Trace is activated.
  - [x] Capture the dynamically assigned port and establish the DAP session.
  - [x] Manage the `dlv` process lifecycle within the existing `ProcessHandle` or a dedicated `DapSessionHandle`.
- [x] Task 3: Expose sampled runtime signals via Tauri IPC (AC: #1)
  - [x] Implement a polling or event-based mechanism in Rust to sample goroutines periodically (e.g., every 500ms) while in Deep Trace mode.
  - [x] Map Delve's goroutine info to the project's `SignalModel` (confidence: `confirmed`).
  - [x] Add `get_runtime_signals` command in `commands.rs` to allow the frontend to fetch latest confirmed signals.
- [x] Task 4: Ensure security and local-only constraints (AC: #1)
  - [x] Force `dlv dap` to listen only on `127.0.0.1`.
  - [x] Ensure all debug paths remain within the validated workspace root.
- [x] Task 5: Add targeted tests for Delve DAP integration (AC: #1)
  - [x] Add unit tests for `DapClient` using a mock DAP server response.
  - [x] Add integration tests verifying `dlv dap` process spawning and initial handshake.

## Dev Notes

### Developer Context (Read First)

- This story implements the "engine" for Deep Trace. Story 4.1 handled the UI activation; this story handles the actual data acquisition.
- Delve's DAP implementation maps Go goroutines to DAP `threads`. The wait state is typically embedded in the `name` field of the `Thread` object.
- Use `tokio::net::TcpStream` for the DAP connection and `tokio::process::Command` for spawning `dlv`.

### Technical Requirements

- Delve DAP `threads` response format: `Goroutine <ID> [<Status/WaitReason>] <Function>`.
- Supported wait reasons to extract: `chan receive`, `chan send`, `semacquire`, `select`, `sleep`, `IO wait`.
- The DAP connection must be established asynchronously and should not block the main Tauri thread.
- If `dlv` is not found in PATH, the system must fail gracefully and report "Runtime Unavailable" (as implemented in 4.1).

### Architecture Compliance

- **Module Boundary:** All Delve-specific logic resides in `src-tauri/src/integration/delve.rs`.
- **IPC Pattern:** Use typed `ApiResponse` for the new `get_runtime_signals` command.
- **Process Management:** Reuse patterns from `src-tauri/src/integration/process.rs` for child process handling.

### Library / Framework Requirements

- **Rust:** `serde`, `serde_json` for DAP message serialization.
- **Tauri:** `tauri::AppHandle` for emitting signals if using an event-based approach.

### File Structure Requirements

- `src-tauri/src/integration/delve.rs` (New)
- `src-tauri/src/integration/mod.rs` (Update)
- `src-tauri/src/ui_bridge/commands.rs` (Update)
- `src-tauri/src/ui_bridge/types.rs` (Update for runtime signal DTOs)

### Testing Requirements

- Verify DAP message parsing logic (especially `Thread` name parsing).
- Verify `dlv` process is killed on session end or app exit.
- Verify polling stops when Deep Trace is deactivated.
- Commands:
  - `cargo test --package goide --lib integration::delve`
  - `npm run build` (to ensure no IPC type regressions)

### Git Intelligence Summary

- `5586c7b` (Story 4.1) established the `activate_scoped_deep_trace` command and `mode` state in the frontend. This story should plug into that activation flow.
- `d724c4d` (Diagnostics) and `ec8b0b7` (Autocomplete) show the pattern for mapping external tool output (gopls) to internal models. Use a similar mapping layer for Delve.

### Latest Technical Information

- Delve DAP `Thread` name example: `"Goroutine 1 [chan receive] main.main"`.
- Latest Delve (`v1.25.2`) supports stable DAP over TCP.
- Go runtime status codes are mapped to human-readable strings by Delve.

### Project Context Reference

- Architecture: `_bmad-output/planning-artifacts/architecture.md` (Delve integration section)
- PRD: `_bmad-output/planning-artifacts/prd.md` (FR4, NFR7)
- Global Rules: `_bmad-output/project-context.md` (Local-only, non-blocking)

## Dev Agent Record

### Agent Model Used

gpt-5.4

### Debug Log References

- Story 4-2 identified from `sprint-status.yaml` backlog.
- Analyzed `epics.md`, `prd.md`, `architecture.md`, and Story 4.1 implementation.
- Researched Delve DAP protocol for goroutine wait state representation.
- Verified `src-tauri/src/integration/process.rs` for process management patterns.
- Implemented `src-tauri/src/integration/delve.rs` with DAP framing, request lifecycle, wait-reason parsing, and process listen-address discovery.
- Wired Deep Trace activation to spawn/handshake Delve, launch debug/test mode, and run 500ms background sampling.
- Added `get_runtime_signals` IPC command with typed DTO mapping and frontend IPC client/type updates.
- Added targeted Delve tests for wait-state parsing, mock DAP handshake, and process listen-port detection.
- Fixed pre-existing TypeScript test typing issue in `CodeEditor.test.tsx` so `npm run build` passes.

### Completion Notes List

- Created Story 4.2 implementation context with detailed DAP sampling requirements.
- Defined tasks for Rust-side Delve DAP client, process management, and IPC exposure.
- Included specific parsing logic for Delve's goroutine wait reasons.
- Added Delve DAP client with `initialize`, `launch`, `threads`, and `disconnect`, plus robust DAP message encoding/decoding.
- Added dedicated Deep Trace runtime session management (`DapSessionHandle`) and periodic goroutine sampling while Deep Trace is active.
- Added typed runtime signal IPC response (`get_runtime_signals`) mapped to confirmed confidence.
- Added targeted Delve tests for wait-state parsing, mock DAP handshake, and process listen-port detection.

### File List

- _bmad-output/implementation-artifacts/4-2-delve-dap-runtime-sampling.md
- src-tauri/src/integration/delve.rs
- src-tauri/src/integration/mod.rs
- src-tauri/src/ui_bridge/commands.rs
- src-tauri/src/ui_bridge/types.rs
- src-tauri/src/lib.rs
- src/lib/ipc/types.ts
- src/lib/ipc/client.ts
- src/components/editor/CodeEditor.test.tsx

## Change Log

- 2026-04-12: Implemented Delve DAP runtime sampling, Deep Trace session lifecycle management, runtime signal IPC exposure, and targeted tests; updated story status to `review`.
- 2026-04-12: Addressed code-review patch findings in `commands.rs` (compile fixes + sampler/session cleanup) and revalidated Rust test suite; updated story status to `done`.

### Review Findings

- [x] [Review][Patch] `stop_dap_session` moves `sampler_task` into `timeout` then reuses it, causing compile failure [src-tauri/src/ui_bridge/commands.rs:60]
- [x] [Review][Patch] `tokio::sync::Mutex::lock()` is treated as `Result`, causing type mismatch compile errors [src-tauri/src/ui_bridge/commands.rs:393]
- [x] [Review][Patch] Sampler exits on `threads()` failure without shutting down stored Delve process/session, risking orphan `dlv dap` processes [src-tauri/src/ui_bridge/commands.rs:422]
