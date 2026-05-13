# IDE-Grade Shell-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a near-release-candidate shell-first workbench that keeps one workspace-owned shell alive across file switches, maintains stable IDE-like layout geometry, simplifies noisy chrome, improves pointer behavior, and hardens the release.

**Architecture:** Keep runtime ownership in the Tauri backend, but change shell identity from file-scoped to workspace-scoped so file navigation no longer remounts the terminal. On the frontend, make `EditorShell` the single workbench orchestrator for dock geometry, contextual sidebar navigation, and runtime surface visibility, while `BottomPanel`, `ShellTerminalView`, `TerminalSurface`, and `ResizableSplit` become focused UI primitives with tighter contracts and regression coverage.

**Tech Stack:** Tauri (Rust), React 19 + TypeScript, xterm.js, Vitest, Cargo test, Tailwind utility classes.

---

## File Structure

### Backend
- Modify: `src-tauri/src/integration/shell.rs:17-39,166-217,360-363,515-696`
  - Rename shell identity from editor-scoped to workspace/runtime-surface-scoped.
  - Keep one shell session per workspace surface key.
  - Preserve replay behavior without file-coupled remount semantics.
- Modify: `src-tauri/src/ui_bridge/types.rs:433-450,500-513`
  - Rename DTO request field to `surface_key` and keep response shape aligned with frontend.
- Modify: `src-tauri/src/ui_bridge/commands.rs:2338-2351`
  - Pass the renamed field into `ensure_shell_session_inner`.

### Frontend Workbench
- Modify: `src/lib/ipc/types.ts:315-337`
  - Rename `editorSessionKey` request field to `surfaceKey`.
- Modify: `src/lib/ipc/client.ts:402-428`
  - Keep browser/test fallback behavior aligned with the new request field.
- Modify: `src/components/panels/ShellTerminalView.tsx:15-19,171-236,349-438`
  - Accept a workspace-owned shell key and stop treating file switches as session changes.
- Modify: `src/components/panels/BottomPanel.tsx:11-28,74-208`
  - Simplify toolbar chrome and pass the workspace-owned shell key through to the shell surface.
- Modify: `src/components/editor/EditorShell.tsx:418-488,2450-2465,2472-2661`
  - Replace file-coupled shell key derivation with workspace-owned runtime surface state.
  - Move debug controls into contextual sidebar navigation.
  - Drive dock-specific geometry and stable full-height editor composition.
- Modify: `src/components/sidebar/ActivityBar.tsx:25-60`
  - Add contextual debug tab rendering.
- Modify: `src/features/layout/useWorkspaceLayout.ts:3-21,38-83,85-136`
  - Persist splitter sizes independently for bottom/right dock modes.
- Modify: `src/components/layout/ResizableSplit.tsx:7-139`
  - Increase splitter hit area, add pointer capture, and prevent drag/wheel conflicts.
- Modify: `src/components/panels/TerminalSurface.tsx:8-22,84-182,201-210`
  - Tune terminal visual defaults and resize scheduling.

### Tests
- Modify: `src-tauri/src/integration/shell.rs` test module
  - Cover workspace-owned shell reuse semantics.
- Modify: `src-tauri/src/ui_bridge/types.rs` test module
  - Cover `surfaceKey` JSON serialization.
- Modify: `src/components/editor/EditorShell.terminal.test.tsx`
  - Replace file-scoped shell assertions with workspace-owned shell assertions.
  - Add dock-layout and stable-workbench assertions.
- Modify: `src/components/editor/EditorShell.debug.test.tsx`
  - Cover contextual debug tab visibility and moved controls.
- Modify: `src/components/panels/ShellTerminalView.test.tsx`
  - Cover stable shell surface across file switches and retry/replay behavior.
- Modify: `src/components/panels/BottomPanel.test.tsx`
  - Cover toolbar simplification and overflow actions.
- Modify: `src/components/panels/TerminalSurface.test.tsx`
  - Cover terminal constructor options and resize fit behavior.
- Modify: `src/features/layout/useWorkspaceLayout.test.ts`
  - Cover independent bottom/right splitter persistence.
- Create: `src/components/layout/ResizableSplit.test.tsx`
  - Cover pointer capture, keyboard resize, and reset behavior with the larger hit area.

### Docs / Release
- Modify: `README.md`
  - Document workspace-owned shell behavior, contextual debug tab, and dock persistence.

---

## Workstream 1 — Terminal and Layout Stability

### Task 1: Rename the shell IPC contract to a workspace surface key

**Files:**
- Modify: `src/lib/ipc/types.ts:320-325`
- Modify: `src/lib/ipc/client.ts:413-428`
- Modify: `src-tauri/src/ui_bridge/types.rs:435-438`
- Modify: `src-tauri/src/ui_bridge/commands.rs:2342-2347`
- Modify: `src-tauri/src/integration/shell.rs:33-39,166-217,360-363,515-557`
- Test: `src-tauri/src/ui_bridge/types.rs` test module
- Test: `src-tauri/src/integration/shell.rs` test module

