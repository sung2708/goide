# Terminal Layout Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the bottom-panel overflow menu, eliminate closed-panel layout gaps, and keep the editor plus terminal inside one bounded workbench viewport.

**Architecture:** Keep the existing `BottomPanel` and workspace-owned shell session model, but make the terminal split explicitly collapsible so a closed panel contributes no separator or reserved height. Move log actions out of the overflow menu into direct inline buttons, and tighten `EditorShell` overflow ownership so the editor content scrolls inside the workbench instead of expanding the page.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, Vitest, Testing Library.

---

## File Structure

- Modify: `src/components/panels/BottomPanel.tsx`
  - Remove overflow-menu state and listeners.
  - Render log actions as explicit inline buttons.
  - Keep the clear-confirm dialog behavior unchanged.
- Modify: `src/components/editor/EditorShell.tsx`
  - Pass collapsed state into the terminal split.
  - Tighten workbench overflow classes so the editor area owns scrolling.
  - Keep the bottom panel mounted and preserve shell/log session behavior.
- Modify: `src/components/layout/ResizableSplit.tsx`
  - Add a `collapsed` prop so a closed split hides its separator and does not reserve layout space.
  - Keep existing resize behavior unchanged when expanded.
- Modify: `src/components/panels/BottomPanel.test.tsx`
  - Replace overflow-menu assertions with inline-action assertions.
- Modify: `src/components/editor/EditorShell.test.tsx`
  - Replace hide-panel menu interaction with direct inline action assertions.
- Modify: `src/components/editor/EditorShell.terminal.test.tsx`
  - Assert the terminal split does not participate in layout while closed.
  - Assert the no-file state stays compact.
  - Assert the workbench stays clipped when a file is open.
- Modify: `src/components/layout/ResizableSplit.test.tsx`
  - Cover collapsed-split behavior directly.

---

## Workstream 1 — Header actions and closed-panel layout

### Task 1: Remove the bottom-panel overflow menu and render inline log actions

**Files:**
- Modify: `src/components/panels/BottomPanel.tsx`
- Modify: `src/components/panels/BottomPanel.test.tsx`
- Modify: `src/components/editor/EditorShell.test.tsx`

- [ ] **Step 1: Write the failing tests for inline log actions and no overflow button**

```tsx
it("renders all applicable log actions inline and removes the overflow button", () => {
  render(
    <BottomPanel
      activeTab="logs"
      onActiveTabChange={vi.fn()}
      logEntries={[]}
      surfaceKey={null}
      workspacePath={null}
      isRunning={false}
      onRun={vi.fn()}
      onRunWithRace={vi.fn()}
      canRunWithRace
      onClear={vi.fn()}
      onClose={vi.fn()}
    />
  );

  expect(screen.queryByRole("button", { name: /more panel actions/i })).toBeNull();
  expect(screen.getByRole("button", { name: /run again/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /run race/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^clear$/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /hide panel/i })).toBeInTheDocument();
});

it("hides log-only actions on the shell tab", () => {
  render(
    <BottomPanel
      activeTab="shell"
      onActiveTabChange={vi.fn()}
      logEntries={[]}
      surfaceKey="workspace-shell"
      workspacePath="C:/workspace"
      isRunning={false}
      onRun={vi.fn()}
      onRunWithRace={vi.fn()}
      canRunWithRace
      onClear={vi.fn()}
      onClose={vi.fn()}
      onStop={vi.fn()}
    />
  );

  expect(screen.queryByRole("button", { name: /run again/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /run race/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /^clear$/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /hide panel/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /more panel actions/i })).toBeNull();
});
```

