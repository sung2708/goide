---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - C:\Users\t15\Training\goide\_bmad-output\planning-artifacts\prd.md
  - C:\Users\t15\Training\goide\_bmad-output\planning-artifacts\architecture.md
  - C:\Users\t15\Training\goide\_bmad-output\planning-artifacts\ux-design-specification.md
---

# goide - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for goide, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Open a Go workspace, render Go source files with syntax highlighting, limit analysis to the active file, and detect concurrency constructs (`chan`, `select`, `Mutex`, `WaitGroup`) via gopls.
FR2: Show Quick Insight overlays on hover, enforce density guard, degrade to predicted static hints when runtime is unavailable, and display confidence labels.
FR3: Click-to-jump to counterpart sender/receiver in the same file, render causal flow lines, and clear highlights within 16ms on exit.
FR4: Activate Deep Trace scoped to current flow, sample goroutine wait states via Delve (DAP), flag blocked ops, and correlate to causal counterparts.
FR5: Maintain static hints on runtime failure and override predicted signals with confirmed runtime signals at the same location.
FR6: Keep editor dominant (70-80% width), bottom panel hidden by default, right summary panel collapsed by default, and right panel text-only.
FR7: Render dotted underline hints, soft pulse for blocked ops, thin causal connectors, trace bubbles with wait time + confidence, and clear overlays immediately on intent end.
FR8: Expose mode and runtime availability in status bar and enable jump-to-counterpart from summary panel items.
FR9: Support basic code editing (typing, save, undo/redo) to enable the "Fix" loop of the Concurrency Lens.
FR10: Integrate LSP diagnostics (error/warning squiggles) to provide immediate feedback during code modification.
FR11: Provide a baseline execution capability (`go run/test`) with race detector integration for real-world verification.

### NonFunctional Requirements

NFR1: UI interaction updates under 16ms.
NFR2: Cold start to interactive under 1.5 seconds.
NFR3: Baseline memory footprint under 300MB.
NFR4: Static hinting remains operational even if runtime trace crashes.
NFR5: Visual density low; no persistent overlays that reduce readability.
NFR6: Motion limited to functional transitions (fade, soft pulse only).
NFR7: Delve DAP execution strictly local (no external network).

### Additional Requirements

- Initialize project via official `create-tauri-app` (React + TypeScript template).
- Tauri IPC only; typed request/response models; no external API in MVP.
- No database in MVP; in-memory signal model + minimal local settings file.
- Local-only permissions; no auth or encryption in MVP.
- Rust-only process spawning; no frontend shell execution.
- Manual builds per platform; no CI/CD in MVP.
- Maintain module boundaries: `core`, `integration`, `ui_bridge` in Rust; `features/concurrency`, `components`, `lib/ipc` in TS.

### UX Design Requirements

UX-DR1: Implement Catppuccin Mocha palette tokens with defined signal accents (predicted/likely/confirmed/blocked/warning).
UX-DR2: Use JetBrains Mono for code and Geist/IBM Plex Sans for UI at 13px base size.
UX-DR3: Apply 4px spacing system and 4px border radius across UI.
UX-DR4: Ensure WCAG AA contrast for all UI text.
UX-DR5: Respect reduced-motion preferences (disable pulse/animations when requested).
UX-DR6: Make signals distinguishable without color alone (shape/pattern + color).
UX-DR7: Editor-first layout with sidebar + editor + status bar; editor remains 70-80% width.
UX-DR8: Right summary panel is optional/collapsible, text-first, no charts; bottom panel hidden by default.
UX-DR9: Hover response under 100ms; click/Cmd-click jumps to counterpart instantly.
UX-DR10: Confidence levels always visible (Predicted/Likely/Confirmed) and prefer no signal over wrong signal.
UX-DR11: Inline overlays include dotted hint, soft pulse, causal thread, and trace bubble with wait time + confidence.
UX-DR12: Density guard caps signals per viewport; overlays clear immediately on intent end.
UX-DR13: Inline quick actions appear only on hover or selection.
UX-DR14: Provide keyboard equivalents for hover (focus reveals hint; keyboard triggers jump/Deep Trace).
UX-DR15: Provide empty/no-signal and degraded runtime states with clear fallback messaging.
UX-DR16: Command palette input is first-class and instant (Raycast-style).
UX-DR17: Context menu (right-click) is a distinct component from generic popovers.