- [ ] **Step 1: Write the failing tests for the renamed request field and surface-key store**

```rust
#[test]
fn ensure_shell_session_request_serializes_surface_key() {
    let dto = EnsureShellSessionRequestDto {
        workspace_root: "C:/workspace".to_string(),
        surface_key: "workspace-shell".to_string(),
        cwd_relative_path: None,
    };

    let json = serde_json::to_value(dto).expect("request serializes");
    assert_eq!(json["surfaceKey"], "workspace-shell");
    assert!(json.get("editorSessionKey").is_none());
}

#[tokio::test]
async fn ensure_shell_session_reuses_same_surface_key() {
    let store = Arc::new(Mutex::new(ShellSessionState::default()));

    let first = ensure_shell_session_for_test(&store, "C:/workspace", "workspace-shell", None)
        .await
        .expect("first shell session");
    let second = ensure_shell_session_for_test(&store, "C:/workspace", "workspace-shell", None)
        .await
        .expect("second shell session");

    assert_eq!(first.shell_session_id, second.shell_session_id);
    assert!(second.reused);
}
```

- [ ] **Step 2: Run the targeted tests to verify they fail for the expected reason**

Run: `cargo test ensure_shell_session_request_serializes_surface_key --manifest-path src-tauri/Cargo.toml && cargo test ensure_shell_session_reuses_same_surface_key --manifest-path src-tauri/Cargo.toml`
Expected: FAIL because `surface_key` / `surfaceKey` does not exist yet and the store is still named around `editor_session_key`.

- [ ] **Step 3: Rename the request field and backend mapping to `surfaceKey` / `surface_key`**

```ts
export type EnsureShellSessionRequest = {
  workspaceRoot: string;
  surfaceKey: string;
  cwdRelativePath?: string;
};
```

```ts
export async function ensureShellSession(
  request: EnsureShellSessionRequest
): Promise<ApiResponse<EnsureShellSessionResponse>> {
  if (!hasTauriInternals()) {
    return {
      ok: true,
      data: {
        shellSessionId: `shell:${request.surfaceKey}`,
        reused: false,
        replay: "",
      },
    };
  }
  return invoke<ApiResponse<EnsureShellSessionResponse>>("ensure_shell_session", {
    request,
  });
}
```

```rust
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnsureShellSessionRequestDto {
    pub workspace_root: String,
    pub surface_key: String,
    pub cwd_relative_path: Option<String>,
}
```

```rust
#[derive(Default)]
pub struct ShellSessionState {
    pub surface_to_shell: HashMap<String, String>,
    pub sessions: HashMap<String, ShellSessionHandle>,
}
```

- [ ] **Step 4: Wire the renamed field through the Tauri command and shell store**

```rust
pub async fn ensure_shell_session<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    request: EnsureShellSessionRequestDto,
) -> ApiResponse<EnsureShellSessionResponseDto> {
    match ensure_shell_session_inner(
        app,
        &request.workspace_root,
        &request.surface_key,
        request.cwd_relative_path.as_deref(),
    )
    .await
    {
        Ok(response) => ApiResponse::ok(EnsureShellSessionResponseDto {
            shell_session_id: response.shell_session_id,
            reused: response.reused,
            shell_health: response.shell_health,
            selected_shell: response.selected_shell,
            replay: response.replay,
        }),
        Err(error) => ApiResponse::err("shell_session_start_failed", error.to_string()),
    }
}
```

- [ ] **Step 5: Re-run the targeted backend tests and confirm they pass**

Run: `cargo test ensure_shell_session_request_serializes_surface_key --manifest-path src-tauri/Cargo.toml && cargo test ensure_shell_session_reuses_same_surface_key --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ipc/types.ts src/lib/ipc/client.ts src-tauri/src/ui_bridge/types.rs src-tauri/src/ui_bridge/commands.rs src-tauri/src/integration/shell.rs
git commit -m "refactor: scope shell sessions by runtime surface key"
```

### Task 2: Keep one workspace-owned shell alive across file switches

**Files:**
- Modify: `src/components/editor/EditorShell.tsx:2450-2465,2631-2661`
- Modify: `src/components/panels/BottomPanel.tsx:15-17,202-205`
- Modify: `src/components/panels/ShellTerminalView.tsx:15-19,171-236,349-438`
- Test: `src/components/editor/EditorShell.terminal.test.tsx`
- Test: `src/components/panels/ShellTerminalView.test.tsx`

- [ ] **Step 1: Write the failing frontend tests for a workspace-owned shell key**

