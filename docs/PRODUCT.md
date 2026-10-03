# Goro Product Specification

## 1. Product Vision

> **Goro — Understand Go in motion.**

Goro takes its name from *goroutine*. Its purpose is to help developers write Go and understand program behavior during execution, with source context, debugging, race reports, and concurrency observations in the same workbench. "In motion" expresses the product direction across coding, running, testing, debugging, goroutines, and runtime inspection; it does not imply that every part of that workflow is already complete.

Goro is a fast, lightweight, native-backed desktop Integrated Development Environment crafted specifically for Go developers. Built on Tauri v2 and React, Goro delivers high-performance editing, native terminal execution, integrated `gopls` language intelligence, Delve debugging, and specialized workflows for runtime inspection and concurrency analysis.

The public product name is **Goro**. The repository remains **goide**, and existing package names, URLs, and application identifiers retain that technical identity for continuity.

---

## 2. Target Users

1. **Go Backend & Systems Engineers**: Developers writing concurrent servers, microservices, network daemons, and command-line tools in Go.
2. **Distributed & Concurrent Systems Developers**: Engineers diagnosing goroutine deadlocks, channel synchronization bottlenecks, and race conditions.
3. **Developers Seeking a Lightweight Alternative**: Programmers who want a dedicated Go IDE with fast startup and low memory usage without the resource overhead of heavy generic IDEs.

---

## 3. Problems Goro Solves

- **Heavyweight IDE Overhead**: Many IDEs consume gigabytes of memory and take seconds to open. Goro leverages Tauri's native OS webview and Rust core to maintain minimal idle memory consumption and rapid startup times.
- **Disconnected Concurrency Analysis**: Detecting data races and goroutine stalls typically requires manually running command-line flags and parsing raw terminal stack traces. Goro integrates `go run -race` findings directly into editor overlays and highlights channel operations.
- **Fragmented Tooling Workflow**: Switching between terminal runners, external debuggers, and text editors fractures developer focus. Goro unifies editing, terminal output, debugger controls, and diagnostics in a single cohesive workbench.

---

## 4. Core IDE Expectations

- **Rapid Startup**: Launches to an interactive editor state in under 1 second.
- **Responsive Source Editing**: CodeMirror 6 editor engine with Go syntax highlighting, bracket pairing, smart indentation, and in-file find/replace.
- **Native File Tree Explorer**: Workspace-oriented file explorer supporting file creation, folder creation, renaming, moving, and deletion with filesystem auto-synchronization.
- **Workspace-Owned Terminal Sessions**: Integrated PTY shell sessions that remain active across file switches and persist splitter geometry across layouts.
- **Standard Toolchain Integration**: Uses the developer's existing `go`, `gopls`, and `dlv` binaries without proprietary runtime locks.

### Document Save Behavior

The active document autosaves after 2.5 seconds without typing. Manual saves cancel the pending autosave. Opening another file or workspace first saves the current dirty buffer; a failed save blocks the transition and keeps the buffer open with an error. Edits made during a transition save or file read are retained and require retrying the transition. Failed file reads also retain the current document.

Git branch selection also saves the active buffer before refreshing disk-based Git status. A save failure, pending write or new edit blocks checkout. Changes created by the save require the existing commit/stash/discard decision; confirmation saves any newer buffer again. Editor mutation and document navigation are blocked while Git inspects/changes files. The destination document is reloaded directly, without saving the previous branch's buffer; if unavailable, the old document is retired with an error. Git errors also trigger a reload because a pre-switch action may have already changed disk. Stop an active run/debug session before switching branches.

These safeguards cover editor-driven file/workspace opening and the branch transaction. Application shutdown, external modifications, and Explorer rename/delete still require separate data-safety implementation and validation before Beta. Explorer/search operations already in flight and external terminal/CLI changes need coordinated filesystem conflict handling; sidebar input is temporarily disabled during branch preparation/mutation.

---

## 5. Go-Specific Workflows & Differentiation

### Concurrency & Runtime Inspection
- **Causal Thread Visualization**: Highlights counterpart channel operations (e.g. channel send vs. channel receive) and presents confidence metrics.
- **Trace Bubble & Overlays**: Displays inline signals indicating whether a channel operation or synchronization construct is blocked or active.
- **Delve DAP Debugging**: Start Delve sessions, set and synchronize breakpoints, pause/continue, step into/over/out, and inspect call stacks and goroutine states.
- **Race Detector Integration**: Runs `go run -race` and maps data race detection reports directly to active source lines.