### FR Coverage Map

FR1: Epic 1 - Editor shell + workspace foundations
FR2: Epic 2 - Quick Insight overlays
FR3: Epic 3 - Single-file causal navigation
FR4: Epic 4 - Deep Trace runtime signals
FR5: Epic 2 + Epic 4 - Fallback and signal override
FR6: Epic 1 - Editor-first layout and optional panels
FR7: Epic 2 + Epic 3 - Inline elements and overlays
FR8: Epic 1 + Epic 3 + Epic 4 - Status + jump behaviors
FR9: Epic 1 - Basic code editing foundations
FR10: Epic 2 - Feedback diagnostics
FR11: Epic 1 + Epic 4 - Code execution and race detector

## Epic List

### Epic 1: Editor Shell & Workspace Foundations
Users can open a Go workspace and work inside a stable, editor-first shell with status indicators and optional panels.
**FRs covered:** FR1, FR6, FR8, FR9, FR11

### Epic 2: Quick Insight (Static Concurrency Lens)
Users can hover and immediately see accurate static concurrency hints with confidence labels and density guard.
**FRs covered:** FR2, FR5, FR7, FR10

### Epic 3: Single-File Causal Navigation
Users can jump between related sender/receiver ops and see causal flow lines in the same file.
**FRs covered:** FR3, FR7, FR8

### Epic 4: Deep Trace Runtime Signals
Users can activate Deep Trace to see confirmed runtime signals and blocked ops with causal correlation.
**FRs covered:** FR4, FR5, FR8, FR11

<!-- Repeat for each epic in epics_list (N = 1, 2, 3...) -->

## Epic 1: Editor Shell & Workspace Foundations

Users can open a Go workspace and work inside a stable, editor-first shell with status indicators and optional panels.

### Story 1.1: Set Up Project from Starter Template

As a Go developer,
I want the project initialized from the official Tauri starter,
So that the workspace and build system are set up correctly from the start.

**Acceptance Criteria:**

**Given** no project exists yet
**When** I run the official `create-tauri-app` starter (React + TypeScript)
**Then** the project scaffolding is created successfully
**And** the app can be launched in dev mode without errors

### Story 1.2: Initialize App Shell & Workspace Open

As a Go developer,
I want to open a workspace and see the editor shell immediately,
So that I can start working without setup friction.

**Acceptance Criteria:**

**Given** the app launches
**When** I select a workspace folder
**Then** the editor shell loads with sidebar, editor region, and status bar
**And** the editor region is visually dominant (target 70-80% width)

### Story 1.3: Source Tree + File Open

As a Go developer,
I want to browse files and open a Go file from the source tree,
So that I can view and work on code in the editor.

**Acceptance Criteria:**

**Given** a workspace is open
**When** I click a file in the source tree
**Then** the file opens in the editor
**And** only the active file is considered for analysis

### Story 1.4: Editor Rendering + Syntax Highlighting

As a Go developer,
I want Go files rendered with syntax highlighting and line numbers,
So that I can read code clearly inside the IDE.

**Acceptance Criteria:**

**Given** a Go file is open
**When** the editor renders
**Then** syntax highlighting is visible for Go
**And** line numbers are shown in the gutter

### Story 1.5: Optional Panels Default State

As a Go developer,
I want optional panels to stay out of my way by default,
So that the editor remains the primary focus.

**Acceptance Criteria:**

**Given** the app loads
**When** I have not toggled any panels
**Then** the right summary panel is collapsed and the bottom panel is hidden
**And** both can be toggled explicitly without shifting focus from the editor

### Story 1.6: Status Bar Indicators + Command Palette Trigger

As a Go developer,
I want a clear status bar and a command palette entry point,
So that I can see runtime mode and access commands quickly.

**Acceptance Criteria:**

**Given** the editor shell is visible
**When** I view the status bar
**Then** it displays mode (Quick Insight/Deep Trace) and runtime availability
**And** a command palette trigger is available (keyboard or UI entry)

### Story 1.7: Write & Save

As a Go developer,
I want to edit and save my Go files,
So that I can fix identified concurrency issues without leaving the IDE.

**Acceptance Criteria:**

