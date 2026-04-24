# Shell-First Workspace Redesign

## Goal
Redesign the IDE interaction model around a shell-first workflow that feels fast and direct like nvim, while preserving the existing editor capabilities.

Primary outcomes:
- Stable interactive terminal with reliable keyboard input.
- Default shell selection chain on Windows: `pwsh -> powershell.exe -> cmd`.
- Hybrid terminal docking (`bottom` or `right`) with free resize and persistent layout.
- Cleaner default UI with only essential panels visible.
- Explorer auto-sync for external filesystem changes with watch-first and polling fallback.
- Measurable latency improvements for keypress, hover, autosuggest, and error rendering.

## Scope
### In scope
- Terminal input/focus architecture and backend session policy changes.
- Hybrid layout system and panel resizing.
- Default panel visibility changes:
  - visible: Explorer, Editor, Terminal, Search, Status bar
  - hidden by default: Summary, Runtime Topology, Git panel
- Explorer synchronization for out-of-IDE file creation/rename/delete.
- Performance instrumentation and targeted optimizations across terminal and interactive editor flows.

### Out of scope (this phase)
- Full modal editor emulation or Vim command language.
- Replacing existing code editor component.
- Cross-machine sync of layout/session preferences.

## Product Decisions (Validated)
- Priority sequence for rollout: shell stability -> layout flexibility -> performance -> broader UX cleanup.
- Default shell policy on Windows:
  1. `pwsh`
  2. `powershell.exe`
  3. `cmd`
- Terminal dock mode: hybrid, user-switchable between bottom and right.
- Default panel baseline includes Search panel.
- External filesystem sync strategy: realtime watch first, automatic polling fallback.

## Architecture
### 1. Shell Engine (Tauri backend)
- Keep per-editor-session terminal sessions, but centralize shell launch policy.
- Resolve shell command by probing available binaries in order:
  - `pwsh`
  - `powershell.exe`
  - `cmd /Q`
- Record selected shell per session in metadata for diagnostics and reconnect flows.
- Standardize session events:
  - `shell-output`
  - `shell-exit`
  - `shell-error`
  - `shell-health`
- Add lightweight health tracking to detect stalled stdin/pty behavior and surface retry affordance.

Windows shell startup requirements:
- Ensure ANSI-capable environment when possible.
- Configure startup flags/profile behavior to avoid breaking prompt rendering and history suggestions.
- Preserve backward compatibility by falling through to `powershell.exe`/`cmd` when `pwsh` is unavailable.

### 2. Terminal Core (frontend)
- Keep `TerminalSurface` as the shared xterm lifecycle wrapper, but extend it into an input-first core:
  - strict focus owner model (`editor | terminal`)
  - explicit keyboard routing policy
  - output write batching path
- Input routing rule:
  - when focus owner is `terminal`, printable keys and terminal control input go directly to `writeShellInput`.
  - only explicitly whitelisted app shortcuts bypass terminal.
- Maintain terminal continuity across tab switches and dock changes without losing scrollback.

### 3. Workspace Layout Manager
- Introduce dock state model:
  - `dockMode: "bottom" | "right"`
  - splitter sizes per mode
  - persisted per workspace.
- Provide resizable splits:
  - Explorer <-> Editor
  - Editor <-> Terminal (bottom mode: vertical split)
  - Editor <-> Terminal (right mode: horizontal split)
- Enforce min/max constraints and reset-to-default on splitter double-click.

### 4. Explorer Sync Engine
- Backend filesystem watcher emits normalized tree delta events for create/rename/delete.
- Frontend applies deltas incrementally to tree state.
- On watcher failure or unsupported state:
  - switch to polling fallback (1-2s interval)
  - expose degraded status badge
  - keep manual refresh command available.

## Data Flow
### Terminal input path
1. User focuses Shell view.
2. Focus owner set to `terminal`.
3. Key event reaches Terminal Core.
4. Input forwarded via IPC `writeShellInput`.
5. PTY writes echoed output back through `shell-output`.
6. Terminal Core batches write operations and renders.

### Dock switch / resize path
1. User toggles dock mode or drags splitter.
2. Layout manager updates in-memory layout state.
3. Terminal fit + backend `resizeShellSession` invoked.
4. Updated layout persisted for workspace restore.

### Explorer external-change path
1. File created outside IDE.
2. Watcher emits create event.
3. Frontend inserts node into current tree.
4. If watcher unavailable, polling detects diff and applies same delta API.

## Error Handling
- Shell launch failure:
  - attempt next shell in fallback chain.
  - if all fail, show actionable in-panel error with retry.
- Terminal input path failure:
  - mark session degraded.
  - keep UI responsive; allow retry without full workspace reload.
- Watcher failure:
  - auto-switch to polling mode.
  - provide manual refresh.
- Resize/fit failure:
  - keep previous dimensions and log non-blocking warning.

## Performance Plan
### Latency targets (p95)
- terminal key-to-echo: < 25ms
- hover response: < 60ms
- autosuggest first result: < 120ms

### Optimizations
- Terminal output batching/coalescing to reduce render churn.
- Avoid global React state updates for each output chunk.
- Debounce and cancel stale hover/autosuggest requests.
- Batch filesystem delta application to avoid full explorer rerenders.
- Use requestAnimationFrame scheduling for resize-heavy updates.

### Measurement
- Add low-overhead telemetry counters/timers for:
  - keypress-to-echo
  - hover-to-display
  - autosuggest request/response
  - FS event-to-tree-update
- Expose internal debug view for local validation.

## Testing Strategy
### Frontend
- Terminal accepts keyboard input after:
  - tab switch (`logs` <-> `shell`)
  - dock switch (`bottom` <-> `right`)
  - panel hide/show cycles
- Global shortcuts do not steal terminal typing unexpectedly.
- Layout persistence restores correct dock and splitter sizes.
- Explorer tree updates on external file create/rename/delete.

### Backend
- Shell fallback order resolves correctly based on available binaries.
- Session lifecycle events remain consistent across shell variants.
- Watcher failure triggers polling fallback.
- Polling fallback converges tree state correctly.

### Manual verification
- Validate color/prompt behavior in `pwsh`.
- Uninstall/disable `pwsh` in test environment and confirm fallback to `powershell.exe`, then `cmd`.
- Create files from external terminal and confirm explorer auto-updates.
- Stress terminal output and confirm UI remains responsive.

## Rollout Plan
1. Milestone 1: shell stability and input correctness.
2. Milestone 2: hybrid dock + free resize + persisted layout.
3. Milestone 3: performance pass with instrumentation.
4. Milestone 4: default UI cleanup and final polish.

Each milestone ships with focused tests and no cross-milestone coupling that blocks incremental release.

## Risks and Mitigations
- Risk: shell profile behavior differs across machines.
  - Mitigation: keep startup minimal, detect failures, fallback deterministically.
- Risk: aggressive keyboard interception breaks editor shortcuts.
  - Mitigation: strict shortcut allowlist and integration tests around focus ownership.
- Risk: high FS event volume causes explorer jank.
  - Mitigation: event batching and incremental tree patching.

## Success Criteria
- Shell input failures reproduce at 0% in regression suite.
- Dock switching and resizing remain stable without terminal reset artifacts.
- External file operations appear in explorer automatically.
- Measured latency meets targets on baseline development hardware.