```tsx
it("keeps the same shell session key when switching files in one workspace", async () => {
  const user = userEvent.setup();
  render(<EditorShell />);

  await openWorkspaceAndShowExplorer(user);
  await user.click(await screen.findByRole("button", { name: /open mock file/i }));
  await user.click(screen.getAllByRole("button", { name: /run active go file/i })[0]);

  await waitFor(() => {
    expect(capturedBottomPanelProps?.shellSessionKey).toBe("workspace-shell");
  });

  await user.click(screen.getByRole("button", { name: /open other file/i }));

  await waitFor(() => {
    expect(capturedBottomPanelProps?.shellSessionKey).toBe("workspace-shell");
  });
});

it("does not remount the bottom panel when switching files", async () => {
  const user = userEvent.setup();
  render(<EditorShell />);

  await openWorkspaceAndShowExplorer(user);
  await user.click(await screen.findByRole("button", { name: /open mock file/i }));
  await user.click(screen.getAllByRole("button", { name: /run active go file/i })[0]);
  const mountCountAfterFirstOpen = bottomPanelMountCount;

  await user.click(screen.getByRole("button", { name: /open other file/i }));

  expect(bottomPanelMountCount).toBe(mountCountAfterFirstOpen);
  expect(screen.getByTestId("shell-session-key")).toHaveTextContent("workspace-shell");
});
```

```tsx
it("does not reset the terminal surface when shellSessionKey is unchanged", async () => {
  const ensureShellSessionMock = vi.mocked(ipc.ensureShellSession);
  const { rerender } = render(
    <ShellTerminalView workspacePath="C:/workspace" shellSessionKey="workspace-shell" />
  );

  await waitFor(() => {
    expect(ensureShellSessionMock).toHaveBeenCalledWith({
      workspaceRoot: "C:/workspace",
      surfaceKey: "workspace-shell",
      cwdRelativePath: undefined,
    });
  });

  rerender(<ShellTerminalView workspacePath="C:/workspace" shellSessionKey="workspace-shell" />);

  expect(screen.queryByText(/open a file to start a shell session/i)).toBeNull();
  expect(ensureShellSessionMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the targeted frontend tests and verify they fail**

Run: `npm test -- src/components/editor/EditorShell.terminal.test.tsx src/components/panels/ShellTerminalView.test.tsx`
Expected: FAIL because the workbench still derives `editor:<relativePath>` and `ShellTerminalView` still resets around file-level identity.

- [ ] **Step 3: Replace file-scoped shell derivation with one workspace-owned key**

```ts
const shellSessionKey = workspacePath ? "workspace-shell" : null;
```

```tsx
<BottomPanel
  activeTab={bottomPanelTab}
  onActiveTabChange={setBottomPanelTab}
  logEntries={runOutput}
  shellSessionKey={shellSessionKey}
  workspacePath={workspacePath}
  dockMode={workspaceLayout.dockMode}
  onDockModeChange={workspaceLayout.setDockMode}
  onClose={() => setIsBottomPanelOpen(false)}
  isRunning={runStatus === "running"}
  onClear={handleClearOutput}
  onRun={handleRunFileStandard}
  onRunWithRace={handleRunFileWithRace}
  onStop={handleStopRun}
  canRunWithRace={runtimeAvailability !== "unavailable"}
/>
```

- [ ] **Step 4: Make `ShellTerminalView` depend on `shellSessionKey` instead of file identity**

```ts
type ShellTerminalViewProps = {
  workspacePath: string | null;
  shellSessionKey: string | null;
};
```

```ts
useEffect(() => {
  if (!workspacePath || !shellSessionKey) {
    setShellSessionId(null);
    setShellError(null);
    return;
  }

  let cancelled = false;

  const startSession = async () => {
    setShellError(null);
    const response = await ensureShellSession({
      workspaceRoot: workspacePath,
      surfaceKey: shellSessionKey,
      cwdRelativePath: undefined,
    });

    if (cancelled || !response.ok || !response.data) {
      if (!cancelled && !response.ok) {
        setShellError(response.error?.message ?? "Failed to start shell session.");
      }
      return;
    }

    setShellSessionId(response.data.shellSessionId);
    if (response.data.replay) {
      pendingReplayRef.current = response.data.replay;
    }
  };

  void startSession();
  return () => {
    cancelled = true;
  };
}, [workspacePath, shellSessionKey]);
```

- [ ] **Step 5: Remove file-driven cwd mutation from the shell panel boundary**

```tsx
<ShellTerminalView
  workspacePath={workspacePath}
  shellSessionKey={shellSessionKey}