### Product Honesty Principles
1. **Sampled Observations vs. Causality Graphs**: Goro explicitly acknowledges that runtime signals are based on sampled runtime observations and heuristic analysis, not complete hardware-level causality graphs.
2. **Standard Compiler Output**: Race findings are extracted directly from official Go `-race` compiler outputs, ensuring standard toolchain compatibility without synthetic simulation.
3. **Graceful Toolchain Degradation**: If `gopls` or `dlv` is missing or fails, Goro clearly communicates toolchain status and degrades gracefully rather than silently breaking.

---

## 6. Non-Goals

- **Multi-Language Ambition**: Goro is intentionally optimized for Go. It will not attempt to support polyglot IDE features for Java, Python, or Rust.
- **Heavy Plugin Monoliths**: Goro will not build a fragile, kitchen-sink plugin ecosystem that degrades IDE performance and responsiveness.
- **Custom Go Compiler / Toolchain**: Goro relies entirely on the official Go toolchain and standard community tools (`go`, `gopls`, `dlv`).
- **Cloud/Remote Web IDE**: Goro is focused on native local desktop performance, not browser-hosted multi-tenant SaaS.

---

## 7. Maturity Status & Definition of Stable 1.0

### Current Maturity: **Pre-1.0 (Alpha / Stabilization)**
Goro has demonstrated core capabilities across editing, terminal execution, branch switching, and runtime inspection. However, it has not yet completed the full stabilization and cross-platform verification cycle required for a production 1.0 release.

### Definition of Stable 1.0
To achieve true 1.0 maturity, Goro must satisfy all of the following criteria:
1. **Rock-Solid Debugger**: Uninterrupted Delve DAP debugging sessions across complex nested Go packages and test binaries.
2. **Full Multi-Platform Verification**: Tested and validated release packages for Windows (MSVC), macOS (Apple Silicon / Intel), and Linux (Debian / AppImage).
3. **Robust LSP Integration**: Fault-tolerant `gopls` lifecycle management with automatic crash recovery, symbol caching, and formatting support.
4. **Complete Test Suite**: Comprehensive integration test coverage for all IPC bridges and frontend views with zero intermittent test flakes.
5. **Security Validation**: Strict path canonicalization, verified Tauri permissions, and audited dependency hygiene.

## Reviewed Code Actions checkpoint (2026-10-03)

Quick Fix / Code Actions is available through the command palette and `Mod+.` in a writable Go document. The chooser shows only actions returned by gopls at the captured cursor position, using current Go buffers and known diagnostics. Selecting an action requests a fresh, unambiguous server action and previews its complete Before/After edits. Apply changes editor buffers; Save or Save All persists them against the original disk baselines.

Direct workspace edits and lazy `gopls.apply_fix` actions with `ResolveEdits=true` are supported. Command-only actions, other lazy commands, resource operations, edits outside the workspace, unsupported file types, stale versions, and read-only destinations are rejected or shown with an explicit disabled reason. Selection-based refactorings and command workflows remain incomplete.

## Application settings and save actions (2026-10-03)

Settings opens from the title bar, the command palette or Mod+,. A central versioned preference store controls editor font/tab size and wrapping, terminal font size, the existing twelve color palettes and Auto Save (Off, After delay, On focus change). The default remains After delay at 2500 ms. Preferences apply live; invalid or unsupported stored profiles show an error and require an explicit Reset before replacement. Persistence failures preserve session preferences and report the failure.

Format on Save and Organize Imports on Save are explicit opt-ins, both disabled by default. Go saves run imports then formatting once with captured unsaved overlays before the normal baseline-checked write. Source changes, cancellation, unmount or tool errors prevent that write. A failed disk write retains the prepared editor draft and original baseline. Save All and transition/close saves use the same preparation. Debug/Git preferences, executable-path configuration and remaining addendum workflows are not complete.

## Stashes in Source Control (2026-10-03)

