# GoIDE Product Roadmap

This document outlines the engineering and product roadmap for GoIDE leading toward its first production-stable 1.0 release.

> [!NOTE]
> Historical `v1.x` prototype tags do not indicate product maturity. GoIDE is currently following a pre-1.0 stabilization track (`0.x.y`) to systematically harden core subsystems before declaring 1.0 stability.

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

### Phase 2: Alpha Releases (`v0.2.x`) (Active Target: `v0.2.0-alpha.1`)
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

P0 is required core before approaching Beta. P1 is the strong initial-stable target. P2 differentiates GoIDE after P0 workflows are reliable. Post-1.0 is explicitly outside the initial release. Missing P2 alone does not block Alpha/Beta/RC unless selected as part of that release's feature set.

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
- [x] CodeMirror 6 Go syntax highlighting and bracket pairing.
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
- [ ] **P0** Save All dirty writable documents with per-file/partial failure reporting, removed-file and permission handling; expose through commands. Current editor is single-document, so multi-document ownership comes first.
- [ ] **P0** Explicit Save/Don't Save/Cancel for tab/window/workspace/quit and Explorer deletion/rename/move where appropriate; preserve edits and block unsafe transitions.
- [ ] **P0** External modification/deletion/rename reconciliation: clean buffers safely reload, dirty buffers enter conflict. Compare/reload/keep/cancel must never silently overwrite changed disk content.
- [ ] **P0** Cached fuzzy Quick Open with recent ranking, keyboard/Enter/Escape, ignore rules, cancellation/invalidation and large-workspace responsiveness. Current Ctrl+P picker filters a per-open scan without rescanning per keystroke; fuzzy/recent/cache requirements remain.
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
- [ ] Database/Docker/Kubernetes IDE tooling is outside the initial GoIDE scope.

## 3. Product Completion Evidence

The target journey is open -> navigate -> edit -> format/save -> diagnose -> run/test/debug -> inspect concurrency -> fix -> commit -> close/reopen/restore. Fundamental reliability takes precedence over feature count.

Each meaningful milestone reports implemented/hardened work, tests, bugs found/fixed, performance/security findings, remaining P0/P1/P2, validation (PASS/FAIL/NOT RUN/BLOCKED BY ENVIRONMENT) and the next dependency milestone. Do not invent completion percentages or claim runtime data unsupported by Go/gopls/Delve. Before Stable, manually validate the complete journey and required install/upgrade/platform paths; automated mocks do not replace native evidence.

### Verified Source Control and Document Safety Foundation

- [x] Repository status uses porcelain v2 NUL records, keeps index/worktree states independent, preserves rename paths and exposes real conflict/operation state. Mutations target the opened repository root and use a per-repository lock.
- [x] Explicit stage/unstage and staged-only commits respect configured hooks/signing. Unified diffs distinguish index/worktree, binary files and bounded large output. Discard preserves the index; untracked deletion is a separate confirmed file-only operation.
- [x] Fetch, fast-forward-only Pull and explicit-target Push use configured named remotes and system Git authentication. No force push, config override, automatic retries or implicit staging. Cancellation stops owned Git processes and refreshes actual state.
- [x] Commit history pins ref tips while paging, includes merge parents/local and remote refs/tags/HEAD, and renders bounded virtual rows. The develop graph renderer is retained and connected to the typed history API. Commit details expose full messages, renamed paths, parent selection and historical diffs.
- [x] Existing-file saves require a disk-content baseline. External clean edits reload; dirty/deleted buffers remain available for compare, confirmed reload/overwrite or copying. A deleted file is never recreated by autosave. This is optimistic conflict detection, not an OS-level atomic compare-and-swap against arbitrary external writers.
- [x] Explorer mutations preserve affected buffers, block failed/in-flight saves, remap active paths and retire deleted editor identities. Native close/quit routes through Save/Discard/Cancel and shared resource teardown; registration is serialized against final shutdown.
- [ ] Finish remaining conflict shapes, stash/history operations and the remaining Git prompt requirements. The text conflict editor below does not cover binary/submodule/missing-result workflows.
- [ ] Complete multi-document ownership, Save All, every transition choice, cached fuzzy navigation, Go/LSP/test/debug workflows and the remaining feature addendum requirements above.
- [ ] Verify real native quit/cancellation/descendant ownership and clean install/upgrade on required platforms. Windows automated suites do not establish macOS/Linux or release readiness. Do not create or push release tags.