/>
```

- [ ] **Step 6: Re-run the targeted frontend tests and confirm they pass**

Run: `npm test -- src/components/editor/EditorShell.terminal.test.tsx src/components/panels/ShellTerminalView.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/EditorShell.tsx src/components/panels/BottomPanel.tsx src/components/panels/ShellTerminalView.tsx src/components/editor/EditorShell.terminal.test.tsx src/components/panels/ShellTerminalView.test.tsx
git commit -m "fix: keep the workspace shell stable across file switches"
```

### Task 3: Persist dock geometry per dock mode and keep the editor canvas full-height

**Files:**
- Modify: `src/features/layout/useWorkspaceLayout.ts:5-21,38-83,85-136`
- Modify: `src/components/editor/EditorShell.tsx:488,2631-2666`
- Test: `src/features/layout/useWorkspaceLayout.test.ts`
- Test: `src/components/editor/EditorShell.terminal.test.tsx`

- [ ] **Step 1: Write the failing tests for independent bottom/right terminal sizes**

```ts
it("persists bottom and right terminal sizes independently", () => {
  const { result } = renderHook(() => useWorkspaceLayout("C:/workspace"));

  act(() => {
    result.current.setDockMode("bottom");
    result.current.setTerminalSize(360);
    result.current.setDockMode("right");
    result.current.setTerminalSize(540);
    result.current.setDockMode("bottom");
  });

  expect(result.current.terminalSize).toBe(360);

  act(() => {
    result.current.setDockMode("right");
  });

  expect(result.current.terminalSize).toBe(540);
});
```

```tsx
it("keeps the editor workbench mounted while switching dock modes", async () => {
  const user = userEvent.setup();
  render(<EditorShell />);

  await openWorkspaceAndShowExplorer(user);
  await user.click(await screen.findByRole("button", { name: /open mock file/i }));
  await user.click(screen.getAllByRole("button", { name: /run active go file/i })[0]);
  await user.click(screen.getByRole("button", { name: /dock right/i }));

  expect(screen.getByTestId("resizable-split")).toBeInTheDocument();
  expect(screen.getByTestId("mock-code-editor")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run: `npm test -- src/features/layout/useWorkspaceLayout.test.ts src/components/editor/EditorShell.terminal.test.tsx`
Expected: FAIL because the layout hook only stores one terminal size and `EditorShell` still reads one shared terminal dimension.

- [ ] **Step 3: Extend the layout hook to keep a separate terminal size per dock mode**

```ts
export type WorkspaceSplitSizes = {
  left: number;
  terminalBottom: number;
  terminalRight: number;
};

export const DEFAULT_WORKSPACE_LAYOUT = {
  dockMode: "bottom" as DockMode,
  splitSizes: {
    left: 240,
    terminalBottom: 320,
    terminalRight: 420,
  },
};
```

```ts
export function useWorkspaceLayout(workspacePath: string | null) {
  const storageKey = useMemo(() => storageKeyForWorkspace(workspacePath), [workspacePath]);
  const [dockMode, setDockModeState] = useState<DockMode>(() => readStoredLayout(storageKey).dockMode);
  const [splitSizes, setSplitSizesState] = useState<WorkspaceSplitSizes>(() => readStoredLayout(storageKey).splitSizes);

  const terminalSize = dockMode === "bottom" ? splitSizes.terminalBottom : splitSizes.terminalRight;

  const setTerminalSize = useCallback(
    (nextSize: number) => {
      setSplitSizesState((current) => {
        const next =
          dockMode === "bottom"
            ? { ...current, terminalBottom: nextSize }
            : { ...current, terminalRight: nextSize };
        persistLayout(storageKey, dockMode, next);
        return next;
      });
    },
    [dockMode, storageKey]
  );

  return {
    dockMode,
    setDockMode,
    splitSizes,
    terminalSize,
    setTerminalSize,
    resetLayout,
  };
}
```

- [ ] **Step 4: Make `EditorShell` read the dock-specific terminal size and keep the editor wrapper full-height**

```tsx
<ResizableSplit
  orientation={workspaceLayout.dockMode === "bottom" ? "vertical" : "horizontal"}
  className={workspaceLayout.dockMode === "bottom" ? "flex-1 flex-col-reverse" : "flex-1 flex-row-reverse"}
  size={isBottomPanelOpen ? workspaceLayout.terminalSize : 0}
  defaultSize={
    workspaceLayout.dockMode === "bottom"
      ? DEFAULT_WORKSPACE_LAYOUT.splitSizes.terminalBottom
      : DEFAULT_WORKSPACE_LAYOUT.splitSizes.terminalRight
  }
  minSize={isBottomPanelOpen ? 240 : 0}
  maxSize={workspaceLayout.dockMode === "bottom" ? 520 : 780}
  onResize={workspaceLayout.setTerminalSize}
  secondary={
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <section data-testid="editor-workbench" className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--crust)] shadow-lg">
        {/* existing header + editor body */}
      </section>
    </div>
  }
/>
```

- [ ] **Step 5: Re-run the targeted tests and confirm they pass**

Run: `npm test -- src/features/layout/useWorkspaceLayout.test.ts src/components/editor/EditorShell.terminal.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/layout/useWorkspaceLayout.ts src/features/layout/useWorkspaceLayout.test.ts src/components/editor/EditorShell.tsx src/components/editor/EditorShell.terminal.test.tsx
git commit -m "feat: persist independent dock geometry for the workbench"
```

### Task 4: Fix splitter drag ownership and wheel-friendly desktop interactions

**Files:**
- Modify: `src/components/layout/ResizableSplit.tsx:23-139`
- Create: `src/components/layout/ResizableSplit.test.tsx`
- Modify: `src/components/panels/BottomPanel.tsx:61-72,194-208`
- Modify: `src/components/panels/TerminalSurface.tsx:201-210`

- [ ] **Step 1: Write the failing tests for pointer capture, keyboard resize, and reset**

```tsx
it("captures the pointer while dragging the separator", async () => {
  const onResize = vi.fn();
  render(
    <ResizableSplit
      orientation="horizontal"
      primary={<div>Primary</div>}
      secondary={<div>Secondary</div>}
      size={320}
      defaultSize={320}
      minSize={240}
      maxSize={640}
      onResize={onResize}
    />
  );

  const separator = screen.getByRole("separator");
  const setPointerCapture = vi.fn();
  Object.assign(separator, { setPointerCapture });

  fireEvent.pointerDown(separator, { pointerId: 7, clientX: 320 });
  fireEvent.pointerMove(window, { clientX: 400 });

  expect(setPointerCapture).toHaveBeenCalledWith(7);
  expect(onResize).toHaveBeenCalledWith(400);
});

it("resets to the default size on double click", () => {
  const onResize = vi.fn();
  render(
    <ResizableSplit
      orientation="vertical"
      primary={<div>Primary</div>}
      secondary={<div>Secondary</div>}
      size={460}
      defaultSize={320}
      minSize={240}
      maxSize={640}
      onResize={onResize}
    />
  );

  fireEvent.doubleClick(screen.getByRole("separator"));
  expect(onResize).toHaveBeenCalledWith(320);
});
```

- [ ] **Step 2: Run the targeted splitter tests and verify they fail**

Run: `npm test -- src/components/layout/ResizableSplit.test.tsx`
Expected: FAIL because pointer capture is not used and the hit target is still the 1px separator itself.

- [ ] **Step 3: Add a larger hit target and pointer capture to `ResizableSplit`**

```tsx
const startDragging = useCallback(
  (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      pointerPosition: isHorizontal ? event.clientX : event.clientY,
      size: resolvedSize,
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
  },
  [handlePointerMove, isHorizontal, resolvedSize, stopDragging]
);
```

```tsx
<div className={cn("relative shrink-0", isHorizontal ? "w-3 -mx-1 cursor-col-resize" : "h-3 -my-1 cursor-row-resize")}>
  <div
    role="separator"
    aria-orientation={isHorizontal ? "vertical" : "horizontal"}
    aria-valuemin={minSize}
    aria-valuemax={maxSize}
    aria-valuenow={resolvedSize}
    tabIndex={0}
    className={cn(
      "absolute inset-1 rounded-full bg-[var(--border-subtle)] outline-none transition-colors duration-100 hover:bg-[var(--border-muted)] focus:bg-[var(--lavender)]",
      isHorizontal ? "cursor-col-resize" : "cursor-row-resize"
    )}
    onPointerDown={startDragging}
    onDoubleClick={() => onResize(clamp(defaultSize, minSize, maxSize))}
    onKeyDown={handleKeyDown}
  />
</div>
```

- [ ] **Step 4: Make the panel and terminal containers keep wheel/drag interactions local**

```tsx
<section
  id="bottom-panel"
  aria-label="Bottom panel"
  className={cn(
    "relative z-40 flex min-h-0 flex-col bg-[var(--mantle)]",
    dockMode === "right"
      ? "h-full border-l border-[var(--border-muted)]"
      : "max-h-[40vh] min-h-[11rem] border-t border-[var(--border-muted)]"
  )}
  data-testid="bottom-panel"
>
```

```tsx
<div
  ref={containerRef}
  data-testid="terminal-surface-host"
  className={className}
  style={{ width: "100%", height: "100%", touchAction: "none" }}
  onFocus={() => onFocusOwnerChange?.("terminal")}
  onBlur={() => onFocusOwnerChange?.("editor")}
/>
```

- [ ] **Step 5: Re-run the targeted splitter tests and confirm they pass**

Run: `npm test -- src/components/layout/ResizableSplit.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/ResizableSplit.tsx src/components/layout/ResizableSplit.test.tsx src/components/panels/BottomPanel.tsx src/components/panels/TerminalSurface.tsx
git commit -m "fix: restore desktop-style splitter and pointer behavior"
```

## Workstream 2 — Terminal Rendering Quality

### Task 5: Tune terminal appearance and deterministic fit behavior

**Files:**
- Modify: `src/components/panels/TerminalSurface.tsx:8-22,84-182`
- Test: `src/components/panels/TerminalSurface.test.tsx`
- Test: `src/components/panels/ShellTerminalView.test.tsx`

- [ ] **Step 1: Write the failing tests for terminal constructor defaults and resize fit**

```tsx
it("constructs xterm with the IDE-aligned terminal defaults", () => {
  render(<TerminalSurface readOnly />);

  expect(Terminal).toHaveBeenCalledWith(
    expect.objectContaining({
      fontSize: 13,
      lineHeight: 1.35,
      letterSpacing: 0,
      fontFamily: '"Cascadia Mono", "Cascadia Code", "Fira Code", monospace',
      scrollback: 10000,
      allowTransparency: false,
    })
  );
});

it("runs fit after mount and again after resize observer notifications", () => {
  render(<TerminalSurface readOnly />);

  expect(fitMock).toHaveBeenCalledTimes(1);
  resizeObserverCallback();
  vi.runAllTimers();
  expect(fitMock).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the targeted terminal tests and verify they fail**

Run: `npm test -- src/components/panels/TerminalSurface.test.tsx src/components/panels/ShellTerminalView.test.tsx`
Expected: FAIL because the current defaults and resize scheduling do not yet match the new acceptance targets.

- [ ] **Step 3: Tighten the terminal defaults to match the IDE visual baseline**

```ts
const DEFAULT_OPTIONS: TerminalCtorOptions = {
  convertEol: true,
  cursorBlink: true,
  allowTransparency: false,
  drawBoldTextInBrightColors: false,
  minimumContrastRatio: 4.5,
  fontSize: 13,
  lineHeight: 1.35,
  letterSpacing: 0,
  fontFamily: '"Cascadia Mono", "Cascadia Code", "Fira Code", monospace',
  theme: {
    background: "#11111b",
    foreground: "#cdd6f4",
    cursor: "#f5e0dc",
    selectionBackground: "#45475a",
  },
  cols: 120,
  rows: 40,
  scrollback: 10000,
};
```

- [ ] **Step 4: Make fit scheduling deterministic on mount and resize**

```ts
const fitTerminal = () => {
  try {
    fitAddon?.fit();
    if (terminal) {
      onResize?.(terminal.cols, terminal.rows);
    }
  } catch {
    // safe to ignore in test environments
  }
};

terminal.open(container);
window.requestAnimationFrame(fitTerminal);

resizeObserver = new ResizeObserver(() => {
  if (resizeFrameHandle !== null) {
    return;
  }
  resizeFrameHandle = window.requestAnimationFrame(() => {
    resizeFrameHandle = null;
    fitTerminal();
  });
});
```

- [ ] **Step 5: Re-run the targeted terminal tests and confirm they pass**

Run: `npm test -- src/components/panels/TerminalSurface.test.tsx src/components/panels/ShellTerminalView.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/TerminalSurface.tsx src/components/panels/TerminalSurface.test.tsx src/components/panels/ShellTerminalView.test.tsx
git commit -m "feat: improve terminal rendering defaults and fit stability"
```

## Workstream 3 — Chrome Simplification and Contextual Debug

### Task 6: Simplify the panel toolbar and move secondary actions into overflow

**Files:**
- Modify: `src/components/panels/BottomPanel.tsx:30-219`
- Test: `src/components/panels/BottomPanel.test.tsx`

- [ ] **Step 1: Write the failing tests for the simplified toolbar model**

```tsx
it("shows only primary log actions in the toolbar and moves secondary actions into overflow", async () => {
  render(
    <BottomPanel
      activeTab="logs"
      onActiveTabChange={vi.fn()}
      logEntries={[]}
      shellSessionKey="workspace-shell"
      workspacePath="C:/workspace"
      onRun={vi.fn()}
      onRunWithRace={vi.fn()}
      onClear={vi.fn()}
      onClose={vi.fn()}
    />
  );

  expect(screen.getByRole("button", { name: /run again/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /more panel actions/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /^hide$/i })).toBeNull();
});

it("hides log-only actions when the shell tab is active", () => {
  render(
    <BottomPanel
      activeTab="shell"
      onActiveTabChange={vi.fn()}
      logEntries={[]}
      shellSessionKey="workspace-shell"
      workspacePath="C:/workspace"
      onRun={vi.fn()}
      onRunWithRace={vi.fn()}
      onClear={vi.fn()}
      onClose={vi.fn()}
    />
  );

  expect(screen.queryByRole("button", { name: /run again/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /run race/i })).toBeNull();
});
```

- [ ] **Step 2: Run the targeted toolbar tests and verify they fail**

Run: `npm test -- src/components/panels/BottomPanel.test.tsx`
Expected: FAIL because `Clear` and `Hide` are still first-line buttons and the shell tab still shares the old toolbar shape.

- [ ] **Step 3: Keep only primary actions visible and add an overflow menu**

```tsx
const [isOverflowOpen, setIsOverflowOpen] = useState(false);
```

```tsx
{activeTab === "logs" && onRun && !isRunning && (
  <button type="button" className="..." onClick={onRun}>
    Run Again
  </button>
)}
{activeTab === "logs" && onStop && isRunning && (
  <button type="button" className="..." onClick={onStop}>
    Stop
  </button>
)}
<button
  type="button"
  aria-label="More panel actions"
  className="rounded border border-[var(--border-subtle)] px-3 py-1 text-[12px] text-[var(--subtext0)]"
  onClick={() => setIsOverflowOpen((open) => !open)}
>
  More
</button>
{isOverflowOpen && (
  <div role="menu" className="absolute right-3 top-full z-50 mt-2 min-w-[10rem] rounded-md border border-[var(--border-subtle)] bg-[var(--mantle)] p-1 shadow-lg">
    {activeTab === "logs" && onRunWithRace && !isRunning && (
      <button type="button" role="menuitem" className="..." onClick={onRunWithRace}>
        Run Race
      </button>
    )}
    {activeTab === "logs" && onClear && (
      <button type="button" role="menuitem" className="..." onClick={() => setIsClearConfirmOpen(true)}>
        Clear
      </button>
    )}
    {onClose && (
      <button type="button" role="menuitem" className="..." onClick={onClose}>
        Hide Panel
      </button>
    )}
  </div>
)}
```

- [ ] **Step 4: Re-run the targeted toolbar tests and confirm they pass**

Run: `npm test -- src/components/panels/BottomPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/BottomPanel.tsx src/components/panels/BottomPanel.test.tsx
git commit -m "feat: simplify panel chrome with overflow actions"
```

### Task 7: Add a contextual debug sidebar tab and move debug controls into it

**Files:**
- Modify: `src/components/sidebar/ActivityBar.tsx:25-60`
- Modify: `src/components/editor/EditorShell.tsx:461-473,2472-2627`
- Test: `src/components/editor/EditorShell.debug.test.tsx`

- [ ] **Step 1: Write the failing tests for contextual debug navigation**

```tsx
it("shows the debug activity item only when the active file can be debugged", async () => {
  const user = userEvent.setup();
  render(<EditorShell />);

  await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
  expect(screen.queryByRole("button", { name: /debug/i })).toBeNull();

  await user.click(await screen.findByRole("button", { name: /open mock file/i }));
  expect(await screen.findByRole("button", { name: /debug/i })).toBeInTheDocument();
});

it("renders debug controls only when the debug sidebar tab is active", async () => {
  const user = userEvent.setup();
  render(<EditorShell />);

  await user.click(screen.getAllByRole("button", { name: /open workspace/i })[0]);
  await user.click(await screen.findByRole("button", { name: /open mock file/i }));
  await user.click(await screen.findByRole("button", { name: /debug/i }));

  expect(screen.getByRole("button", { name: /start debug session/i })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /explorer/i }));
  expect(screen.queryByRole("button", { name: /start debug session/i })).toBeNull();
});
```

- [ ] **Step 2: Run the targeted debug tests and verify they fail**

Run: `npm test -- src/components/editor/EditorShell.debug.test.tsx`
Expected: FAIL because the sidebar still has no debug tab and the debug controls are always rendered in the fixed sidebar column.

- [ ] **Step 3: Add a contextual `debug` tab to the activity bar**

```ts
export type ActivityBarTab = "explorer" | "search" | "git" | "concurrency" | "debug";
```

```tsx
{showDebugTab && (
  <ActivityItem
    icon={<FontAwesomeIcon icon={faBug} />}
    active={activeTab === "debug"}
    onClick={() => onTabChange("debug")}
    title="Debug"
  />
)}
```

- [ ] **Step 4: Compute debug relevance in `EditorShell` and render debug controls only in the debug tab**

```ts
const showDebugTab =
  isDebugSessionRunning ||
  Boolean(workspacePath && activeFilePath && activeFilePath.toLowerCase().endsWith(".go"));

useEffect(() => {
  if (!showDebugTab && activeTab === "debug") {
    setActiveTab("explorer");
  }
}, [activeTab, showDebugTab]);
```

```tsx
{activeTab === "debug" && (
  <div className="flex flex-1 flex-col gap-4 p-4">
    <div className="space-y-1">
      <h3 className="text-xs font-bold uppercase text-[var(--overlay1)]">Runtime Session</h3>
      <p className="text-[11px] text-[var(--subtext0)]">
        {debugUiState === "stopping"
          ? "Stopping"
          : isDebugSessionRunning
          ? isDebugPaused
            ? "Paused"
            : "Running"
          : "Idle"}
      </p>
    </div>

    {!isDebugSessionBusy && (
      <button
        type="button"
        aria-label="Start debug session"
        className="rounded-md border border-[rgba(235,160,172,0.3)] px-3 py-2 text-[11px] font-semibold text-[var(--maroon)] hover:bg-[rgba(235,160,172,0.1)]"
        onClick={handleStartDebug}
        disabled={runStatus === "running" || isDebugSessionBusy}
      >
        Start Debug Session
      </button>
    )}

    {/* existing pause / continue / stop / step controls move here unchanged */}
  </div>
)}
```

- [ ] **Step 5: Re-run the targeted debug tests and confirm they pass**

Run: `npm test -- src/components/editor/EditorShell.debug.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/sidebar/ActivityBar.tsx src/components/editor/EditorShell.tsx src/components/editor/EditorShell.debug.test.tsx
git commit -m "feat: move debug controls into a contextual sidebar tab"
```

## Workstream 4 — Release Hardening

### Task 8: Update release-facing docs and run the redesign verification suite

**Files:**
- Modify: `README.md`
- Modify: any touched tests from Tasks 1-7 if verification exposes regressions

- [ ] **Step 1: Update the README terminal/workbench behavior notes**

```md
## Terminal

- Shell sessions are owned by the workspace and stay alive when you switch files.
- The shell starts in the workspace root by default.
- Bottom and right dock layouts keep separate persisted splitter sizes.
- The Debug sidebar entry appears only when the current context supports debugging.
```

- [ ] **Step 2: Run the focused frontend regression suite**

Run: `npm test -- src/components/editor/EditorShell.terminal.test.tsx src/components/editor/EditorShell.debug.test.tsx src/components/panels/BottomPanel.test.tsx src/components/panels/ShellTerminalView.test.tsx src/components/panels/TerminalSurface.test.tsx src/components/layout/ResizableSplit.test.tsx src/features/layout/useWorkspaceLayout.test.ts`
Expected: PASS.

- [ ] **Step 3: Run the backend regression suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 4: Run the production frontend build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Execute the manual verification checklist**

```md
- [ ] Open several files in one workspace and confirm the shell does not reload.
- [ ] Open a short file and a long file and confirm the editor keeps the same full-height workbench geometry.
- [ ] Drag the explorer/editor and editor/panel splitters in both dock modes and confirm smooth resize.
- [ ] Scroll the explorer, editor, logs, and shell without click gymnastics.
- [ ] Confirm the debug sidebar entry appears only for a debug-capable context.
- [ ] Confirm the bottom panel toolbar shows only primary actions and uses overflow for secondary actions.
- [ ] Confirm terminal font, spacing, cursor, and colors feel integrated with the IDE theme.
- [ ] Confirm there are no new non-actionable warnings in the browser console or backend test output.
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document the IDE-grade shell-first workbench"
```

---

## Spec Coverage Check

- **Workspace-owned runtime surfaces:** Tasks 1-2 remove file-coupled shell identity and keep one workspace shell alive across file switches.
- **Default workspace-root cwd policy:** Task 2 removes file-driven `cwdRelativePath` from the shell panel boundary.
- **Stable workbench geometry / full-height editor:** Task 3 moves terminal sizing to dock-specific layout state and keeps the editor wrapper full-height.
- **Desktop-style pointer behavior:** Task 4 adds pointer capture, bigger splitter hit areas, and container fixes for drag/wheel ownership.
- **Terminal rendering quality:** Task 5 tunes terminal defaults and deterministic fit scheduling.
- **Chrome simplification:** Task 6 reduces first-line panel controls and moves secondary actions into overflow.
- **Contextual debug sidebar:** Task 7 adds a debug activity item only when the current context supports it and relocates the controls.
- **Release hardening:** Task 8 updates README, runs frontend/backend/build verification, and records the manual checklist.

## Type / Naming Consistency Check

- The shell IPC request is consistently renamed to `surfaceKey` (TypeScript) / `surface_key` (Rust).
- The UI-facing prop remains `shellSessionKey` so panel and shell component names still describe what they hold.
- Layout state consistently uses `terminalBottom` / `terminalRight` plus derived `terminalSize`.
- Debug navigation consistently uses `ActivityBarTab = ... | "debug"` and `showDebugTab`.

## Placeholder Scan

- No `TODO`, `TBD`, or "implement later" placeholders remain.
- No step says "write tests" or "handle edge cases" without concrete code or commands.
- All code-editing steps include concrete snippets.