**Given** a Go file is open in the editor
**When** I type code and press Cmd/Ctrl+S
**Then** the file is saved to the local filesystem via Tauri FS bridge
**And** basic undo/redo functionality is available within the session

### Story 1.8: Run Baseline

As a Go developer,
I want to run the current file and see the output,
So that I can verify that my fix or logic works as expected.

**Acceptance Criteria:**

**Given** a Go file is open
**When** I trigger the "Run" command
**Then** `go run {file}` is executed in the workspace directory
**And** stdout/stderr is captured and displayed in a scrollable bottom panel

## Epic 2: Quick Insight (Static Concurrency Lens)

Users can hover and immediately see accurate static concurrency hints with confidence labels and density guard.

### Story 2.1: Static Concurrency Detection (gopls)

As a Go developer,
I want the IDE to identify concurrency constructs in the active file,
So that static hints can be generated without running code.

**Acceptance Criteria:**

**Given** a Go file is open
**When** static analysis runs
**Then** concurrency constructs (`chan`, `select`, `Mutex`, `WaitGroup`) are detected
**And** only the active file is analyzed

### Story 2.2: Hover Hint Underline (Predicted)

As a Go developer,
I want a lightweight predicted hint when I hover a concurrency line,
So that I get instant context without noise.

**Acceptance Criteria:**

**Given** a detected concurrency construct
**When** I hover the line
**Then** a dotted underline hint appears within 100ms
**And** it clears immediately when hover ends

### Story 2.3: Confidence Labels & Styling Tokens

As a Go developer,
I want confidence levels clearly shown on hints,
So that I can trust what I’m seeing.

**Acceptance Criteria:**

**Given** a hint is shown
**When** the hint renders
**Then** the confidence label is visible (Predicted)
**And** styling uses Catppuccin Mocha signal tokens

### Story 2.4: Density Guard

As a Go developer,
I want the UI to cap the number of visible hints,
So that overlays never overwhelm code readability.

**Acceptance Criteria:**

**Given** many detected constructs in a viewport
**When** hints are shown
**Then** only a capped number are rendered
**And** excess hints are suppressed without flicker

### Story 2.5: Degraded Runtime Fallback

As a Go developer,
I want static hints to remain available when runtime sampling fails,
So that the editor remains useful even without Deep Trace.

**Acceptance Criteria:**

**Given** runtime sampling is unavailable or fails
**When** I hover a concurrency line
**Then** static predicted hints still appear
**And** no UI errors are shown

### Story 2.6: Inline Quick Actions on Hover

As a Go developer,
I want inline actions to appear only when I hover or select,
So that the UI stays clean by default.

**Acceptance Criteria:**

**Given** I hover a concurrency line
**When** inline actions appear
**Then** they are minimal and contextual
**And** they disappear immediately on hover out

### Story 2.7: LSP Diagnostics

As a Go developer,
I want to see error and warning squiggles in the editor,
So that I get immediate feedback on my code changes.

**Acceptance Criteria:**

**Given** an LSP (gopls) is connected
**When** I save a file with errors or warnings
**Then** diagnostics are rendered in the editor gutter and as squiggles on the code
**And** hover details show the specific diagnostic message

### Story 2.8: Basic Autocomplete

As a Go developer,
I want basic code completion from the LSP,
So that I can write code more accurately during the "Fix" phase.

**Acceptance Criteria:**

**Given** a cursor is within an active file
**When** I trigger completion (e.g., via typing '.' or explicit shortcut)
**Then** a list of completion candidates from `gopls` is displayed
**And** selecting a candidate inserts it at the cursor

## Epic 3: Single-File Causal Navigation

Users can jump between related sender/receiver ops and see causal flow lines in the same file.

### Story 3.1: Counterpart Mapping (Static)

As a Go developer,
I want sender/receiver counterparts mapped in the active file,
So that I can jump between related concurrency operations.

**Acceptance Criteria:**

**Given** a Go file with matched send/receive operations
**When** static analysis completes
**Then** counterpart pairs are mapped within the same file
**And** mappings are limited to the active file only

### Story 3.2: Click/Cmd-Ctrl-Click Jump to Counterpart

As a Go developer,
I want to click or Cmd/Ctrl-click to jump to the counterpart operation,
So that I can follow causal flow instantly.