```tsx
it("opens and hides the terminal panel without using an overflow menu", async () => {
  const user = userEvent.setup();

  render(<EditorShell />);

  const bottomPanelEl = screen.getByTestId("bottom-panel");
  expect(bottomPanelEl.closest("[hidden]")).not.toBeNull();

  await user.click(screen.getByRole("button", { name: /show terminal panel/i }));
  expect(screen.getByTestId("bottom-panel").closest("[hidden]")).toBeNull();

  expect(screen.queryByRole("button", { name: /more panel actions/i })).toBeNull();
  await user.click(screen.getByRole("button", { name: /hide panel/i }));

  expect(screen.getByTestId("bottom-panel").closest("[hidden]")).not.toBeNull();
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail for the current overflow-menu implementation**

Run: `npm test -- src/components/panels/BottomPanel.test.tsx src/components/editor/EditorShell.test.tsx`
Expected: FAIL because `BottomPanel` still renders `More panel actions` and `EditorShell.test.tsx` still hides the panel through a menu item.

- [ ] **Step 3: Replace the overflow-menu implementation with inline log actions**

Replace the overflow-specific state/effects at the top of `BottomPanel.tsx` with only the state that is still required:

```tsx
const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
const [shellFitRequestKey, setShellFitRequestKey] = useState(0);
```

Add explicit visibility flags just before the return:

```tsx
const showRunAgain = activeTab === "logs" && !isRunning && onRun !== undefined;
const showRunRace =
  activeTab === "logs" && !isRunning && onRunWithRace !== undefined;
const showStop = activeTab === "logs" && isRunning && onStop !== undefined;
const showClear = activeTab === "logs" && onClear !== undefined;
const showHidePanel = activeTab === "logs" && onClose !== undefined;
```

Replace the current logs action block with direct buttons:

```tsx
{activeTab === "logs" && (
  <>
    {showRunAgain && (
      <button
        type="button"
        className="cursor-pointer rounded border border-[rgba(166,209,137,0.3)] bg-[rgba(166,209,137,0.08)] px-3 py-1 text-[12px] font-semibold text-[var(--green)] transition-colors duration-100 hover:bg-[rgba(166,209,137,0.16)]"
        onClick={onRun}
        title="Run the active Go file again."
      >
        Run Again
      </button>
    )}
    {showRunRace && (
      <button
        type="button"
        className="cursor-pointer rounded border border-[rgba(140,170,238,0.3)] bg-[rgba(140,170,238,0.08)] px-3 py-1 text-[12px] font-semibold text-[var(--blue)] transition-colors duration-100 hover:bg-[rgba(140,170,238,0.16)] disabled:cursor-not-allowed disabled:opacity-40"
        onClick={onRunWithRace}
        disabled={!canRunWithRace}
        title="Run the active Go file with race detection."
      >
        Run Race
      </button>
    )}
    {showStop && (
      <button
        type="button"
        className="cursor-pointer rounded border border-[rgba(231,130,132,0.3)] bg-[rgba(231,130,132,0.08)] px-3 py-1 text-[12px] font-semibold text-[var(--red)] transition-colors duration-100 hover:bg-[rgba(231,130,132,0.16)]"
        onClick={onStop}
        title="Stop the current run."
      >
        Stop
      </button>
    )}
    {showClear && (
      <button
        type="button"
        className="cursor-pointer rounded border border-[var(--border-subtle)] px-3 py-1 text-[12px] font-semibold text-[var(--subtext0)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
        onClick={() => setIsClearConfirmOpen(true)}
        title="Clear terminal output."
      >
        Clear
      </button>
    )}
    {showHidePanel && (
      <button
        type="button"
        className="cursor-pointer rounded border border-[var(--border-subtle)] px-3 py-1 text-[12px] font-semibold text-[var(--subtext0)] transition-colors duration-100 hover:bg-[var(--bg-hover)] hover:text-[var(--subtext1)]"
        onClick={onClose}
        title="Hide the terminal panel."
      >
        Hide Panel
      </button>
    )}
  </>
)}
```

Delete the `useRef` import, `isOverflowOpen` state, the click-outside `useEffect`, the escape-key `useEffect`, `hasOverflowItems`, and the entire `•••` menu subtree.

- [ ] **Step 4: Update the affected tests to match the new interaction model**

Keep the clear-confirmation tests, but open the dialog directly through the inline `Clear` button:

```tsx
await user.click(screen.getByRole("button", { name: /^clear$/i }));
expect(screen.getByRole("alertdialog", { name: /clear output\?/i })).toBeInTheDocument();
```

Update the hide-panel test in `EditorShell.test.tsx` to click the direct button:

```tsx
await user.click(screen.getByRole("button", { name: /hide panel/i }));
expect(screen.getByTestId("bottom-panel").closest("[hidden]")).not.toBeNull();
```

- [ ] **Step 5: Re-run the targeted tests and confirm they pass**

Run: `npm test -- src/components/panels/BottomPanel.test.tsx src/components/editor/EditorShell.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/panels/BottomPanel.tsx src/components/panels/BottomPanel.test.tsx src/components/editor/EditorShell.test.tsx
git commit -m "fix: inline terminal panel actions"
```

### Task 2: Make the terminal split collapse cleanly when the panel is closed

**Files:**
- Modify: `src/components/layout/ResizableSplit.tsx`
- Modify: `src/components/layout/ResizableSplit.test.tsx`
- Modify: `src/components/editor/EditorShell.tsx`
- Modify: `src/components/editor/EditorShell.terminal.test.tsx`

- [ ] **Step 1: Write the failing tests for collapsed split behavior and no closed-panel gap**

Add a direct `ResizableSplit` regression test:

```tsx
it("omits the separator hit-zone when the split is collapsed", () => {
  render(
    <ResizableSplit
      orientation="vertical"
      primary={<div data-testid="primary">primary</div>}
      secondary={<div data-testid="secondary">secondary</div>}
      size={0}
      defaultSize={180}
      minSize={0}
      maxSize={600}
      collapsed
      onResize={vi.fn()}
    />
  );

  expect(screen.queryByRole("separator")).toBeNull();
  expect(screen.getByTestId("primary")).toBeInTheDocument();
  expect(screen.getByTestId("secondary")).toBeInTheDocument();
});
```

Update the `ResizableSplit` mock inside `EditorShell.terminal.test.tsx` so the terminal split exposes whether it is collapsed:

```tsx
vi.mock("../layout/ResizableSplit", () => ({
  default: (props: Record<string, unknown>) => {
    const onResize = props.onResize as (size: number) => void;
    const isSidebarSplit = props.defaultSize === 240;
    const isCollapsed = Boolean(props.collapsed);
    return (
      <div
        data-testid={isSidebarSplit ? "sidebar-resizable-split" : "resizable-split"}
        data-orientation={props.orientation as string}
        data-size={String(props.size)}
        data-default-size={String(props.defaultSize)}
        data-collapsed={String(isCollapsed)}
        data-class-name={(props.className as string | undefined) ?? ""}
      >
        <div data-testid="split-primary">{props.primary as ReactNode}</div>
        {!isCollapsed && (
          <button
            type="button"
            onClick={() => onResize(456)}
            aria-label={isSidebarSplit ? "Resize sidebar" : "Resize terminal"}
          >
            Resize
          </button>
        )}
        <div data-testid="split-secondary">{props.secondary as ReactNode}</div>
      </div>
    );
  },
}));
```

Then add the `EditorShell` regression tests:

```tsx
it("does not render terminal split chrome while the bottom panel is closed", async () => {
  const user = userEvent.setup();
  render(<EditorShell />);

  await openWorkspaceAndShowExplorer(user);
  await user.click(await screen.findByRole("button", { name: /open mock file/i }));

  expect(screen.getByTestId("resizable-split")).toHaveAttribute("data-collapsed", "true");
  expect(screen.queryByRole("button", { name: /resize terminal/i })).toBeNull();
});

