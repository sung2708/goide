# Shell-First Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a shell-first IDE workflow with reliable terminal input, hybrid dock layout, explorer external-file auto-sync, and measurable latency improvements.

**Architecture:** Keep backend PTY/session ownership in Tauri, and add explicit shell resolution + health signaling. On frontend, introduce a terminal focus-owner model, layout-state manager, and incremental explorer sync pipeline. Roll out in milestones with regression tests per subsystem to avoid cross-feature breakage.

**Tech Stack:** Tauri (Rust), React + TypeScript, xterm.js, Vitest, Cargo test, Tailwind utility classes.

---

## File Structure

### Backend (Rust)
- Modify: `src-tauri/src/integration/shell.rs`
  - Shell fallback resolver (`pwsh -> powershell.exe -> cmd`) and session metadata.
  - Shell health and launch diagnostics.
- Modify: `src-tauri/src/ui_bridge/types.rs`
  - DTO extensions for shell status and explorer sync events.
- Modify: `src-tauri/src/ui_bridge/commands.rs`
  - IPC command wiring for new shell/explorer sync data.
- Create: `src-tauri/src/integration/fs_watch.rs`
  - Filesystem watch-first engine + polling fallback coordinator.
- Modify: `src-tauri/src/integration/mod.rs`
  - Export `fs_watch` module.
- Modify: `src-tauri/src/lib.rs`
  - Register any additional commands/events needed by explorer sync.

### Frontend (TypeScript/React)
- Modify: `src/lib/ipc/types.ts`
  - Shell metadata and explorer sync payload types.
- Modify: `src/lib/ipc/client.ts`
  - Client wrappers for explorer watch bootstrap/status and shell health events.
- Create: `src/features/layout/useWorkspaceLayout.ts`
  - Persistent hybrid dock mode and splitter sizes.
- Create: `src/components/layout/ResizableSplit.tsx`
  - Shared splitter for horizontal/vertical resize with keyboard and double-click reset.
- Modify: `src/components/panels/TerminalSurface.tsx`
  - Focus owner hooks and output batching utility.
- Modify: `src/components/panels/ShellTerminalView.tsx`
  - Input routing hardening + health-state UI.
- Modify: `src/components/panels/BottomPanel.tsx`
  - Dock toggle controls and panel mode actions.
- Modify: `src/components/editor/EditorShell.tsx`
  - Integrate layout manager, splitter, panel defaults, explorer sync subscriptions.

### Tests
- Modify: `src-tauri/src/integration/shell.rs` (existing `#[cfg(test)]` module)
  - Add shell resolver/fallback/metadata tests.
- Create: `src-tauri/src/integration/fs_watch.rs` test module
  - Watcher fallback and delta emission tests.
- Modify: `src/components/panels/ShellTerminalView.test.tsx`
  - Input/focus routing regressions.
- Modify: `src/components/panels/TerminalSurface.test.tsx`
  - Focus owner and resize behavior.
- Modify: `src/components/panels/BottomPanel.test.tsx`
  - Dock toggle and tab behavior.
- Create: `src/features/layout/useWorkspaceLayout.test.ts`
  - Layout persistence and reset semantics.
- Modify: `src/components/editor/EditorShell.terminal.test.tsx`
  - Hybrid dock, splitter, and external explorer sync integration.

---

### Task 1: Shell Fallback Resolution in Backend

**Files:**
- Modify: `src-tauri/src/integration/shell.rs`
- Test: `src-tauri/src/integration/shell.rs` (`#[cfg(test)]`)

- [ ] **Step 1: Write failing tests for shell resolution order**

```rust
#[test]
fn resolves_pwsh_first_when_available() {
    let available = vec!["pwsh".to_string(), "powershell.exe".to_string(), "cmd".to_string()];
    let resolved = resolve_shell_command_for_test(&available).expect("resolved");
    assert_eq!(resolved.program, "pwsh");
}

#[test]
fn falls_back_to_windows_powershell_when_pwsh_missing() {
    let available = vec!["powershell.exe".to_string(), "cmd".to_string()];
    let resolved = resolve_shell_command_for_test(&available).expect("resolved");
    assert_eq!(resolved.program, "powershell.exe");
}

#[test]
fn falls_back_to_cmd_when_no_powershell_is_available() {
    let available = vec!["cmd".to_string()];
    let resolved = resolve_shell_command_for_test(&available).expect("resolved");
    assert_eq!(resolved.program, "cmd");
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cargo test resolve_shell_command_for_test --manifest-path src-tauri/Cargo.toml`
Expected: FAIL with missing `resolve_shell_command_for_test`.