**Acceptance Criteria:**

**Given** a mapped counterpart pair
**When** I click (or Cmd/Ctrl-click) the hint
**Then** the editor jumps to the corresponding line
**And** focus remains in the editor

### Story 3.3: Causal Thread Line

As a Go developer,
I want a lightweight causal thread between related operations,
So that I can see the relationship at a glance.

**Acceptance Criteria:**

**Given** a counterpart pair is active
**When** I hover or select the line
**Then** a thin causal thread renders between the two locations
**And** it clears immediately when the interaction ends

### Story 3.4: Trace Bubble (Static Details)

As a Go developer,
I want a compact trace bubble with confidence labels,
So that I can understand the relationship without noise.

**Acceptance Criteria:**

**Given** a hover on a mapped operation
**When** details are shown
**Then** a compact bubble appears with confidence label
**And** it remains text-first and low-noise

### Story 3.5: Jump from Summary Panel Item

As a Go developer,
I want to jump from a summary panel item to code,
So that navigation stays fast even when using the panel.

**Acceptance Criteria:**

**Given** the right summary panel is open
**When** I click a listed item
**Then** the editor jumps to the corresponding line
**And** the panel remains optional and non-dominant

## Epic 4: Deep Trace Runtime Signals

Users can activate Deep Trace to see confirmed runtime signals and blocked ops with causal correlation.

### Story 4.1: Deep Trace Activation (Scoped)

As a Go developer,
I want to activate Deep Trace scoped to the current flow,
So that runtime sampling remains focused and lightweight.

**Acceptance Criteria:**

**Given** a concurrency line is in focus
**When** I activate Deep Trace
**Then** tracing is scoped to the current functional flow
**And** the UI remains responsive without blocking

### Story 4.2: Delve DAP Runtime Sampling

As a Go developer,
I want runtime goroutine wait states sampled via Delve (DAP),
So that confirmed blocking signals can be surfaced.

**Acceptance Criteria:**

**Given** Deep Trace is active
**When** Delve connects locally
**Then** goroutine wait states are sampled
**And** sampling remains local-only

### Story 4.3: Blocked Signal Rendering (Confirmed)

As a Go developer,
I want blocked operations highlighted with confirmed signals,
So that I can see the real runtime bottleneck.

**Acceptance Criteria:**

**Given** a blocked operation is detected
**When** it is rendered
**Then** a soft pulse is shown with Confirmed confidence
**And** it does not overwhelm code readability

### Story 4.4: Causal Correlation (Runtime)

As a Go developer,
I want confirmed blocked operations correlated to likely counterparts,
So that I can follow the causal chain with confidence.

**Acceptance Criteria:**

**Given** runtime evidence exists
**When** a blocked operation is shown
**Then** the likely counterpart is linked with a causal thread
**And** confidence labels reflect Confirmed vs Likely

### Story 4.5: Runtime Failure Fallback

As a Go developer,
I want the UI to gracefully fall back to static hints if runtime fails,
So that the editor remains trustworthy and usable.

**Acceptance Criteria:**

**Given** runtime sampling fails or disconnects
**When** I continue interacting
**Then** predicted static hints remain available
**And** any confirmed signals are removed cleanly without UI errors

### Story 4.6: Run-with-Race-Detector

As a Go developer,
I want to run my code with the Go race detector enabled,
So that I can get data-driven internal confirmation of race conditions.

**Acceptance Criteria:**

**Given** Deep Trace mode is available
**When** I trigger a "Run with Race Detector" command
**Then** the command executes `go run -race {file}`
**And** any race warnings detected are captured and piped into the Concurrency Lens as Confirmed signals

<!-- Repeat for each epic in epics_list (N = 1, 2, 3...) -->

## Epic {{N}}: {{epic_title_N}}

{{epic_goal_N}}

<!-- Repeat for each story (M = 1, 2, 3...) within epic N -->

### Story {{N}}.{{M}}: {{story_title_N_M}}

As a {{user_type}},
I want {{capability}},
So that {{value_benefit}}.

**Acceptance Criteria:**

**Given** {{precondition}}
**When** {{action}}
**Then** {{expected_outcome}}
**And** {{additional_criteria}}

<!-- End story repeat -->
