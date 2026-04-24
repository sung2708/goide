# IDE-Grade Shell-First Redesign

## Goal
Deliver a near-release-candidate workbench redesign that feels closer to a polished desktop IDE: stable terminal behavior, durable layout rules, cleaner chrome, stronger mouse interactions, improved terminal rendering quality, and a final release-hardening pass.

This redesign should remove the current "web app stitched into an IDE frame" feel and replace it with a predictable desktop-style workbench model.

## Validated Product Decisions
- Delivery priority:
  1. Terminal and layout stability
  2. Terminal rendering quality
  3. UI simplification and debug/sidebar redesign
  4. Release hardening and warning cleanup
- Terminal session scope: **per workspace**.
- Default terminal cwd: **workspace root**.
- UI direction: **IDE-like conservative** rather than ultra-minimal.
- Editor layout rule: **editor always fills the workspace area**, regardless of file length.
- Debug affordance: **show a dedicated sidebar entry only when the current context supports debugging**.
- Panel controls: keep only a few primary controls visible; move secondary actions into an overflow/menu pattern.
- Mouse interaction target: **desktop IDE behavior** — hover where you interact, scroll/drag works without click gymnastics.
- Terminal technology strategy: **keep current stack only if it meets quality targets; changing renderer/library is allowed if the gain is clear**.
- Release target: **polished redesign with strict verification**, not just an incremental patch release.

## In Scope
- Redefine terminal lifecycle so opening or switching files does not remount or redirect the shell.
- Redefine workbench layout so short files and long files share the same stable structure.
- Remove mouse interaction regressions for scrolling, splitter dragging, and panel resizing.
- Simplify visible chrome in the editor shell, panel toolbar, and runtime/debug surfaces.
- Move debug into a clearer contextual navigation model.
- Improve terminal rendering quality, font behavior, theme alignment, and resize fidelity.
- Remove non-actionable backend/frontend warnings and tighten release verification before shipping.

## Out of Scope
- Replacing the main code editor component.
- Designing a modal/Vim editor.
- Adding large new IDE feature families unrelated to the workbench redesign.
- Cross-machine sync of layout or terminal preferences.
- Introducing multiple terminal/session modes beyond what is needed for a single polished workbench model.

## Problem Statement
The current shell-first implementation has several UX and architecture mismatches with a desktop IDE:
- Terminal identity is coupled too closely to file-opening flows, causing reload/remount behavior that feels wrong.
- Layout height behavior depends too much on content height, so short files leave awkward empty regions and make the workbench feel unfinished.
- Visible controls are overcrowded, making the UI noisy and harder to scan.
- Mouse interactions are blocked or inconsistent across panels, making resize and scroll feel broken.
- Debug controls are present, but the placement is not coherent with the rest of the navigation model.
- Terminal rendering looks noticeably less integrated than the rest of the IDE and shows font/theme mismatches.
- Release readiness is weakened by avoidable warnings and incomplete cleanup.

The redesign should fix these problems at the model level instead of layering more local patches on top.

## Design Principles
1. **Workspace-owned runtime surfaces**
   - Shell, logs, and debug surfaces belong to the workspace, not to individual files.
2. **Stable workbench geometry**
   - Layout structure must not collapse or stretch based on short-file content.
3. **Contextual chrome**
   - Show only the controls needed for the current context; secondary actions go behind menus.
4. **Desktop-style pointer behavior**
   - Hover, wheel, drag, resize, and selection must behave like a native IDE, not like a trapped web layout.
5. **Theming and rendering coherence**
   - Terminal visuals should feel like part of the IDE rather than an embedded foreign widget.
6. **Release quality over patch count**
   - This effort is judged by end-to-end polish and regression resistance, not by the number of features preserved.

## Architecture Overview
The redesign is organized around a single workbench model with four workstreams.

### Workstream 1 — Terminal and Layout Stability
Establish the stable workbench contract:
- terminal lifetime is scoped to the workspace;
- editor canvas always fills the center work area;
- docked panels are secondary surfaces with persistent geometry;
- file open/switch actions never remount terminal surfaces or mutate shell cwd automatically.

### Workstream 2 — Terminal Rendering Quality
Upgrade terminal visual and interaction quality:
- font fallback and cell metrics are explicit;
- color palette aligns with the IDE theme;
- resize/fit behavior is deterministic;
- the rendering stack is evaluated against acceptance criteria and may change if needed.

### Workstream 3 — Chrome Simplification and Contextual Debug
Reduce UI noise while preserving discoverability:
- move rarely used actions behind overflow or contextual menus;
- show debug navigation only when meaningful;
- simplify panel-level controls and make runtime state easier to parse.