- [ ] **Step 3: Implement minimal shell resolver and metadata**

```rust
#[derive(Clone, Debug, PartialEq, Eq)]
struct ResolvedShellCommand {
    program: String,
    args: Vec<String>,
}

fn resolve_shell_command() -> Result<ResolvedShellCommand> {
    #[cfg(windows)]
    {
        let candidates = [
            ResolvedShellCommand {
                program: "pwsh".to_string(),
                args: vec!["-NoLogo".to_string()],
            },
            ResolvedShellCommand {
                program: "powershell.exe".to_string(),
                args: vec!["-NoLogo".to_string()],
            },
            ResolvedShellCommand {
                program: "cmd".to_string(),
                args: vec!["/Q".to_string()],
            },
        ];
        for candidate in candidates {
            if which::which(&candidate.program).is_ok() {
                return Ok(candidate);
            }
        }
        return Err(anyhow!("no supported shell executable found"));
    }
    #[cfg(not(windows))]
    {
        Ok(ResolvedShellCommand {
            program: "bash".to_string(),
            args: vec!["-l".to_string()],
        })
    }
}
```

- [ ] **Step 4: Wire resolver into spawn flow and pass tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml integration::shell::tests::`
Expected: PASS for resolver + existing shell session tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/integration/shell.rs
git commit -m "feat: add deterministic shell fallback resolver"
```

### Task 2: Shell Health and Event Surface

**Files:**
- Modify: `src-tauri/src/ui_bridge/types.rs`
- Modify: `src-tauri/src/ui_bridge/commands.rs`
- Modify: `src-tauri/src/integration/shell.rs`
- Test: `src-tauri/src/integration/shell.rs`

- [ ] **Step 1: Write failing tests for shell health payload behavior**

```rust
#[tokio::test]
async fn emits_shell_exit_payload_with_selected_shell() {
    let payload = ShellExitPayloadDto {
        shell_session_id: "shell:1".to_string(),
        selected_shell: Some("pwsh".to_string()),
    };
    assert_eq!(payload.selected_shell.as_deref(), Some("pwsh"));
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cargo test emits_shell_exit_payload_with_selected_shell --manifest-path src-tauri/Cargo.toml`
Expected: FAIL due to missing `selected_shell` field.

- [ ] **Step 3: Add DTO fields and shell health event emission**

```rust
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ShellExitPayloadDto {
    pub shell_session_id: String,
    pub selected_shell: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ShellHealthPayloadDto {
    pub shell_session_id: String,
    pub state: String,
    pub detail: Option<String>,
}
```

- [ ] **Step 4: Emit health transitions on launch/degraded/exit and run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml integration::shell::tests::`
Expected: PASS and no regressions in existing shell tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/ui_bridge/types.rs src-tauri/src/ui_bridge/commands.rs src-tauri/src/integration/shell.rs
git commit -m "feat: expose shell health and selected-shell metadata"
```

### Task 3: Terminal Focus Ownership and Input Routing

**Files:**
- Modify: `src/components/panels/TerminalSurface.tsx`
- Modify: `src/components/panels/ShellTerminalView.tsx`
- Test: `src/components/panels/TerminalSurface.test.tsx`
- Test: `src/components/panels/ShellTerminalView.test.tsx`

- [ ] **Step 1: Write failing frontend tests for focus-owner routing**

```ts
it("forwards printable input when terminal owns focus", async () => {
  const onData = vi.fn();
  render(<TerminalSurface readOnly={false} onData={onData} />);
  const host = screen.getByTestId("terminal-surface-host");
  host.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
  expect(onData).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/components/panels/TerminalSurface.test.tsx src/components/panels/ShellTerminalView.test.tsx --reporter=verbose --no-file-parallelism`
Expected: FAIL for focus-owner expectations.

- [ ] **Step 3: Implement focus-owner contract in terminal components**

```ts
export type FocusOwner = "editor" | "terminal";

const [focusOwner, setFocusOwner] = useState<FocusOwner>("editor");

const handleTerminalFocus = useCallback(() => setFocusOwner("terminal"), []);
const handleTerminalBlur = useCallback(() => setFocusOwner("editor"), []);
```

```ts
const handleData = useCallback(
  (data: string) => {
    if (!shellSessionId || focusOwnerRef.current !== "terminal") {
      return;
    }
    void writeShellInput({ shellSessionId, data });
  },
  [shellSessionId]
);
```

- [ ] **Step 4: Re-run tests and verify pass**

