# Goro Product Roadmap

This document outlines the engineering and product roadmap for Goro leading toward its first production-stable 1.0 release.

Use [Release Readiness](RELEASE_READINESS.md) for the current consolidated release decision. The dated milestones below are historical checkpoints; later entries may supersede their remaining-work lists. Unchecked acceptance items do not imply that their implementation is entirely absent.

> [!NOTE]
> Historical `v1.x` prototype tags do not indicate product maturity. Goro is currently following a pre-1.0 stabilization track (`0.x.y`) to systematically harden core subsystems before declaring 1.0 stability.

---

## 1. Roadmap Phases & Exit Criteria

```
Phase 1: Foundation & Hygiene  ──►  Phase 2: Alpha (0.2.x)  ──►  Phase 3: Beta (0.3.x)  ──►  Phase 4: Release Candidate (0.9.x)  ──►  Phase 5: Stable 1.0
```

### Phase 1: Foundation & Repository Hygiene (Hygiene established; reliability active)
- **Focus**: Eliminate technical debt in release automation, establish documentation suite, synchronize versioning, enforce Conventional Commits, and create multi-platform CI/CD pipelines.
- **Exit Criteria**:
  - [x] Comprehensive documentation suite established (`PRODUCT.md`, `ARCHITECTURE.md`, `ENGINEERING_RULES.md`, etc.).
  - [x] Obsolete temporary agent artifacts and patch scripts removed.
  - [x] CI configuration for frontend verification and Rust checks on Windows, macOS, and Linux. Successful hosted runs must be verified before release.
  - [x] Tag-driven release workflow with automated SHA-256 checksum generation.
  - [x] Deterministic cross-file version synchronization tooling (`scripts/version-manager.mjs`).
  - [x] Canonical release artifact naming and pre-publication asset validation (`scripts/validate-release-assets.mjs`).
  - [ ] P0 document safety across every close, workspace, Git, Explorer and external-file transition.
  - [ ] Consistent process ownership and native exit/cancellation verification.
  - [ ] Shared command/keybinding, source-location, Problems and typed settings foundations.

### Phase 2: Alpha Releases (`v0.2.x`)
- **Focus**: Core stability, decomposition of monolithic backend modules, and hardening of developer workflows.
- **Exit Criteria**:
  - Refactored `src-tauri/src/ui_bridge/commands.rs` into domain modules (`fs`, `debug`, `lsp`, `terminal`).
  - Robust error recovery for all external subprocesses (`gopls`, `dlv`, `go run`).
  - Basic Go test runner workflow integrated into the editor UI (`go test ./...` with pass/fail badges).
  - Core gopls navigation, safe workspace edits, format/imports and module/toolchain workflows.
  - Debugger Variables, Call Stack and Goroutines backed by actual Delve data.
  - Safe recent-workspace and session restore without restoring process handles or stale diagnostics.
  - Validated automated release builds on Windows, macOS, and Linux runners.

### Phase 3: Beta Releases (`v0.3.x` - `v0.8.x`)
- **Focus**: Feature completeness, developer ergonomics, and performance under heavy workloads.
- **Exit Criteria**:
  - Full Delve DAP stepping and variable inspection across complex packages and goroutines.
  - LSP code actions, auto-import organization, and formatting on save (`go fmt` / `goimports`).
  - Terminal performance optimizations under high stdout/stderr throughput.
  - User settings and customizable keybindings configuration.
  - All required P0 workflows substantially complete and reliable end-to-end. Test Explorer, coverage, semantic Outline/symbols/breadcrumbs, source control and Race Explorer are polish targets after P0 reliability.
  - Zero high/critical CVEs in frontend or Rust dependencies.

### Phase 4: Release Candidate (`v0.9.x`)
- **Focus**: Polishing, bug fixes, edge case handling, and release readiness.
- **Exit Criteria**:
  - Feature freeze: only bug fixes, security patches, and documentation corrections allowed.
  - Clean upgrade and installation tested across Windows (MSVC/NSIS), macOS (DMG), and Linux (AppImage/deb).
  - Zero unresolved regression issues or crash bugs.
  - Full end-to-end regression validation green across all platforms.
  - Security, performance and accessibility reviews complete; no P2 feature work during freeze except release-blocking fixes.

