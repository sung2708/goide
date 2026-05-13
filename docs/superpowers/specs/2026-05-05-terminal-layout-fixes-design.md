# Terminal Layout Fixes Design

## Goal
Fix three UI problems in the editor terminal area:
- Remove the `More panel actions` overflow menu entirely.
- Eliminate the extra reserved vertical space that appears when no file is open.
- Keep the terminal visible inside the workbench viewport when a file is open, instead of letting long editor content push it below the fold.

The change should preserve the current terminal architecture, dock modes, and shell/log session behavior.

## Reported problems
### 1. Overflow menu adds unnecessary friction
The current logs header keeps secondary actions behind a `...` menu in [BottomPanel.tsx](src/components/panels/BottomPanel.tsx). For this workflow, the extra click does not add value and makes common actions slower to reach.

### 2. Empty editor state leaves a large unused gap
When no file is open, the current split layout can still reserve space for the terminal region. That makes the workbench look visually broken because the empty-state area and terminal split compete for the same vertical space.

### 3. Long editor content can visually push the terminal away
The editor workbench and terminal split are intended to live inside one constrained viewport, but the current flex/overflow behavior still allows the editor region to dominate vertical space. In practice, opening a long file can make the terminal feel like it moved below the visible workbench, forcing the user to scroll down to find it.

## Recommended approach
Keep the existing split-pane terminal model, but tighten the layout contract:
- The terminal remains a real split pane, not an overlay.
- The split only participates in layout when the panel is actually open.
- The editor body becomes the only scrollable area for file content.
- Logs actions become explicit inline buttons instead of overflow menu items.

### Why this approach
- Fixes all three reported issues without replacing the terminal architecture.
- Preserves bottom/right docking and current resize behavior.
- Avoids introducing overlay, z-index, or focus-management complexity.
- Keeps the shell/log views and PTY lifecycle untouched.

## Rejected alternatives
### Overlay terminal
Make terminal float above the editor and pin it to the viewport.
- Solves the “pushed below fold” symptom.
- Rejected because it changes interaction semantics, complicates docking, and introduces avoidable layering/focus issues.

### CSS-only patch on the current structure
Only tweak a few `overflow` or `min-height` classes.
- Low code churn.
- Rejected because the three issues come from layout ownership and panel participation in the split, not just one bad class.

## Design
### A. Bottom panel actions
[BottomPanel.tsx](src/components/panels/BottomPanel.tsx) will remove the overflow menu completely.

On the `Logs` tab, relevant actions become visible inline buttons in the header:
- `Run Again` when not running and `onRun` exists.
- `Run Race` when not running and race mode is available.
- `Stop` when a run is active.
- `Clear` when `onClear` exists.
- `Hide Panel` when `onClose` exists.

On the `Shell` tab, log-scoped actions remain hidden. Dock mode controls stay as they are.

This keeps the header predictable: the user can see all available actions without opening a menu.

### B. Terminal participation in layout
[EditorShell.tsx](src/components/editor/EditorShell.tsx) will treat the terminal split as conditional layout, not always-on layout.

Rules:
- When `isBottomPanelOpen === false`, the terminal split size should not reserve visible space.
- When no file is open, the editor empty state should occupy the main workbench area cleanly, without an extra terminal gap.
- Opening a workspace or switching files should not implicitly create unused terminal height.
- Running a file can still auto-open the panel, as it does today.

This keeps the panel available when intentionally opened, while preventing the closed-state split from shaping the page.

### C. Viewport ownership and scrolling
The editor workbench and terminal must both stay inside one bounded viewport.

Layout contract:
- The outer workbench wrapper remains `min-h-0` and `overflow-hidden`.
- The editor content region owns scrolling for file content.
- The terminal split owns its own height/width and stays inside the same flex container.
- The page itself should not become taller just because the active file is long.

In practice, the file scrolls inside [CodeEditor.tsx](src/components/editor/CodeEditor.tsx), while the terminal remains anchored inside the visible workbench split.

### D. Scope boundaries
Included:
- Removing the `...` overflow button and menu.
- Converting logs actions to inline controls.
- Fixing the no-file empty-state spacing.
- Fixing the editor/terminal viewport containment behavior.
- Updating affected component tests.

Not included:
- Changing shell session lifecycle.
- Reworking `Logs`/`Shell` tab behavior.
- Replacing split docking with overlay terminal UX.
- Any backend IPC or PTY changes.

## Testing strategy
### BottomPanel tests
Update [BottomPanel.test.tsx](src/components/panels/BottomPanel.test.tsx) to verify:
- The overflow button is no longer rendered.
- `Run Race`, `Clear`, and `Hide Panel` render inline when applicable.
- Shell tab still hides log-only actions.

### EditorShell tests
Update [EditorShell.terminal.test.tsx](src/components/editor/EditorShell.terminal.test.tsx) to verify:
- Closed terminal state does not leave a reserved terminal gap.
- No-file state keeps the main workbench compact.
- Opening a file does not make the terminal fall outside the bounded split layout.
- Existing dock mode and panel persistence behaviors still hold.

### Manual verification
- Open the app with no active file and confirm there is no extra blank terminal gap.
- Open a long Go file and confirm the terminal remains visible inside the workbench.
- Toggle the terminal open/closed and confirm layout stays stable.
- Confirm `Run Again`, `Run Race`, `Clear`, and `Hide Panel` are directly clickable without `...`.
- Confirm bottom/right dock modes still work.

## Implementation notes
- Prefer tightening the existing [EditorShell.tsx](src/components/editor/EditorShell.tsx) flex structure over introducing new wrapper abstractions.
- Prefer updating existing tests over adding broad new integration scaffolding.
- Keep the fix minimal and local to layout/action wiring unless a failing test proves a deeper change is necessary.