### Conflict Resolution and Scoped Search

- [x] Regular UTF-8 Git conflicts expose actual index Base/Current/Incoming stages and an editable Result. Saving keeps the index unresolved; a separately confirmed Stage Resolved checks both reviewed index and disk content. A merge commit remains explicit after all conflicts are staged.
- [x] Conflict result drafts survive panel unmount and participate in workspace/app-close preservation. Binary, large, symlink/submodule and missing-result conflicts retain a terminal escape; these unsupported shapes do not imply complete conflict release-gate validation.
- [x] Create Branch validates through Git, accepts a verified start commit in the typed domain and retains the current branch/worktree. The current panel creates from HEAD; graph context actions remain unfinished.
- [x] Workspace text search uses one native Unicode/case/whole-word/regex engine, includes/excludes real glob scopes and respects ignore files/generated directories. Requests have cancellation and bounded traversal/results, with visible limit reports.
- [x] Replace prepares native before/after previews using the same matching semantics, preserves CRLF/EOF and literal replacement text, requires review and writes with explicit disk baselines. Only listed result lines are replaced; partial failure reports completed files and stops the remainder.
- [x] Text document reads reject binary/non-UTF-8 files and enforce a 4 MiB read limit. Replacement preview has tighter file/batch limits.
- [x] Windows app descendants inherit an OS job before tool launch; Git owns a nested job and drains output after descendants stop. Shutdown rejects new Git work, cancels active Git and waits for owned runners. An isolated real-process test covers a descendant surviving parent exit and an unrelated live process.
- [ ] Complete all remaining Git/addendum requirements and real native developer-session/platform release gates. These automated slices do not establish Beta/Stable readiness; no release tags.

### Run and Debug Process Ownership

Go Run and Delve now use explicit owned-child identities and Windows child jobs. Completion of an old run cannot retire a replacement run. Run output is drained with bounded chunks and a visible 2 MiB per-stream truncation notice; Delve startup uses a bounded readiness channel. DAP headers and bodies reject oversized frames before allocation. Windows fixture tests cover parent exit, descendant cleanup, explicit stop and preservation of an unrelated process. Native app workflow checks and macOS/Linux lifecycle verification remain required; this milestone does not satisfy the full addendum or release gate.

### Cached Quick Open and Retained Conflict Draft Safety

Quick Open now reuses its workspace index until a filesystem revision changes, supports fuzzy filename matching and prioritizes recently opened files. Index traversal is bounded and partial failures are visible. The picker uses the shared modal dialog for keyboard focus. Explorer refuses moving/deleting paths containing retained conflict result drafts; edits arriving during conflict saves retain their buffer and advance their disk baseline for retry. Multi-document editing, Save All and the shared command registry are still pending P0 work.

### Shared Workbench Command Registry

The workbench now uses one command registry for global shortcuts and a searchable Command Palette (Ctrl+Shift+P or Cmd+Shift+P). Open Workspace, Quick Open, Save Active File, workspace search, terminal visibility, Run/Race/Stop, Debug controls and symbol navigation share command definitions and availability reasons. Matching uses exact platform modifiers and skips modal/composing input. Stop Run reports success only after backend confirmation; Pause/Continue UI follows observed debugger state. Multi-document Save All, configurable keybindings and the remaining addendum workflows are still pending.

### Multi-document Editing and Save All

Editor tabs now retain independent dirty buffers and disk baselines. Returning to an open tab preserves edits without rereading over them. Per-tab CodeMirror undo history, selection and scroll state survive tab switches when the buffer still matches; external reloads invalidate old history. Save All (Ctrl+Alt+S) uses each dirty document's baseline, stops at the first failure and retains failed/remaining edits. Closing a dirty tab and changing workspace offer Save / Don't Save / Cancel. Native metadata marks read-only files; binary/non-UTF-8 and files beyond 4 MiB are rejected. App-close, Git and Explorer preservation now consider all open documents, while branch changes retire old branch documents. Persistent session recovery, Save As, configurable keybindings, remaining LSP/test/debug workflows and full Git requirements remain unfinished; no release tags.

## Problems panel milestone

The workbench now combines known gopls diagnostics with located Go compiler errors from the current Run in a dedicated Problems panel. Filter by text or severity, select a result to open its file at the reported line and column, and use the command palette or Ctrl/Cmd+Shift+M to show the panel. Alt+F8 and Alt+Shift+F8 navigate results. Counts describe known results, not a completed workspace-wide analysis.