### Phase 5: Stable 1.0 (`v1.0.0`)
- **Focus**: Long-term stability, predictable semver releases, and community maintenance.
- **Exit Criteria**:
  - All Phase 1–4 criteria met and signed off by maintainers.
  - Official documentation and website landing page finalized.
  - Sustained period of zero critical bug reports in RC builds.

---

## 2. Category Roadmap

### Priority and Evidence Rules

P0 is required core before approaching Beta. P1 is the strong initial-stable target. P2 differentiates Goro after P0 workflows are reliable. Post-1.0 is explicitly outside the initial release. Missing P2 alone does not block Alpha/Beta/RC unless selected as part of that release's feature set.

Do not implement P1 while fundamental P0 architecture is broken or P2 while P0 workflows are unreliable. Existing checked entries describe implemented baseline capabilities, not full compliance with the expanded requirements or release readiness. Unchecked entries include missing capabilities and partial implementations whose required behavior is not yet verified.

Implementation order is baseline green, data safety, process ownership, command/navigation/Problems/settings foundations, gopls workflows, Quick Open/modules/tests, debugger inspection, session restore, then P1 polish and P2 concurrency tooling. RC is a feature freeze; first stable requires maintainer approval under VERSIONING.md and RELEASE.md.

### Architecture & Refactoring
- [x] Clean separation of UI and Rust process lifecycles.
- [ ] Decompose 3,400+ line `ui_bridge/commands.rs` into modular command controllers.
- [ ] Migrate global singletons (`OnceLock`) to Tauri managed state (`tauri::State`).
- [x] Extract Git save/inspect/checkout/reload transaction ownership into `useBranchTransition`; branch mutation blocks editor writes and overlapping document navigation.
- [ ] **P0** Unified command registry with IDs, titles, categories, availability, handlers and platform keybindings. Menus, palette, shortcuts and editor actions reuse handlers; avoid overlapping global listeners.
- [ ] **P0** Shared source-location/navigation abstraction for diagnostics, tests, race, debugger, search and references.
- [ ] **P0** Unified Problems domain with source, severity, message, range, code and related information; current-state grouped/flat panel, filter/counts, keyboard and next/previous navigation. Existing diagnostics are a partial baseline.
- [ ] **P0** Process ownership for run/race/tests/PTY/gopls/Delve/module commands with cancellation, reaping and app-exit cleanup. Do not expose arbitrary shell execution.
- [ ] **P0** Actionable notifications and progress without routine notification spam or silent failures.

### Editor & Language Intelligence
- [x] Monaco Go syntax highlighting and bracket pairing.
- [x] In-file Find and Replace widget (`FindWidget`).
- [x] Go semantic analysis with `web-tree-sitter` in Web Worker.
- [x] `gopls` autocompletion and diagnostic surfacing.
- [ ] **P0** Standards-compatible Format Document/format on save (`go fmt`/selected canonical path), preserving selection and undo where practical without save recursion.
- [ ] **P0** gopls Organize Imports and optional import organization on save; reuse validated workspace edits rather than handwritten import sorting.
- [ ] **P0** LSP Code Actions/Quick Fix with discoverable UI, showing only actual returned actions.
- [ ] **P0** gopls definition/multiple-target navigation, references with source previews, documentation hover and signature help with cancellation and stale-result protection. Existing concurrency hints are not LSP hover.
- [ ] **P0** Symbol rename with validated workspace edits, dirty-buffer handling and clearly reported partial failure; reuse this safe edit path for formatting/imports/code actions.
- [ ] **P1** Semantic Outline/document and workspace symbol search from gopls, breadcrumbs, validated Go to Line (`line:column`) and bounded reopen-closed history. Existing heuristic outline is not semantic coverage.
- [ ] **P1** Large-file guards and incremental/debounced/cancellable expensive analysis.
- [ ] **P2** LSP call/type hierarchy where supported, implementations, configurable inlay hints/semantic tokens, safe documentation links and lightweight package navigation.