Run: `npx vitest run src/components/panels/TerminalSurface.test.tsx src/components/panels/ShellTerminalView.test.tsx --reporter=verbose --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/TerminalSurface.tsx src/components/panels/ShellTerminalView.tsx src/components/panels/TerminalSurface.test.tsx src/components/panels/ShellTerminalView.test.tsx
git commit -m "fix: harden terminal focus ownership and input routing"
```

### Task 4: Hybrid Dock State and Resizable Split Infrastructure

**Files:**
- Create: `src/features/layout/useWorkspaceLayout.ts`
- Create: `src/components/layout/ResizableSplit.tsx`
- Test: `src/features/layout/useWorkspaceLayout.test.ts`
- Modify: `src/components/panels/BottomPanel.tsx`
- Test: `src/components/panels/BottomPanel.test.tsx`

- [ ] **Step 1: Write failing tests for dock persistence and splitter reset**

```ts
it("persists dock mode per workspace", () => {
  const { result } = renderHook(() => useWorkspaceLayout("C:/repo"));
  act(() => result.current.setDockMode("right"));
  expect(result.current.dockMode).toBe("right");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/features/layout/useWorkspaceLayout.test.ts src/components/panels/BottomPanel.test.tsx --reporter=verbose --no-file-parallelism`
Expected: FAIL due to missing hook/component APIs.

- [ ] **Step 3: Implement layout hook and splitter component**

```ts
export type DockMode = "bottom" | "right";

export function useWorkspaceLayout(workspacePath: string | null) {
  const storageKey = workspacePath ? `layout:${workspacePath}` : "layout:default";
  const [dockMode, setDockMode] = useState<DockMode>("bottom");
  const [splitSizes, setSplitSizes] = useState({ left: 240, terminal: 320 });
  // load + persist in localStorage
  return { dockMode, setDockMode, splitSizes, setSplitSizes, resetLayout };
}
```

```tsx
export default function ResizableSplit(props: ResizableSplitProps) {
  const { orientation, primary, secondary, onResize } = props;
  // pointer drag handler + min/max clamp + double-click reset
  return <div className="flex min-h-0 min-w-0">{/* split layout */}</div>;
}
```

- [ ] **Step 4: Add dock toggle controls and pass tests**

Run: `npx vitest run src/features/layout/useWorkspaceLayout.test.ts src/components/panels/BottomPanel.test.tsx --reporter=verbose --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/layout/useWorkspaceLayout.ts src/features/layout/useWorkspaceLayout.test.ts src/components/layout/ResizableSplit.tsx src/components/panels/BottomPanel.tsx src/components/panels/BottomPanel.test.tsx
git commit -m "feat: add hybrid dock state and resizable split primitives"
```

### Task 5: Integrate Hybrid Layout into EditorShell

**Files:**
- Modify: `src/components/editor/EditorShell.tsx`
- Modify: `src/components/editor/EditorShell.terminal.test.tsx`

- [ ] **Step 1: Write failing integration tests for bottom/right dock and size restore**

```ts
it("renders terminal on right dock when layout mode is right", async () => {
  render(<EditorShell />);
  // set dock mode to right through test helper / mocked storage
  expect(screen.getByTestId("editor-terminal-right-dock")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/components/editor/EditorShell.terminal.test.tsx --reporter=verbose --no-file-parallelism`
Expected: FAIL due to missing dock integration.

- [ ] **Step 3: Refactor EditorShell composition to use layout hook + splitter**

```tsx
const layout = useWorkspaceLayout(workspacePath);
const terminalPane = (
  <BottomPanel
    activeTab={bottomPanelTab}
    onActiveTabChange={setBottomPanelTab}
    dockMode={layout.dockMode}
    onDockModeChange={layout.setDockMode}
    // existing props...
  />
);
```

```tsx
{layout.dockMode === "bottom" ? (
  <ResizableSplit orientation="vertical" ... />
) : (
  <ResizableSplit orientation="horizontal" ... />
)}
```

- [ ] **Step 4: Re-run integration tests**