### Workstream 4 — Release Hardening
Tighten ship readiness:
- remove non-actionable warnings;
- add missing regression tests;
- define a manual verification checklist for layout, terminal, mouse behavior, and debug affordances.

## Workbench Model

### 1. Runtime Surface Ownership
The shell is no longer treated as a file-bound panel.

Required behavior:
- Opening a file does not create a new shell session.
- Switching tabs/files does not reload the terminal.
- Changing the active file does not silently change shell cwd.
- The shell session remains attached to the current workspace until the workspace changes, the user explicitly resets it, or the app restarts.

Implication for actions:
- `Run`, `Run Race`, and `Debug` may use the active file as command input, but they must not redefine shell identity.
- The runtime pipeline may emit logs or commands into workspace-owned surfaces, but panel remounting is not allowed as a side effect of file navigation.

### 2. Default cwd Policy
- Terminal opens at the workspace root.
- If the user needs file-local execution context, that must be an explicit action such as "run current file", "debug current file", or a dedicated future command like "cd to current file folder".
- The design intentionally avoids implicit cwd mutation on file open because that diverges from desktop IDE expectations.

### 3. Layout Contract
The editor area is a full-height central canvas.

Required behavior:
- The editor column always fills the available workspace height.
- Short files keep the same editor shell geometry as long files.
- Empty area under a short file is treated as editor canvas, not as collapsed layout.
- Bottom and right dock modes are both supported and persist per workspace.
- Splitter sizes persist independently per dock mode.

This avoids the current broken feeling where short content makes the workbench look unfinished or visually detached from the terminal area.

### 4. Panel Geometry and Persistence
- Explorer/editor split remains independently resizable.
- Editor/panel split is resizable in both bottom and right dock modes.
- Splitter hit areas must be generous enough for desktop pointer use.
- Resize results persist per workspace.
- Reset-to-default behavior is allowed through an explicit action, not accidental double-click-only discovery.

## Interaction Model

### 1. Mouse and Pointer Behavior
Target behavior matches a desktop IDE:
- scrolling works in the hovered region without requiring repeated focus correction;
- splitter dragging is never blocked by overlays or competing pointer handlers;
- terminal selection and scroll are not stolen by parent containers;
- panel hover/focus logic does not disable wheel or drag in sibling surfaces.

The redesign should explicitly audit pointer event ownership across:
- editor canvas
- explorer tree
- terminal surface
- logs surface
- resize handles
- panel headers/toolbars

### 2. Focus Rules
- Keyboard focus and pointer focus must cooperate rather than compete.
- Pointer activity should not trigger shell reset or panel remount.
- Terminal focus owner rules should remain strict, but must not block mouse wheel, selection, or resize.

## Chrome Simplification

### 1. Sidebar Model
The sidebar should expose only primary navigation.

Planned baseline:
- Explorer remains primary.
- Search remains available.
- Git/runtime/other optional surfaces should not all appear permanently if they are not essential to the default workflow.
- Debug gets its own sidebar entry, but only appears when debugging is relevant in the current context.

"Relevant" means the workspace and active file state can support debug actions, not merely that the feature exists in the codebase.

### 2. Panel Toolbar Model
The current panel toolbar exposes too many controls at once.

Target model:
- keep tabs such as `Logs` and `Shell` visible;
- keep dock mode toggle visible if the panel is shown;
- keep only one or two high-priority contextual actions visible;
- move secondary actions such as clear, reset, alternate reruns, and advanced panel commands into an overflow menu.

Examples:
- In `Logs`, the visible primary action may be rerun-related.
- In `Shell`, shell-specific actions stay visible while log-only actions disappear.
- Destructive or rare actions should not occupy first-line toolbar real estate.

### 3. Status and Runtime Surfaces
Runtime status should be easier to read and less noisy:
- only show stateful badges and panels when they contain meaningful information;
- do not surface every diagnostic/control at once;
- prefer progressive disclosure over permanent chrome.

## Debug Navigation Redesign
Debug should stop feeling like a misplaced runtime footer action.

Target model:
- add a dedicated debug entry to the sidebar when the active context supports debugging;
- keep the debug panel itself hidden by default until the user enters debug flow;
- separate "debug navigation" from "runtime session status" so the UI communicates whether the user is configuring a debug action or observing runtime state.

This keeps debug discoverable without making it a constant visual distraction.

## Terminal Rendering Quality

### 1. Visual Targets
The terminal should visually match the IDE:
- font family and fallback chain align with the editor/theme defaults or a clearly defined terminal counterpart;
- glyph width, line height, and cursor rendering are stable;
- foreground/background colors blend with the default IDE theme;
- borders, background blocks, and empty-terminal states feel consistent with neighboring surfaces.