### Debugger (Delve DAP)
- [x] Delve DAP subprocess launcher and lifecycle management.
- [x] Breakpoint toggling and synchronization.
- [x] Step Over, Step Into, Step Out, Pause, Continue controls.
- [x] Dedicated failure modal and graceful recovery.
- [ ] **P0** Actual Delve Goroutines and navigable Call Stack views, goroutine/frame switching and correct variable context.
- [ ] **P0** Interactive lazy expandable Variables for locals/arguments, graceful unavailable values and bounded loads.
- [ ] **P0** Central debugger session states (idle/starting/running/paused/stopping/failed) and test debugging, preserving breakpoints and valid inspection context.
- [ ] **P1** Watches/explicit evaluation only while paused, enable/disable/conditional breakpoints, bounded source-identity-aware persistence and simple typed package/test debug configurations.

### Concurrency & Race Tooling
- [x] `go run -race` integration with editor warning banners.
- [x] Runtime signal sampling and blocked construct detection.
- [x] Channel counterpart mapping and jump actions.
- [ ] Go Static Single Assignment (SSA) dataflow analysis for channel pairing accuracy.
- [ ] **P1** Race Explorer with reported accesses, reliable read/write/location parsing, source navigation, raw output and stale-finding removal.
- [ ] **P2** Channel buffer visualization/deadlock assistance and concurrency inspection must distinguish observed, inferred and unknown evidence; show capacity/length/relationships only when actual data supports them.
- [ ] **P2** Bounded optional sampled timeline, panic presentation and dedicated tested clickable stack-trace parsing; preserve raw output.

### Test & Coverage Workflow
- [ ] **P0** First-class `go test -json` domain and visual result panel with package/test/status/duration/output/reliable failure locations and not-run/running/passed/failed/skipped/cancelled/build-failed states.
- [ ] **P0** Correct current-package and workspace/go.work scopes, owned process-tree cancellation and reliable failure navigation. Tests execute only after user action.
- [ ] **P0** Semantic/canonical Run Test, Debug Test and valid package-main Run/Debug editor actions without expensive per-keystroke parsing.
- [ ] **P1** Go-aware Test Explorer (packages/tests/benchmarks/fuzz), run/debug/rerun; Run Benchmark output and explicit cancellable fuzzing.
- [ ] **P1** Actual package/workspace coverage profiles (`go test -coverprofile`), overall/file/line results and toggleable editor overlays; never estimate coverage.
- [ ] **P2** Bounded local benchmark history only when useful; no unsupported statistical regression claims.

### Terminal & Workbench
- [x] Persistent PTY shell sessions powered by `portable-pty`.
- [x] Dual terminal workbench layout (Shell and Process Logs).
- [x] Bounded viewport layout and resizable splitters.
- [ ] Split terminal panes within the terminal dock.
- [ ] **P0** Configurable default shell executable (pwsh, bash, zsh, fish) through the typed settings subsystem.
- [ ] **P0** Typed settings with validated defaults and meaningful Editor/Go/Files/Terminal/Debug/Git/Appearance groups; consolidate existing scattered storage before adding settings.
- [ ] **P1** Settings search, keybinding inspection/edit/conflict/reset and conservative configurable autosave coordinated with formatting/imports/conflicts.
- [ ] **P1** Typed output channels, clear empty/loading states, toolchain-focused first run, authoritative About/version/platform data and keyboard/focus/contrast/accessibility validation.
- [ ] **P2** Workspace settings without secrets, bounded Quick Open/command history; do not capture terminal input history.