Editing invalidates the affected diagnostics and the previous compiler results. Filesystem changes invalidate cached diagnostics and schedule a fresh active-file query. Workspace/branch transitions retire prior results. Build output remains available in Logs after its Problems results become obsolete. Persistent LSP workspace diagnostics, related information, and structured test/race problem sources remain unfinished; this milestone does not meet the complete addendum or release gate.

## gopls teardown hardening

The persistent gopls process now owns its process tree through a synchronous native owner. Teardown terminates descendants even when the root exits first, reaps the root, then joins its bounded protocol reader. Explicit application shutdown propagates teardown failures. LSP headers are bounded at 16 KiB before allocation, duplicate Content-Length headers are rejected, and bodies remain bounded at 16 MiB. Windows tests verify scoped descendant termination, an unrelated process surviving, and repeated stop calls; parser and session teardown tests pass. This is lifecycle hardening, not completion of the addendum's language features or platform release gates.

## Workspace language queries milestone

Go to Definition (F12), Find References (Shift+F12), and Show Symbol Information are available through the shared command palette. They query the owned persistent gopls session, synchronize all open Go buffers including unsaved text, and close retired overlays. Located results open a workspace file at its reported UTF-16 line/column. Symbol information is displayed as plain text, including protocol Markdown, without executing markup. Edits, tab/workspace changes, closing results, and unmounting reject late frontend responses.

Requests validate scoped Go files and positions, limit the synchronized set to 100 documents / 4 MiB, bound returned locations, and share a 45-second query deadline to accommodate cold package loading. Tooling errors are visible. Locations outside the workspace are counted explicitly and cannot be opened by this view yet. Automatic hover tooltips, signature help, rename, formatting/imports, code actions, navigation history, and native query cancellation remain unfinished; this milestone does not complete the language-feature P0 or release gates.