### 2. Behavioral Targets
- Resize should not leave stale dimensions, clipped rows, or delayed fit artifacts.
- Scrollback should feel smooth and should not fight parent containers.
- Font fallback should reduce broken glyph appearance and spacing issues.
- Theme changes, if supported later, should be able to reuse the same terminal token model.

### 3. Technology Evaluation Gate
The implementation plan should include an explicit keep-vs-change evaluation for the terminal stack.

Decision criteria:
- Can the current stack meet font, fit, theme, and interaction quality targets with reasonable effort?
- Are current rendering glitches caused by integration bugs or by library limitations?
- Would a renderer/library change simplify maintenance and improve consistency enough to justify migration cost?

The spec does not force a replacement, but it explicitly permits one if the evidence is strong.

## Data Flow Expectations

### File open / switch flow
1. User opens or switches to a file.
2. Editor state updates.
3. Workbench layout remains stable.
4. Runtime surfaces remain mounted.
5. Terminal session identity remains unchanged.

### Run / Run Race / Debug flow
1. User triggers an action from the active file.
2. Action resolves the current file/workspace context.
3. Runtime/debug command launches using that context.
4. Output and state appear in workspace-owned runtime surfaces.
5. No shell remount occurs.

### Panel layout flow
1. User changes dock mode or drags a splitter.
2. Layout manager updates in-memory geometry.
3. Geometry persists to workspace-scoped layout state.
4. Terminal fit/resync runs without visual collapse.

## Testing Strategy

### Automated frontend coverage
- opening a file does not remount shell/log surfaces;
- switching between short and long files preserves full-height editor geometry;
- wheel and pointer interactions work across explorer, editor, terminal, and splitters;
- panel toolbar hides context-irrelevant actions;
- debug sidebar entry appears only in debug-capable contexts;
- bottom/right dock state persists independently.

### Automated backend and integration coverage
- runtime/debug commands remain correct after the new workbench model;
- shell identity is stable across file switches;
- non-actionable warnings are removed or explicitly justified;
- release-facing warning budget is enforced by test/build expectations where practical.

### Manual verification checklist
- Open several files in the same workspace and confirm the shell does not reload.
- Open a very short file and a very long file and confirm layout remains visually stable.
- Scroll every main surface with the mouse wheel and confirm no area feels locked.
- Drag every splitter and confirm smooth resize with no hover/focus glitch.
- Confirm the debug sidebar entry appears only when a debug-capable file/context is active.
- Confirm terminal font, spacing, and colors feel integrated with the IDE.
- Confirm default chrome feels minimal but still discoverable.

## Release Hardening Requirements
- Remove backend warnings that are obsolete, redundant, or clearly dead.
- Review frontend warnings/noisy console output and clean them before release.
- Re-run focused regression suites for shell, layout, debug, runtime, and rendering behavior.
- Use a release checklist rather than ad-hoc confidence.

## Risks and Mitigations
- **Risk:** Fixing terminal remount behavior reveals hidden coupling in runtime actions.
  - **Mitigation:** make runtime surface identity explicit and test file-switch invariants directly.
- **Risk:** Aggressive UI cleanup hides too much functionality.
  - **Mitigation:** keep an IDE-like conservative baseline and move secondary actions behind visible overflow.
- **Risk:** Mouse fixes require touching several layers of event ownership.
  - **Mitigation:** audit pointer flow surface-by-surface and verify each boundary explicitly.
- **Risk:** Terminal rendering quality is limited by the current stack.
  - **Mitigation:** include a formal evaluation gate rather than assuming the current stack must remain.
- **Risk:** Scope expands into a generic full-product redesign.
  - **Mitigation:** keep the implementation plan organized around the four validated workstreams only.

## Success Criteria
- Opening or switching files never reloads the workspace terminal.
- Short files and long files share one stable workbench layout.
- Mouse wheel, drag, and resize interactions behave like a desktop IDE.
- The panel/header chrome is noticeably cleaner without losing key actions.
- Debug navigation is clearer and less visually noisy.
- Terminal rendering quality is judged acceptable against explicit visual criteria, or the stack decision is upgraded with evidence.
- Backend/frontend warning noise is reduced to a release-acceptable level.
- The redesign is testable as a near-release candidate rather than a best-effort UI pass.

## Implementation Shape
This spec should produce one implementation plan with four ordered workstreams:
1. Terminal and layout stability
2. Terminal rendering quality
3. UI simplification and debug/sidebar redesign
4. Release hardening and warning cleanup

That keeps the effort focused enough for one coordinated redesign while still allowing milestone-by-milestone execution and verification.