### Workspace & Source Control
- [x] Hierarchical filesystem explorer.
- [x] Guard active editor buffers when opening files/workspaces, scope and cancel autosaves, and retain edits during pending I/O (Vitest document-safety regressions).
- [x] Native filesystem watching with polling fallback, independent subscription cleanup, bounded scans, and link-traversal protection. Windows regressions cover actual changes, duplicate starts, app teardown, and junctions; hosted macOS/Linux runs remain to be verified.
- [ ] Complete data-safety validation for application shutdown, branch switching, external changes, and Explorer rename/delete. Backend workspace-root and symlink-entry protections are covered; frontend conflict/dirty-buffer workflows remain.
- [x] Workspace-wide search and replace (`SearchPanel`).
- [x] **P0** Git branch switching with dirty-state dialog: save before inspecting Git/checkout, resave on confirmation, block failed/in-flight saves and late edits, lock mutation, reload without replaying previous-branch content, and retire missing destination files (branch-safety regression suite). This does not complete every document transition.
- [ ] **P0** Save All dirty writable documents with per-file/partial failure reporting, removed-file and permission handling; expose through commands. Multi-document ownership and Save All are implemented; complete native preservation acceptance remains required.
- [ ] **P0** Explicit Save/Don't Save/Cancel for tab/window/workspace/quit and Explorer deletion/rename/move where appropriate; preserve edits and block unsafe transitions.
- [ ] **P0** External modification/deletion/rename reconciliation: clean buffers safely reload, dirty buffers enter conflict. Compare/reload/keep/cancel must never silently overwrite changed disk content.
- [ ] **P0** Cached fuzzy Quick Open with recent ranking, keyboard/Enter/Escape, ignore rules, cancellation/invalidation and large-workspace responsiveness. Fuzzy ranking, recent/cache and native ignore-aware indexing are implemented; complete desktop performance acceptance remains.
- [ ] **P0** Reliable cancellable workspace search with include/exclude/ignore scope; replacement preview/counts and explicit partial failures, tested literal `$`, backslashes, Unicode and regex groups.
- [ ] **P0** Bounded recent workspaces and safe UI-only session restore; missing/moved/denied paths must not cause startup loops. Recreate processes; never restore live handles or stale diagnostics.
- [ ] **P1** Coherent Changes/Staged/Untracked source control, guarded binary/large/renamed/deleted diffs, stage/unstage/discard confirmation, explicit staged commits and Git error feedback. Existing branch picker remains the branch baseline.
- [ ] **P1** Large-workspace bounds and ignored/generated directory policy for indexing/search/watchers.
- [ ] **P2** Evaluate go.work before adding multi-root; implement only with demonstrated need and architecture/capability evidence.

### Go Modules & Toolchain
- [ ] **P0** Detect go.mod/go.work, single/multi-module and non-module contexts; determine operation scopes using actual Go semantics.
- [ ] **P0** Toolchain paths/versions/ready/missing/failed/unknown states and workflow preflight for Go/gopls/Delve; missing tools never block normal text editing.
- [ ] **P0** Explicit module-aware `go mod tidy`/download with visible output, useful errors and cancellation. Never run tidy automatically after arbitrary edits.
- [ ] **P1** Selective actual `go env` context and concise module/tool status; simple typed run configurations only for needed workflows.
- [ ] **P2** Explicit generate/vet/minimal justified task workflows with output/cancellation; project-controlled arbitrary tasks need trust/consent. Do not execute project code just by opening a workspace.

### Packaging, Security & Release Engineering
- [x] Cross-platform GitHub Actions release workflow.
- [x] SHA-256 checksum manifest generation (`SHA256SUMS.txt`).
- [x] Conventional Commit release note and changelog automation.
- [x] Automated Dependabot updates for npm, cargo, and actions.
- [ ] Code signing for Windows (Authenticode) and macOS (Apple Notarization).
- [ ] **P1** Tauri auto-updater only after trusted/signed channel-aware release metadata, consent and failure recovery exist; otherwise retain as roadmap work.
- [ ] **P0/P1** Dedicated failure/cancellation/stale-result/process-cleanup tests, portable paths including spaces/Unicode, native manual validation where available and truthful feature/release reports.

### Post-1.0 Scope
- [ ] Extensions and marketplace only after API stability, sandbox/security and compatibility design.
- [ ] AI features only with separate product/privacy/security design; not required for the Go-native core.
- [ ] Accounts/cloud sync, remote SSH/container development and real-time collaboration only with explicit product justification.
- [ ] Database/Docker/Kubernetes IDE tooling is outside the initial Goro scope.