The Stashes view lists actual Git stash references, object IDs, dates and reflog messages (including branch context when Git supplies it). Selecting an entry opens a bounded native patch, including untracked content. Explicit Stash Changes, Stash Including Untracked, Apply, Pop and confirmed Drop are available; ignored files are excluded. Apply/Pop can optionally restore staged state. Worktree-changing actions save open buffers first and use the shared run/debug/document guard. Failed operations refresh Git and file state; conflicted Apply/Pop retains the stash. The palette opens Source Control, Git Graph and Stashes; Mod+Shift+G opens Source Control.

Lists show the latest 100 entries and direct older history to the terminal. Staged-only/partial stashing, simultaneous external-ref mutation acceptance, and remaining full Git workflows are separate gates.

## Go toolchain inspection checkpoint (2026-10-03)

Inspect Go Toolchain from the status bar or the Go: Inspect Toolchain command. Native probes report the concrete executable path, actual bounded version output, Ready/Missing/Failed/Unknown status and genuine execution errors. Refresh retries detection; stale responses cannot replace a newer result. Browser preview explicitly reports that native detection is unavailable. Successful version commands do not certify project/debugger compatibility.

Tool launches and inspection resolve PATH first, then Go-installed tool directories for Go/gopls/Delve. Configurable executable paths, project Go environment/module awareness and explicit probe cancellation remain separate unfinished gates.

## Executable preferences and source-control defaults (2026-10-03)

Settings now includes application-scoped Go executable, gopls executable and Delve executable paths. Blank values retain automatic resolution; explicit values must name existing absolute regular executable files (.exe on Windows, executable permissions on Unix). The selected Go must be named go/go.exe, and its directory is placed first in the environment of child tools. Inspection reports the actual selected executable and version/probe result rather than certifying compatibility.

Preferences are applied on field commit, serialized to the native service, and followed by inspection. Native validation or busy errors retain the previous native profile and remain visible; correct the setting and retry Tools inspection after stopping Run/Debug or the current language operation. Changing an accepted profile stops the previous gopls session before subsequent queries start a new one. Git settings also choose the initial Source Control view (Changes, Git Graph or Stashes); explicit navigation commands still select their requested view.

Module/environment workflows, explicit probe cancellation, session restoration and full Git/platform acceptance remain unfinished. This checkpoint does not authorize a release or tag.

## Go project and environment inspection (2026-10-03)

Use the command palette action Go: Inspect Project and Environment to inspect the saved Go context for the active file directory, or the opened workspace directory when no file is selected. The desktop runs bounded, cancellable Go commands and shows the actual selected single-module, go.work workspace or non-module directory. Workspace modules show their go.mod, module path and Go directive; outside-workspace modules are reported without inspecting their contents. The environment disclosure is limited to GOROOT, GOPATH, GOMOD, GOWORK, GOVERSION, GOOS, GOARCH, CGO_ENABLED and GOTOOLCHAIN.

Refresh after saved module/workspace changes. Cancel, context changes and closing the dialog cancel native requests and reject late results. Invalid executable settings and malformed Go project data remain visible errors. Inspection does not run tidy/download or edit module files; those actions and full addendum/Git acceptance remain unfinished.

## Explicit Go module commands

Open **Go: Inspect Project and Environment** to select a scoped module, save all open documents and run **Tidy Module** or **Download Dependencies**. Tidy targets the selected module; download follows Go's selected module/workspace. These commands clear custom GOFLAGS, show real exit status/output and refresh project/files/Git after completion or partial failure.

Document preservation must succeed before execution. Stop Run/Debug first. Cancel retains the mutation lock until native cleanup is acknowledged; transport failures require native cleanup confirmation and offer **Retry module cleanup**. Workspace members outside the opened root are rejected before download writes.

## Structured Go test runner

Use **Go: Test Current Package**, **Go: Test Workspace** or **Go: Open Test Runner** from the command palette. Save All and retained conflict preservation must succeed first; Run/Debug ownership blocks startup. Go discovers actual package identities, selects the proper module directory and includes scoped go.work members for workspace tests. Custom GOFLAGS are cleared and the selected GOWORK is pinned for execution.

The runner shows package/test states, durations and bounded real output after completion. Located test failures and confirmed compiler failures offer source navigation. Cancel retains document ownership until native completion; lost IPC transport requires cleanup confirmation with an explicit retry. Commands have a 180-second native budget and a 120-second Go test timeout. Tests execute project code only after the explicit action.

Live incremental results, semantic test CodeLens, Debug Test and the richer Test Explorer are still pending. The terminal remains available for additional testing flags and unsupported workflows.
