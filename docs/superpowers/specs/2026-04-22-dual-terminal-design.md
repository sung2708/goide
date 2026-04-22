# Dual Terminal Design

## Goal
Add two bottom-panel terminal tabs:
- `Logs`: read-only run output with full ANSI color rendering.
- `Shell`: interactive terminal with a separate shell session per editor tab/session.

The design preserves the current run pipeline while adding a true interactive shell experience. In the first version, `Run` and `Shell` are fully independent. A later version may allow `Run` to execute inside the current shell session and mirror output into `Logs`.

## User Experience
### Bottom panel layout
- Replace the current single terminal presentation with two tabs: `Logs` and `Shell`.
- Keep the bottom panel action area, but scope actions to the active tab where appropriate.
- Default behavior after pressing `Run`: switch to `Logs` so the user immediately sees output.

### Logs tab
- Displays output from the existing run pipeline only.
- Is read-only.
- Preserves ANSI colors and text styling from process output.
- Keeps completed output visible until the user clears it or starts a new run, at which point the `Logs` view is replaced with the new run's output buffer.
- Supports existing controls such as clear and rerun.

### Shell tab
- Displays a fully interactive terminal.
- Accepts keyboard input and renders shell output in real time.
- Uses one shell session per editor tab/session.
- Restores the matching shell when the user switches editor tabs.
- Keeps shell state alive across bottom-panel tab switches and panel hide/show.

## Recommended approach
Use a shared terminal rendering layer for both tabs, but keep their lifecycles and backends separate.

### Why this approach
- Gives `Logs` and `Shell` a consistent visual and rendering model.
- Avoids coupling the current `Run` flow to interactive shell state too early.
- Keeps the first implementation focused and easier to test.
- Leaves room for a later optional mode where `Run` executes inside `Shell` and mirrors into `Logs`.

## Architecture
### Frontend
Introduce three focused UI responsibilities:

1. `BottomPanel`
   - Owns active bottom-panel tab state: `logs` or `shell`.
   - Routes actions and status badges for the active view.
   - Preserves existing panel open/close behavior.

2. `LogsTerminalView`
   - Owns a read-only terminal renderer instance.
   - Replays buffered run output into the renderer.
   - Writes new run events as they arrive.
   - Does not send input upstream.

3. `ShellTerminalView`
   - Owns an interactive terminal renderer instance.
   - Attaches to the shell session for the current editor tab/session.
   - Forwards user input to the backend.
   - Reacts to resize and focus events.

### Backend
Keep the current run pipeline and add a dedicated shell session manager.

1. Existing run pipeline
   - Continue using the current run process logic to execute `go run`.
   - Continue emitting per-line run events for stdout, stderr, and exit.
   - Do not route run execution through shell sessions in v1.

2. Shell session manager
   - Creates and tracks one interactive shell per editor tab/session.
   - Maps session ids to live terminal processes and their I/O bridges.
   - Supports create, attach, input, resize, detach, and dispose operations.
   - Keeps sessions alive when the UI detaches temporarily.

## State model
### Logs state
- `runId` remains the primary key for a run.
- Frontend stores a log buffer for the active run view.
- `LogsTerminalView` replays the current buffer on mount and appends incoming events live.
- Clearing logs only clears log-view state, not shell state.

### Shell state
- Each editor tab/session gets a stable `shellSessionId`.
- The frontend keeps a mapping from editor session id to shell session id.
- The backend keeps the live process and stream handles for each `shellSessionId`.
- Switching editor tabs swaps the attached shell session in the `Shell` tab without killing the previous shell.

## Data flow
### Run to Logs
1. User presses `Run`.
2. Frontend starts a new run using the existing run command path.
3. Backend emits `run-output` events line by line.
4. Frontend stores events in the log buffer for that run.
5. `LogsTerminalView` writes those events into the read-only terminal renderer.
6. On exit, the final status line remains visible for inspection.

### Shell interaction
1. User opens `Shell` on an editor tab/session.
2. Frontend asks the backend to ensure a shell exists for that editor session.
3. Backend creates the shell process if needed and returns or confirms the `shellSessionId`.
4. Frontend attaches the terminal view to that session.
5. Shell output streams back to the renderer.
6. User input is sent to the backend and written to the shell process.
7. If the user switches editor tabs, the frontend detaches from the old session and attaches to the new one.

## Lifecycle rules
### Logs
- Pressing `Run` moves focus to `Logs`.
- Each run produces its own output sequence.
- Output remains visible after completion until the user clears it or starts a new run, which replaces the current `Logs` buffer.
- Stopping a run only affects the run process.

### Shell
- Shell sessions are created lazily.
- Hiding the bottom panel does not destroy shell sessions.
- Switching between `Logs` and `Shell` does not destroy shell sessions.
- Closing the owning editor tab/session disposes the corresponding shell session.
- Unexpected shell termination puts the view into a disconnected state with a recreate action.

## Error handling
- If the terminal renderer fails to initialize, show a local fallback error inside the affected tab instead of breaking the editor shell.
- If ANSI parsing fails for a line, render the raw text for that line.
- If shell creation fails, report the failure only inside `Shell`; `Logs` and `Run` remain available.
- If a shell process exits unexpectedly, mark that session disconnected and allow recreation.
- Resizing the panel must refit the active terminal view without clearing buffered output.

## Testing strategy
### Frontend tests
- Tab switching between `Logs` and `Shell`.
- ANSI-colored log output renders correctly in `Logs`.
- `Run` opens or focuses `Logs`.
- Switching editor tabs restores the correct shell session.
- Stopping a run does not affect an active shell session.
- Hiding and re-showing the panel preserves shell session attachment behavior.

### Backend tests
- Shell session manager creates, reuses, detaches, and disposes sessions correctly.
- Run output events remain independent from shell session events.
- Session routing sends shell output to the correct `shellSessionId`.
- Closing an editor session disposes only its matching shell.

### Manual verification
- Run a program that emits multiple ANSI colors and confirm `Logs` preserves them.
- Interact with `Shell` using commands that require input.
- Switch between editor tabs and confirm each shell session is restored correctly.
- Stop a run while a shell remains active.
- Resize the bottom panel and confirm both terminal tabs refit correctly.

## Scope boundaries
### Included in v1
- Two bottom-panel tabs: `Logs` and `Shell`.
- ANSI-capable read-only log terminal.
- Interactive shell terminal.
- One shell session per editor tab/session.
- Independent `Run` and `Shell` behavior.

### Explicitly deferred
- Running `Run` inside the current shell session.
- Mirroring shell output into `Logs`.
- Shared command history or synchronization across shell sessions.
- Split-pane terminal layouts.
- Cross-workspace or persisted shell restoration after app restart.

## Implementation notes
- Replace the current plain text output rendering in the bottom panel with a terminal renderer abstraction that can operate in read-only and interactive modes.
- Keep the current run event contract unless implementation pressure clearly requires a parallel event channel for shell output.
- Prefer introducing focused shell session APIs instead of overloading the existing run process APIs.