Validation includes real gopls definition/reference/hover queries over unsaved changes across two files without writing disk, protocol content/location parsing, Windows URI normalization, frontend stale-response/error handling, and EditorShell F12 navigation to the returned file/detailed position. The implementation follows the [LSP 3.17 language feature specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#languageFeatures).

## Reviewed Format Document milestone

Format Document (Shift+Alt+F, also in the command palette) requests actual gopls formatting edits for the current unsaved Go buffer. A review dialog shows complete before/after source. Cancel leaves the buffer unchanged; Apply marks the edited buffer dirty without writing disk or changing its saved baseline. A later Save/Save All retains optimistic conflict checks. The shared document edit operation validates an entire proposed set before publishing any change, refuses changed snapshots/read-only files/invalid or duplicate paths/pending saves, and retains baselines for already-open and newly opened documents.

Native edit conversion validates UTF-16 positions, Unicode scalar boundaries, range ordering and overlaps, and the existing size limits. Reviewed controlled values synchronize immediately before the editor wrapper can defer them behind a typing timer. CodeMirror changes retain cursor placement through whitespace-only formatting and support Undo; other changes conservatively retain a clamped line/column. Applying a format retires stale diagnostics and completion requests. Tests cover real gopls formatting without disk writes, CRLF/Unicode/range safety, review cancellation and stale results, multi-file atomicity and baseline retention, real CodeMirror cursor/Undo behavior, and EditorShell format-review-save integration. Format on Save, Organize Imports, Rename and Code Actions remain unfinished. This milestone does not complete the addendum or release gates.

## Reviewed Organize Imports milestone

Organize Imports is available in the shared command palette and requests the actual `source.organizeImports` gopls code action for the current unsaved Go buffer. The same complete before/after review, Cancel, Apply-to-Editor, dirty-state and saved-baseline rules used by Format Document apply. No handwritten import sorter or implicit disk write is used. Empty returned edits are described as no changes returned by gopls.

The persistent session tracks the versions it sends for each open document. Both WorkspaceEdit `changes` and versioned `documentChanges` are accepted for the requested file; stale versions, other files, overlaps and resource operations are rejected before applying. Disabled actions show their returned reason. Unresolved actions may be resolved through gopls; actions requiring unsupported command execution or multiple-choice selection report that limitation. Automatic import organization on Save and the broader Code Actions chooser remain unfinished.

Validation includes real gopls adding a missing fmt import and removing an unused os import from unsaved text without writing disk, version/path/resource-operation rejection, palette review/Cancel/Apply integration, and completion/server-teardown compatibility. See the official [gopls code transformation documentation](https://go.dev/gopls/features/transformation).

### Reviewed symbol rename checkpoint — 2026-10-03

F2 and Rename Symbol use gopls prepareRename/rename against current Go buffers. Preview captures affected closed Go files, synchronizes their immutable overlays, and requests the edit again before showing complete before/after text. Apply validates the whole document snapshot and changes all buffers in one publish; Save/Save All retain original disk baselines and external-change checks. Cancel, stale responses, invalid identifiers, read-only files, out-of-workspace edits, stale document versions and unsupported resource operations never apply partial edits.

Budgets: 100 source documents / 4 MiB, 8 MiB preview, 10,000 edits per file. Package/file renames and broader transformations are explicitly unsupported in this checkpoint. Edits resolve UTF-16 positions once and build each changed document linearly. This checkpoint does not complete the addendum or authorize a release/tag.

### All-open-document disk synchronization — 2026-10-03

Workspace watcher revisions and window focus now inspect inactive open tabs as well as the active document. Clean inactive buffers reload changed disk content; dirty or deleted buffers remain intact and appear in an accessible Review list. Selecting a conflict activates that document's existing disk/editor review. Failed reads retain conflict evidence and never masquerade as deletion. Reads are invalidated on workspace/tab transitions and unmount; edits, newer save baselines and pending Git/Explorer/save operations prevent stale reloads. Blocked operation transitions trigger a new scan. Checks are sequential and bounded by the 100 open-document cap and native file read limits.

This checkpoint adds detection for inactive tabs, not crash recovery or Save As. No release/tag is authorized by this checkpoint.

### Bounded one-shot tool ownership — 2026-10-03

The gopls check/symbols/completion CLI fallback and Go/gopls/Delve version probes now use an owned synchronous child tree. They drain stdout/stderr concurrently with a 2 MiB limit per stream, accept at most 4 MiB stdin, run for at most 45 seconds, and terminate descendants on success, timeout or app shutdown. Truncated output is reported as failure instead of complete diagnostics. Pipe workers participate in the shutdown registry; shutdown waits for them or returns an error and keeps the window open. gopls diagnostic/symbol targets must be scoped regular files and are passed as canonical absolute paths.

Windows checks cover execution deadline, retaining an unrelated process, and stopping descendants after the root exits. A real gopls CLI test preserves a located diagnostic in a Unicode/space path and rejects traversal. macOS/Linux execution and complete PTY ownership remain separate release-gate work. No release/tag is authorized.

### Native commit history search — 2026-10-03

Git Graph now offers message, author and commit-hash search backed by repository Git history, including commits not yet loaded in the graph. Message searches include full commit bodies; message/author patterns are literal and case-insensitive. Search pages pin ref tips and return 100 results, with a 2000-result UI cap and 10,000-result offset safety limit. Hash search requires a 7–64 hex-character ID, which Git resolves and verifies as a commit; ambiguous/missing objects surface errors. Search uses read-only commands, suppresses notes/signature/decorations, and preserves the graph's complete loaded topology. Selecting a result opens the existing commit details and parent-based diff workflow. Edits to search input, workspace switches, graph refresh and unmount invalidate stale results.

Real repository tests cover literal regexp metacharacters, full-body matches, author identity, hash validation, pagination and refs changing after the pinned search. This is not completion of stash, rebase, hunk staging or the release gate. No tag/release is authorized. Native matching follows [Git log documentation](https://git-scm.com/docs/git-log).

### File history checkpoint — 2026-10-03

Each Source Control status row offers History, which opens a native file-history search and existing commit details/parent diff workflow. File paths remain literal Git pathspecs, preserve significant spaces, and reject traversal/root aliases; they are not glob patterns. Git follows detectable renames and supports deleted files. Results retain the existing pinned scope, pagination, stale-response protection and safety limits. History actions never save, stage or change files. The searchable history list preserves the full graph layout instead of inventing edges among filtered commits.

Real repository tests cover renames, deletion, skipped-result pagination and a bracket-name glob collision. UI tests verify exact row-to-request routing without a mutation or save transaction. Broader Git actions, PTY teardown, native language cancellation and other addendum requirements remain unfinished; no release/tag is authorized.