it("keeps the no-file workspace state compact while the terminal panel is closed", async () => {
  const user = userEvent.setup();
  render(<EditorShell />);

  await openWorkspaceAndShowExplorer(user);

  expect(screen.getByText(/workspace active/i)).toBeInTheDocument();
  expect(screen.getByTestId("resizable-split")).toHaveAttribute("data-collapsed", "true");
  expect(screen.queryByRole("button", { name: /resize terminal/i })).toBeNull();
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail before the split is collapsible**

Run: `npm test -- src/components/layout/ResizableSplit.test.tsx src/components/editor/EditorShell.terminal.test.tsx`
Expected: FAIL because `ResizableSplit` has no `collapsed` prop, still renders a separator at size `0`, and `EditorShell` does not pass collapsed state into the terminal split.

- [ ] **Step 3: Add a `collapsed` prop to `ResizableSplit` and hide its separator when collapsed**

Extend the props type:

```tsx
export type ResizableSplitProps = {
  orientation: SplitOrientation;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  size: number;
  defaultSize: number;
  minSize: number;
  maxSize: number;
  onResize: (size: number) => void;
  resizeAnchor?: "start" | "end";
  collapsed?: boolean;
  className?: string;
};
```

Destructure the new prop and compute the primary pane style:

```tsx
function ResizableSplit({
  orientation,
  primary,
  secondary,
  size,
  defaultSize,
  minSize,
  maxSize,
  onResize,
  resizeAnchor = "start",
  collapsed = false,
  className,
}: ResizableSplitProps) {
  const dragStartRef = useRef<{ pointerId: number; pointerPosition: number; size: number } | null>(null);
  const dragTargetRef = useRef<HTMLDivElement | null>(null);
  const isHorizontal = orientation === "horizontal";
  const resolvedSize = clamp(size, minSize, maxSize);
  const primaryStyle = collapsed
    ? isHorizontal
      ? { width: 0, minWidth: 0, maxWidth: 0 }
      : { height: 0, minHeight: 0, maxHeight: 0 }
    : isHorizontal
      ? { width: resolvedSize, minWidth: minSize, maxWidth: maxSize }
      : { height: resolvedSize, minHeight: minSize, maxHeight: maxSize };
```

Guard separator rendering in the JSX:

```tsx
<div className="min-h-0 min-w-0 overflow-hidden" style={primaryStyle} aria-hidden={collapsed}>
  {primary}
</div>
{!collapsed && (
  <div
    role="separator"
    aria-orientation={isHorizontal ? "vertical" : "horizontal"}
    aria-valuemin={minSize}
    aria-valuemax={maxSize}
    aria-valuenow={resolvedSize}
    tabIndex={0}
    data-testid="separator-hit-zone"
    className={cn(
      "relative z-50 shrink-0 select-none flex items-center justify-center outline-none focus-visible:bg-[var(--lavender)]",
      isHorizontal ? "w-5 cursor-col-resize" : "h-5 cursor-row-resize"
    )}
    style={{ touchAction: "none" }}
    onPointerDown={startDragging}
    onMouseDown={startMouseDragging}
    onDoubleClick={() => onResize(clamp(defaultSize, minSize, maxSize))}
    onKeyDown={handleKeyDown}
  >
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none shrink-0 bg-[var(--border-subtle)] transition-colors duration-100",
        isHorizontal ? "h-full w-px" : "h-px w-full"
      )}
    />
  </div>
)}
<div className="min-h-0 min-w-0 flex-1 overflow-hidden">{secondary}</div>
```

- [ ] **Step 4: Pass the collapsed state from `EditorShell` into the terminal split**

Update the terminal split call site in `EditorShell.tsx`:

```tsx
<ResizableSplit
  orientation={workspaceLayout.dockMode === "bottom" ? "vertical" : "horizontal"}
  className={
    workspaceLayout.dockMode === "bottom"
      ? "flex-1 flex-col-reverse"
      : "flex-1 flex-row-reverse"
  }
  size={isBottomPanelOpen ? workspaceLayout.terminalSize : 0}
  resizeAnchor="end"
  defaultSize={
    workspaceLayout.dockMode === "bottom"
      ? DEFAULT_WORKSPACE_LAYOUT.splitSizes.terminalBottom
      : DEFAULT_WORKSPACE_LAYOUT.splitSizes.terminalRight
  }
  minSize={isBottomPanelOpen ? 240 : 0}
  maxSize={workspaceLayout.dockMode === "bottom" ? 520 : 780}
  collapsed={!isBottomPanelOpen}
  onResize={handleTerminalPaneResize}
  primary={
    <div hidden={!isBottomPanelOpen} className="h-full min-h-0 min-w-0">
      <BottomPanel
        activeTab={bottomPanelTab}
        onActiveTabChange={setBottomPanelTab}
        logEntries={runOutput}
        surfaceKey={surfaceKey}
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
    </div>
  }
```

This keeps `BottomPanel` mounted, but removes the separator and reserved split size when the panel is closed.

- [ ] **Step 5: Re-run the targeted tests and confirm they pass**

Run: `npm test -- src/components/layout/ResizableSplit.test.tsx src/components/editor/EditorShell.terminal.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/ResizableSplit.tsx src/components/layout/ResizableSplit.test.tsx src/components/editor/EditorShell.tsx src/components/editor/EditorShell.terminal.test.tsx
git commit -m "fix: collapse terminal split when panel is closed"
```

### Task 3: Keep the editor and terminal inside one bounded workbench viewport

**Files:**
- Modify: `src/components/editor/EditorShell.tsx`
- Modify: `src/components/editor/EditorShell.terminal.test.tsx`

- [ ] **Step 1: Write the failing viewport-containment tests**

Add assertions that the workbench and active-file region clip overflow instead of allowing long editor content to grow the page:

```tsx
it("keeps the editor workbench clipped when a file is open", async () => {
  const user = userEvent.setup();
  render(<EditorShell />);

  await openWorkspaceAndShowExplorer(user);
  await user.click(await screen.findByRole("button", { name: /open mock file/i }));

  expect(screen.getByTestId("editor-workbench")).toHaveClass("overflow-hidden");
  expect(screen.getByTestId("editor-content-region")).toHaveClass("overflow-hidden");
  expect(screen.getByTestId("editor-active-file-region")).toHaveClass("overflow-hidden");
});
```

Keep the existing dock-mode and shell-stability tests in the same file unchanged; they are the regression coverage for panel persistence and docking behavior.

- [ ] **Step 2: Run the targeted test to verify it fails with the current class structure**

Run: `npm test -- src/components/editor/EditorShell.terminal.test.tsx`
Expected: FAIL because `editor-workbench` does not currently include `overflow-hidden`, and the content wrappers do not expose the bounded viewport contract.

- [ ] **Step 3: Tighten the `EditorShell` overflow ownership around the editor workbench**

Update the right-hand editor container wrapper:

```tsx
secondary={
  <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
```

Update the workbench section itself:

```tsx
<section
  data-testid="editor-workbench"
  className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--crust)] shadow-lg"
>
```

Add a testable content-region wrapper around the workbench body:

```tsx
<div
  data-testid="editor-content-region"
  className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4 md:p-5"
>
```

Add a testable active-file wrapper so the file content region is explicitly clipped:

```tsx
<div
  data-testid="editor-active-file-region"
  className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
>
```

Leave `CodeEditor.tsx` unchanged unless this test still fails after the `EditorShell` overflow fixes. Its container already uses `h-full min-h-0 w-full`, and the goal here is to tighten layout ownership, not rewrite editor scrolling.

- [ ] **Step 4: Re-run the targeted viewport test and then the full terminal-layout regression set**

Run: `npm test -- src/components/editor/EditorShell.terminal.test.tsx src/components/editor/EditorShell.test.tsx src/components/panels/BottomPanel.test.tsx src/components/layout/ResizableSplit.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the broader verification commands**

Run: `npm test -- src/components/editor/EditorShell.terminal.test.tsx src/components/editor/EditorShell.test.tsx src/components/panels/BottomPanel.test.tsx src/components/layout/ResizableSplit.test.tsx && npm run build`
Expected: PASS for Vitest and PASS for `tsc && vite build`.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/EditorShell.tsx src/components/editor/EditorShell.terminal.test.tsx
git commit -m "fix: constrain editor terminal workbench layout"
```

---

## Manual Verification

- [ ] Open the app with no workspace selected and confirm the empty state fills the workbench without a terminal gap.
- [ ] Open a workspace but do not open a file; confirm the “Workspace Active” state stays compact and no terminal separator is visible.
- [ ] Open a long Go file and confirm the editor scrolls inside the workbench while the page itself does not grow taller.
- [ ] Open the terminal panel, switch between bottom and right dock modes, and confirm resizing still works in both directions.
- [ ] On the `Logs` tab, click `Run Again`, `Run Race`, `Clear`, and `Hide Panel` directly without any `...` menu.
- [ ] Switch to the `Shell` tab and confirm log-only actions are hidden.

---

## Spec Coverage Check

- Overflow menu removed: covered by Task 1.
- Empty editor / closed terminal gap removed: covered by Task 2.
- Terminal stays inside bounded workbench viewport when files are long: covered by Task 3.
- Dock modes and shell/log session behavior preserved: covered by Task 2 existing regression tests plus Task 3 full regression run.
- No backend IPC or PTY lifecycle changes introduced: preserved by keeping `BottomPanel` mounted and limiting edits to frontend layout/action wiring.
