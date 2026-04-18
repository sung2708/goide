---
stepsCompleted: [pm-correct-course-2026-04-18]
inputDocuments:
  - {project-root}/_bmad-output/planning-artifacts/prd.md
  - {project-root}/_bmad-output/planning-artifacts/architecture.md
  - {project-root}/_bmad-output/planning-artifacts/ux-design-specification.md
  - {project-root}/_bmad-output/implementation-artifacts/sprint-status.yaml
  - {project-root}/_bmad-output/implementation-artifacts/deferred-work.md
---

# goide - Epic Breakdown (Execution-Ready)

## Product Intent

goide wins when developers can move from confusion to fix without leaving the editor.  
The first four epics delivered the Concurrency Lens backbone. The next priority is to raise editor ergonomics and intelligence so users experience goide as a real IDE, not just a trace viewer.

## Requirements Inventory

### Functional Requirements

- FR1: Open workspace, render Go files, and scope analysis to active file.
- FR2: Show hover Quick Insight with confidence labels and density guard.
- FR3: Support single-file causal jump and thread-line visualization.
- FR4: Support scoped Deep Trace and Delve-based blocked operation sampling.
- FR5: Preserve graceful fallback to static hints on runtime failure.
- FR6: Keep editor-first layout with optional panels collapsed by default.
- FR7: Render inline lens elements (underline, pulse, thread line, trace bubble).
- FR8: Keep runtime/mode state visible in status bar and support summary jump.
- FR9: Surface LSP diagnostics reliably, including dependency-missing states.
- FR10: Provide professional Go completion with package/member/import assistance.
- FR11: Provide editing ergonomics: Tab accept, paired delimiters, snippet flow.
- FR12: Keep keyboard-first completion flow predictable and low-latency.

### Non-Functional Requirements

- NFR1: Interaction and render budget under 16ms for common edit actions.
- NFR2: Completion popup and candidate update should feel immediate (<100ms perceived where possible).
- NFR3: Runtime fallback and diagnostics failure states must never block typing.
- NFR4: Error surfaces should be informative but low-noise and non-disruptive.
- NFR5: Local-first constraints remain unchanged (no remote analysis dependency).

## Epic List

1. Epic 1 - Foundation Shell and Editing Baseline (Delivered)
2. Epic 2 - Static Insight, Diagnostics, and Basic Autocomplete (Delivered)
3. Epic 3 - Causal Navigation and Visual Correlation (Delivered)
4. Epic 4 - Runtime Deep Trace and Failure Resilience (Delivered)
5. Epic 5 - Professional Editor Intelligence and Typing Experience (Planned)

## Epic 1: Foundation Shell and Editing Baseline

Goal: Bring up a stable IDE shell with workspace open/save/run and editor dominance.

### Delivered Stories

- 1.1 Set up project from official Tauri starter
- 1.2 Initialize app shell and workspace open
- 1.3 Source tree and file open
- 1.4 Editor rendering and syntax highlighting
- 1.5 Optional panels default state
- 1.6 Status bar indicators and command palette trigger
- 1.7 Write/save flow
- 1.8 Run baseline

## Epic 2: Static Insight, Diagnostics, and Basic Autocomplete

Goal: Ship confidence-aware static hints plus essential diagnostics/completion.

### Delivered Stories

- 2.1 Static concurrency detection via gopls
- 2.2 Hover hint underline (predicted)
- 2.3 Confidence labels and styling tokens
- 2.4 Density guard
- 2.5 Degraded runtime fallback
- 2.6 Inline quick actions on hover
- 2.7 LSP diagnostics
- 2.8 Basic autocomplete

### Remaining Debt from Epic 2

- Diagnostics when `gopls` is missing is still under-specified in user feedback path.
- Mixed stdout/stderr diagnostics parsing robustness needs hardening.

## Epic 3: Causal Navigation and Visual Correlation

Goal: Make counterpart discovery and causal visualization direct and trustworthy.

### Delivered Stories

