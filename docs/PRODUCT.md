# GoIDE Product Specification

## 1. Product Vision

GoIDE is a fast, lightweight, native-backed desktop Integrated Development Environment crafted specifically for Go developers. Built on Tauri v2 and React, GoIDE delivers high-performance editing, native terminal execution, integrated `gopls` language intelligence, Delve debugging, and specialized workflows for runtime inspection and concurrency analysis.

---

## 2. Target Users

1. **Go Backend & Systems Engineers**: Developers writing concurrent servers, microservices, network daemons, and command-line tools in Go.
2. **Distributed & Concurrent Systems Developers**: Engineers diagnosing goroutine deadlocks, channel synchronization bottlenecks, and race conditions.
3. **Developers Seeking a Lightweight Alternative**: Programmers who want a dedicated Go IDE with fast startup and low memory usage without the resource overhead of heavy generic IDEs.

---

## 3. Problems GoIDE Solves

- **Heavyweight IDE Overhead**: Many IDEs consume gigabytes of memory and take seconds to open. GoIDE leverages Tauri's native OS webview and Rust core to maintain minimal idle memory consumption and rapid startup times.
- **Disconnected Concurrency Analysis**: Detecting data races and goroutine stalls typically requires manually running command-line flags and parsing raw terminal stack traces. GoIDE integrates `go run -race` findings directly into editor overlays and highlights channel operations.
- **Fragmented Tooling Workflow**: Switching between terminal runners, external debuggers, and text editors fractures developer focus. GoIDE unifies editing, terminal output, debugger controls, and diagnostics in a single cohesive workbench.

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
1. **Sampled Observations vs. Causality Graphs**: GoIDE explicitly acknowledges that runtime signals are based on sampled runtime observations and heuristic analysis, not complete hardware-level causality graphs.
2. **Standard Compiler Output**: Race findings are extracted directly from official Go `-race` compiler outputs, ensuring standard toolchain compatibility without synthetic simulation.
3. **Graceful Toolchain Degradation**: If `gopls` or `dlv` is missing or fails, GoIDE clearly communicates toolchain status and degrades gracefully rather than silently breaking.

---

## 6. Non-Goals

- **Multi-Language Ambition**: GoIDE is intentionally optimized for Go. It will not attempt to support polyglot IDE features for Java, Python, or Rust.
- **Heavy Plugin Monoliths**: GoIDE will not build a fragile, kitchen-sink plugin ecosystem that degrades IDE performance and responsiveness.
- **Custom Go Compiler / Toolchain**: GoIDE relies entirely on the official Go toolchain and standard community tools (`go`, `gopls`, `dlv`).
- **Cloud/Remote Web IDE**: GoIDE is focused on native local desktop performance, not browser-hosted multi-tenant SaaS.

---

## 7. Maturity Status & Definition of Stable 1.0

### Current Maturity: **Pre-1.0 (Alpha / Stabilization)**
GoIDE has demonstrated core capabilities across editing, terminal execution, branch switching, and runtime inspection. However, it has not yet completed the full stabilization and cross-platform verification cycle required for a production 1.0 release.

### Definition of Stable 1.0
To achieve true 1.0 maturity, GoIDE must satisfy all of the following criteria:
1. **Rock-Solid Debugger**: Uninterrupted Delve DAP debugging sessions across complex nested Go packages and test binaries.
2. **Full Multi-Platform Verification**: Tested and validated release packages for Windows (MSVC), macOS (Apple Silicon / Intel), and Linux (Debian / AppImage).
3. **Robust LSP Integration**: Fault-tolerant `gopls` lifecycle management with automatic crash recovery, symbol caching, and formatting support.
4. **Complete Test Suite**: Comprehensive integration test coverage for all IPC bridges and frontend views with zero intermittent test flakes.
5. **Security Validation**: Strict path canonicalization, verified Tauri permissions, and audited dependency hygiene.