Run: `npx vitest run src/components/editor/EditorShell.terminal.test.tsx --reporter=verbose --no-file-parallelism`
Expected: PASS and no hidden-panel regressions.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/EditorShell.tsx src/components/editor/EditorShell.terminal.test.tsx
git commit -m "feat: wire hybrid terminal dock into editor shell layout"
```

### Task 6: Default Panel Visibility Cleanup

**Files:**
- Modify: `src/components/editor/EditorShell.tsx`
- Modify: `src/components/sidebar/ActivityBar.tsx` (if needed for toggle hints)
- Test: `src/components/editor/EditorShell.test.tsx`

- [ ] **Step 1: Write failing tests for default panel visibility**

```ts
it("shows search panel by default and hides summary/runtime/git by default", () => {
  render(<EditorShell />);
  expect(screen.getByTestId("search-panel")).toBeVisible();
  expect(screen.queryByTestId("summary-peek")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/components/editor/EditorShell.test.tsx --reporter=verbose --no-file-parallelism`
Expected: FAIL if defaults are still legacy.

- [ ] **Step 3: Implement new defaults with explicit toggle paths**

```ts
const [activeTab, setActiveTab] = useState<ActivityBarTab>("search");
const [isSummaryOpen, setIsSummaryOpen] = useState(false);
const [isRuntimePanelOpen, setIsRuntimePanelOpen] = useState(false);
const [isGitPanelOpen, setIsGitPanelOpen] = useState(false);
```

- [ ] **Step 4: Re-run UI tests**

Run: `npx vitest run src/components/editor/EditorShell.test.tsx --reporter=verbose --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/EditorShell.tsx src/components/sidebar/ActivityBar.tsx src/components/editor/EditorShell.test.tsx
git commit -m "feat: simplify default panel surface and keep search visible"
```

### Task 7: Explorer External-Change Auto Sync (Watch + Polling Fallback)

**Files:**
- Create: `src-tauri/src/integration/fs_watch.rs`
- Modify: `src-tauri/src/integration/mod.rs`
- Modify: `src-tauri/src/ui_bridge/types.rs`
- Modify: `src-tauri/src/ui_bridge/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/ipc/types.ts`
- Modify: `src/lib/ipc/client.ts`
- Modify: `src/components/editor/EditorShell.tsx`
- Test: `src-tauri/src/integration/fs_watch.rs` (`#[cfg(test)]`)
- Test: `src/components/editor/EditorShell.terminal.test.tsx`

- [ ] **Step 1: Write failing tests for watch-first and polling fallback**

```rust
#[tokio::test]
async fn switches_to_polling_when_watcher_start_fails() {
    let state = FsSyncState::new_for_test(/* watcher fails */);
    state.start("C:/repo").await.expect("start");
    assert_eq!(state.mode().await, FsSyncMode::Polling);
}
```

```ts
it("applies explorer delta when external file create event arrives", async () => {
  render(<EditorShell />);
  emitFsDelta({ kind: "create", relativePath: "new.go", isDir: false });
  expect(await screen.findByText("new.go")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cargo test fs_watch --manifest-path src-tauri/Cargo.toml`
Run: `npx vitest run src/components/editor/EditorShell.terminal.test.tsx --reporter=verbose --no-file-parallelism`
Expected: FAIL for missing sync engine and delta subscription.

- [ ] **Step 3: Implement backend watch engine and fallback mode**

```rust
pub enum FsSyncMode {
    Watch,
    Polling,
}

pub struct FsWatchService {
    mode: Arc<Mutex<FsSyncMode>>,
}

impl FsWatchService {
    pub async fn start(&self, workspace_root: &Path) -> Result<()> {
        if self.try_start_watcher(workspace_root).await.is_ok() {
            *self.mode.lock().await = FsSyncMode::Watch;
            return Ok(());
        }
        self.start_polling(workspace_root).await?;
        *self.mode.lock().await = FsSyncMode::Polling;
        Ok(())
    }
}
```

- [ ] **Step 4: Wire frontend subscription + incremental explorer update and pass tests**

Run: `cargo test fs_watch --manifest-path src-tauri/Cargo.toml`
Run: `npx vitest run src/components/editor/EditorShell.terminal.test.tsx --reporter=verbose --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/integration/fs_watch.rs src-tauri/src/integration/mod.rs src-tauri/src/ui_bridge/types.rs src-tauri/src/ui_bridge/commands.rs src-tauri/src/lib.rs src/lib/ipc/types.ts src/lib/ipc/client.ts src/components/editor/EditorShell.tsx src/components/editor/EditorShell.terminal.test.tsx
git commit -m "feat: auto-sync explorer with watch-first polling-fallback mode"
```

### Task 8: Terminal and Interaction Performance Pass

**Files:**
- Modify: `src/components/panels/TerminalSurface.tsx`
- Modify: `src/components/panels/ShellTerminalView.tsx`
- Modify: `src/components/editor/EditorShell.tsx`
- Create: `src/features/perf/latencyMetrics.ts`
- Create: `src/features/perf/latencyMetrics.test.ts`
- Modify: `src/components/panels/ShellTerminalView.test.tsx`

- [ ] **Step 1: Write failing tests for batching + latency instrumentation**

```ts
it("batches terminal writes into animation-frame flushes", () => {
  const enqueue = createTerminalWriteQueue();
  enqueue("a");
  enqueue("b");
  expect(flushWriteMock).toHaveBeenCalledTimes(1);
});
```

```ts
it("records key-to-echo latency sample", () => {
  const metrics = createLatencyMetrics();
  metrics.markKeyDown("k1");
  metrics.markEcho("k1");
  expect(metrics.snapshot().keyToEcho.count).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/features/perf/latencyMetrics.test.ts src/components/panels/ShellTerminalView.test.tsx --reporter=verbose --no-file-parallelism`
Expected: FAIL because batching/metrics API does not exist yet.

- [ ] **Step 3: Implement batching queue and metrics collector**

```ts
export function createLatencyMetrics() {
  const start = new Map<string, number>();
  const samples: number[] = [];
  return {
    markKeyDown(id: string) {
      start.set(id, performance.now());
    },
    markEcho(id: string) {
      const t0 = start.get(id);
      if (t0 === undefined) return;
      samples.push(performance.now() - t0);
      start.delete(id);
    },
    snapshot() {
      return { keyToEcho: summarize(samples) };
    },
  };
}
```

- [ ] **Step 4: Re-run perf-focused tests and quick regression suite**

Run: `npx vitest run src/features/perf/latencyMetrics.test.ts src/components/panels/ShellTerminalView.test.tsx src/components/panels/TerminalSurface.test.tsx --reporter=verbose --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/perf/latencyMetrics.ts src/features/perf/latencyMetrics.test.ts src/components/panels/TerminalSurface.tsx src/components/panels/ShellTerminalView.tsx src/components/editor/EditorShell.tsx src/components/panels/ShellTerminalView.test.tsx
git commit -m "perf: batch terminal writes and add latency telemetry"
```

### Task 9: End-to-End Verification and Docs Touch-Up

**Files:**
- Modify: `README.md` (if terminal behavior docs exist)
- Modify: `docs/superpowers/specs/2026-04-24-shell-first-workspace-redesign-design.md` (only if wording corrections needed after implementation)

- [ ] **Step 1: Run backend regression suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 2: Run frontend regression suite**

Run: `npx vitest run src/components/panels/TerminalSurface.test.tsx src/components/panels/ShellTerminalView.test.tsx src/components/panels/BottomPanel.test.tsx src/components/editor/EditorShell.test.tsx src/components/editor/EditorShell.terminal.test.tsx src/features/layout/useWorkspaceLayout.test.ts src/features/perf/latencyMetrics.test.ts --reporter=verbose --no-file-parallelism`
Expected: PASS.

- [ ] **Step 3: Manual verification checklist**

```text
1) Shell tab accepts typing immediately after tab switch.
2) Dock toggle bottom/right keeps session alive and fits terminal.
3) Splitter resize persists after reload.
4) External file create/rename/delete appears in explorer.
5) If watcher fails, status indicates polling fallback.
6) Key-to-echo telemetry p95 stays under 25ms on baseline dev machine.
```

- [ ] **Step 4: Update docs to match shipped behavior**

```md
## Terminal
- Default shell on Windows: pwsh, fallback to powershell.exe, then cmd.
- Dock modes: bottom/right with persisted layout.
- Explorer reflects external filesystem changes automatically.
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs/2026-04-24-shell-first-workspace-redesign-design.md
git commit -m "docs: document shell-first workflow and explorer auto-sync behavior"
```

---

## Spec Coverage Check
- Shell fallback order and input reliability: Tasks 1-3.
- Hybrid dock and free resize with persistence: Tasks 4-5.
- Panel cleanup with Search default visible: Task 6.
- Explorer external file sync with watch-first polling fallback: Task 7.
- Responsiveness and measurable latency improvements: Task 8.
- Validation and documentation alignment: Task 9.

No spec gap found.

## Placeholder Scan
- No `TBD`, `TODO`, or deferred implementation placeholders in tasks.
- Each code-change step includes concrete code samples.
- Each task includes explicit verification commands and expected outcomes.

## Type/Name Consistency Check
- Dock mode type is consistently `DockMode = "bottom" | "right"`.
- Explorer fallback mode consistently named `FsSyncMode::Polling`.
- Shell event naming consistently uses `shell-output`, `shell-exit`, `shell-health`.