- 3.1 Counterpart mapping (static)
- 3.2 Click/Cmd-Ctrl click jump to counterpart
- 3.3 Causal thread line
- 3.4 Trace bubble static details
- 3.5 Jump from summary panel item

## Epic 4: Runtime Deep Trace and Failure Resilience

Goal: Add runtime confirmation while preserving editor continuity on failures.

### Delivered Stories

- 4.1 Scoped deep trace activation
- 4.2 Delve DAP runtime sampling
- 4.3 Confirmed blocked signal rendering
- 4.4 Runtime causal correlation
- 4.5 Runtime failure fallback
- 4.6 Run with race detector

## Epic 5: Professional Editor Intelligence and Typing Experience

Goal: Close the gap between "basic autocomplete" and "professional IDE feel" with low-latency, keyboard-first, context-aware completion and editing ergonomics.

### Story 5.1: Completion Acceptance and Ranking Consistency

As a Go developer,  
I want `Tab` and `Enter` behavior to be predictable for completion acceptance,  
So that completion never interrupts typing flow.

Acceptance Criteria:

- Given a completion list is open, pressing `Tab` accepts current candidate.
- Given snippet placeholders are active, `Tab` moves snippet field and does not break completion flow.
- Given completion is open in package declaration context, `Enter` does not incorrectly insert unrelated function snippets.

### Story 5.2: Package and Member Intelligence (fmt-first experience)

As a Go developer,  
I want package and member suggestions to appear as soon as I type package identifiers like `fmt`,  
So that I can discover available APIs and complete code faster.

Acceptance Criteria:

- Given I type `fmt`, member completions are offered even before explicit import exists.
- Given completion is accepted for missing import package, import insertion is applied automatically and safely.
- Given a completion item is shown, a short summary/detail is visible in completion info.

### Story 5.3: Diagnostics Robustness and Missing Dependency UX

As a Go developer,  
I want clear guidance when diagnostics cannot run,  
So that I understand whether code has no error or tooling is unavailable.

Acceptance Criteria:

- Given `gopls` is missing/unavailable, status and diagnostics surfaces show non-blocking actionable hint.
- Given `gopls` emits mixed stdout/stderr output, parser still extracts diagnostics when available.
- Given diagnostics fail, editing remains fully functional and no crash/toast storm occurs.

### Story 5.4: Delimiter Pairing and Smart Surround

As a Go developer,  
I want pairs like `""`, `''`, `()`, `{}`, `[]` to auto-complete naturally,  
So that typing structure is fast and error-resistant.

Acceptance Criteria:

- Given I type opening delimiter, matching closing delimiter is inserted.
- Given cursor is before an auto-inserted closing delimiter, typing the same closing delimiter skips forward instead of duplicating.
- Given text is selected, typing opening delimiter wraps the selected text.

### Story 5.5: Snippet Pack and Discovery

As a Go developer,  
I want practical snippets for common Go patterns,  
So that I can scaffold code quickly with fewer keystrokes.

Acceptance Criteria:

- Given snippet trigger keywords are typed, snippets appear in completion list with clear labels.
- Given snippet is accepted, placeholders are navigable by `Tab` and `Shift-Tab`.
- Given package context (e.g., first line package declaration), snippet ranking avoids surprising defaults.

### Story 5.6: Completion Performance and UX Polish

As a Go developer,  
I want completion to feel immediate and stable,  
So that the IDE keeps up with rapid typing.

Acceptance Criteria:

- Given rapid typing, stale completion responses are ignored and do not replace current context.
- Given completion opens repeatedly, popup latency remains within acceptable perceived threshold under normal local conditions.
- Given completion or diagnostics backend errors occur, UI degrades silently with lightweight status cues.

## Definition of Done for Epic 5

- All Story 5.x acceptance criteria validated by automated tests plus manual scenario checklist.
- `prd.md`, `epics.md`, `sprint-status.yaml`, and relevant implementation artifacts are synchronized.
- No regression in Concurrency Lens core loop (`hover -> explain -> jump`).
