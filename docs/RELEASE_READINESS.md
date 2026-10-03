# Goro Release Readiness

Initial readiness review on 2026-10-03 used develop `0455c6e41b882d5a6fa32155a59d9b3873d7913d`. The subsequent [final product audit](FINAL_PRODUCT_AUDIT.md) records full-suite, installed-tool and Windows build/launch evidence against `00b741d36b1b210937e55ad0d901ae09c6fac081` plus hardening changes. This remains the release decision checklist; historical milestone text in ROADMAP/TESTING is evidence for its named revision, not current acceptance.

**Release classification: NOT READY. Recommended release version: NONE.**

The implementation is substantial enough for internal Go development testing. Public release readiness is not established: process containment gaps, incomplete native acceptance, unverified installers and incomplete security/toolchain compatibility evidence remain. This is not a finding that every unfinished feature is a critical defect. No tag, version change, main merge or publication is authorized by this review.

## A focused Go IDE release scope

The first dependable release should let a developer open a real Go project, edit safely, understand compiler/language errors, navigate code, format/refactor, run/test/debug, use a terminal, commit changes and resume work. Reliability of this journey takes precedence over a larger feature list.

| Area | Required everyday capability | Current implementation and evidence | Release acceptance still needed |
| --- | --- | --- | --- |
| Documents and Explorer | Multiple files, Undo/Redo, Save/Save All, safe close/rename/delete, external-change review | DocumentSession, all-open-document disk synchronization, baseline-checked writes and guarded transitions; document/EditorShell safety tests | Installed-app journey with concurrent external edits, denied/deleted files, failed saves and close cancellation; recoverable drafts must survive every failed transition |
| Editing | Go highlighting, indentation, brackets, find/replace, readable themes and keyboard focus | CodeEditor; single-Undo replacement, regex worker and callback-stability regressions | Actual typing/scroll/focus/IME/large-file measurements; no caret movement from background work |
| gopls | Completion, hover, signature, definitions/references, rename, format/imports, useful quick fixes | language hooks, gopls integration, validated workspace edits and opt-in save preparation | Reproducible real-tool tests for a supported version matrix; restart/cancel under edits and module changes; workspace-wide current diagnostics/Problems acceptance |
| Navigation and search | Quick Open, commands, Go to Line, bounded exact search and reviewed replacement | Ignore-aware native index, worker ranking, UTF-16 ranges and baseline-checked replacement | Individual-match keyboard traversal, shared action/location consistency, partial unreadable-file handling, native responsiveness and focus; Back/Forward is missing |
| Go project | Correct package/module/go.work scope, selected tools, explicit tidy/download | Project inspection, executable preferences, guarded cancellable module commands | Installed-app single/multi-module and missing/incompatible-tool journeys; repeat after go.mod/go.work changes |
| Run and tests | Run package main, visible output/status, package/workspace/single-test execution and cancellation | Semantic entry actions, structured Go test runner, bounded native execution and cleanup acknowledgement | Real Go execution across selected platforms, compile failure/hang/cancel and retry; default CI alone excludes some real-tool tests |
| Debugging | Breakpoints, continue/pause/step, real stack/goroutines/locals, frame switching, Debug Test | Delve inspection UI and native Debug Test implementation; real-tool fixtures exist | Run tool-dependent fixtures explicitly, not only the default suite; installed-app stop/restart/stale-frame/large-variable acceptance |
| Terminal | Interactive shell, resize, Unicode, bounded replay and reliable stop/exit | PTY lifecycle and Windows owned-child registration | Unix descendant/session containment; native interactive Ctrl+C, shell exit, readers and app shutdown; configurable shell remains incomplete |
| Git | Changes/Staged/Untracked, diff, explicit staged commit, branch switch, fetch/pull/push, stash, conflict review | SourceControl, native Git domain, history/graph and guarded document transactions | Root deletion/retarget cancellation identity; real conflict/failed-network/hook cancellation/native focus journeys; advanced Git prompt remains a separate completion commitment |
| Settings and sessions | Clear tool setup, fonts/tabs/wrap/themes, optional save actions, recent workspaces/tabs | Typed versioned settings and bounded disk-backed restoration | Migration/corruption/write-failure acceptance in installed app; About/version and prerequisites must match the shipped artifact |
| Security and privacy | Scoped files, bounded IPC/output, owned tools, no silent source upload or credential disclosure | Canonical path checks, CSP/capabilities, output limits, local search | Rust advisory/license review, npm dev advisory disposition, native capability review and explicit execution/trust expectations for project code |
| Distribution | Correct packages, checksums, install/upgrade/uninstall and truthful support | Four-target packaging workflow and tested naming/MSI conversion scripts | Build exact candidate artifacts, signing/notarization policy, clean-machine install/upgrade tests and recovery guidance |

Implemented means source and tests exist; it does not mean complete native/platform certification. Each row requires evidence against the exact candidate commit and declared OS/architecture/tool versions.

## Blocking work, in dependency order

### R1 — Close process ownership gaps

`src-tauri/src/integration/shell/owned_child.rs` uses the custom Windows owner but delegates Unix spawn to portable-pty. `shell.rs` kills/reaps the shell and joins its reader; this is insufficient evidence that every descendant or changed process group is contained. This is a known ownership gap, not a newly reproduced leak in this review.

`src-tauri/src/integration/git/mod.rs::cancel` canonicalizes the current root to look up cancellation. External deletion or retargeting can prevent lookup of the original operation. Give each operation a stable request identity independent of a subsequently changed filesystem path, retaining workspace authorization at registration.

Acceptance: cancel and close during startup/execution/teardown; root exits before descendants; descendants retain pipes or create groups; root deleted/retargeted; cleanup fails and is retried; unrelated processes remain alive. Never release mutation ownership before cleanup is acknowledged. Exercise Windows, Linux and macOS independently.

### R2 — Certify document preservation and recovery

Existing safeguards must be tested end to end, not replaced with new dialogs. Include multiple dirty tabs, inactive external changes, rename/delete collisions, read-only and deleted files, disk-write failure, save actions, bulk replacement, Git transitions and app exit. Cancel and failed writes must preserve every affected draft and original disk baseline. Partial batch results must identify completed, failed and untouched files.

A Save As/export-copy escape is missing and should be added before the dependable stable target. Crash recovery of unsaved drafts is also absent: design a bounded local recovery journal with explicit restore/discard, never automatic overwrite, and privacy/retention controls. Do not claim session restoration protects unsaved text; it currently stores view metadata only. Alpha can disclose lack of crash recovery after normal preservation is proven; the stable target should protect accidental crashes as well.

### R3 — Validate real Go tooling and developer diagnostics

Declare exact tested Go/gopls/Delve combinations and supported OS architectures. Do not combine a blanket Go 1.21+ promise with unrestricted latest tools: [gopls has its own Go support policy](https://go.dev/gopls/). A tool responding to --version does not prove project/debug compatibility.

Run installed-tool fixtures explicitly in a separate supported-tool job/test-machine protocol, including formatting/imports, cross-file rename, signature/navigation, main-package execution, go.work tests and Debug Test. Some native fixtures use #[ignore] and are therefore excluded from a green default Cargo suite. Record each exclusion and its replacement evidence.

Make Problems reflect current relevant project diagnostics, not just active-file results and parsed compiler stderr. Preserve source/range/code identity, invalidate obsolete errors, and handle a killed or incompatible gopls without blocking ordinary editing. Native cancellation already exists for language queries; verify it rather than describing it as entirely missing.

### R4 — Finish navigation/search reliability and essential ergonomics

Complete individual-result keyboard traversal and shared command/location routing. Workspace search currently fails wholesale on an unreadable file; partial usable results need explicit errors. Disk-based search must clearly distinguish dirty buffers, prevent stale navigation/replacement and retain exact reviewed scope. Back/Forward source-jump history and semantic document/workspace symbol pickers are valuable final ergonomics for the focused stable target.

Do not expand replacement until existing limits, dirty guards, baseline checks, review cancellation and per-file outcomes are reliable. The native Quick Open index is implemented; its large-workspace desktop performance is still unmeasured.

### R5 — Measure desktop performance and accessibility

Use a release build, state OS/hardware/tool versions, and report cold versus warm runs. Fixtures: ordinary single-module project, go.work project, 20,000 paths with ignored generated trees, Unicode/space paths, CRLF/BOM, long lines and files approaching the existing read limit.

Measure startup to editable state, keystroke-to-render and scroll latency, picker open/query latency, index duration, steady memory and repeated workspace/terminal/debug churn. Existing ranking-function timings are not editor or picker performance. The under-one-second startup goal in PRODUCT.md is a target, not a measured result.

Set and approve budgets before acceptance; record observations and failures without changing product limits solely to pass a test. Keyboard-only navigation, focus restoration, IME, light/dark contrast and a native screen-reader walkthrough must pass. Stable logo visibility and theme changes must not recreate the editor or terminal.

### R6 — Certify packages, security and release automation

The current CI validates source; it does not build/install all distributable targets. The tag workflow publishes automatically after builds, so a non-publishing build/validation path is needed to inspect candidate artifacts before tagging.

CI serializes native tests because fixtures share app/tool registries. Final hardening aligns the release workflow with that scheduling, retaining dedicated intentional concurrency tests, and recognizes all validated prerelease suffixes. The 24 ignored real-tool fixtures passed when explicitly run on Windows with Go 1.26.5, gopls v0.23.0 and Delve 1.27.2; this does not certify other tool/platform combinations. See [the final product audit](FINAL_PRODUCT_AUDIT.md) for current suite results and environment limitations. Candidate authorization, immutable tags, artifact/version checks and failure recovery still need acceptance before using tag-driven publication.

Tracked config/workflow does not establish signing/notarization credentials or their successful use. Decide and document the trust model. A polished public macOS distribution should validate Developer ID signing/notarization according to [Tauri's signing guide](https://v2.tauri.app/distribute/sign/macos/); Windows signing and SmartScreen behavior also need an explicit policy. Checksums provide integrity verification, not trusted publisher identity.

Test Windows NSIS/MSI, macOS Apple Silicon/Intel DMG and Linux AppImage/deb if all remain declared targets. Include WebView/runtime prerequisites, first launch, executable/icon/version, paths with spaces, tool discovery, upgrade with retained settings, uninstall and missing-tool fallback. Do not claim a target supported merely because source tests compile on one runner. A narrower initial release requires explicit support-policy and asset-matrix changes; this audit does not silently drop platforms.

Rust dependency audit is NOT RUN here (cargo-audit unavailable), and security.yml currently checks npm only. Audit Cargo.lock and vendored dependencies, review license notices and capability scopes, and retain dated results. Address or explicitly disposition dev-tool advisories; do not run an uncontrolled major-version audit fix.

## Evidence collected during the initial readiness review

| Check | Result | Scope/limit |
| --- | --- | --- |
| Version synchronization | PASS | npm/Cargo/Tauri 0.2.0-alpha.1; numeric MSI 0.2.0 |
| Installer version and artifact-selection tests | PASS: 4 tests | Script behavior, not installer execution |
| npm audit, full dependency graph | 0 high / 0 critical; 2 moderate / 1 low | Vitest/@vitest/mocker and esbuild findings; dated advisory snapshot |
| npm audit, production dependencies | 0 reported findings | Does not audit Rust, embedded webview or native project execution |
| Rust dependency audit | NOT RUN | cargo-audit is not installed; no security pass inferred |
| Previous checkpoint a73233a | Hosted CI PASS, all four jobs | [Run 37127665455](https://github.com/sung2708/goide/actions/runs/37127665455) |
| Audited checkpoint 0455c6e | Hosted CI PASS, all four jobs | [Run 37128734206](https://github.com/sung2708/goide/actions/runs/37128734206); final status rechecked before this audit was committed |
| Latest index local verification | Previously PASS | 40 frontend + 7 Windows native checks, typecheck/build/Clippy; see TESTING.md |
| Native complete journey / installers / performance | NOT RUN in this review | Browser previews and unit mocks do not establish desktop acceptance |

No full suite was rerun solely for that initial documentation audit; the subsequent full validation is recorded in FINAL_PRODUCT_AUDIT.md. Exact-commit hosted status and preceding scoped results remain separate evidence. No claim of a newly reproduced data-loss bug, zero process leaks or global vulnerability clearance is made.

## Native release acceptance journey

Use isolated repositories and disposable projects; preserve users' real work. Record candidate SHA, machine, tool versions, action/result and logs without credentials/source secrets. Repeat applicable journeys on every claimed target.

1. Install a candidate package on a clean machine; open without tools; text editing works and setup errors explain the missing tools. Configure the tested toolchain and retry.
2. Open single-module and go.work projects under space/Unicode paths; inspect scope/environment; create files/folders through Explorer and build a package main.
3. Edit several tabs; Undo/Redo and switching preserve caret, scroll and history. Save/Save All and opt-in imports/format produce correct disk contents once.
4. Modify/delete/rename both active and inactive files externally. Verify clean reload, dirty review, failed reads/writes, readonly handling and retained drafts.
5. Complete completion/hover/signature/definition/references/rename and quick-fix journeys with unsaved buffers. Kill gopls, retry, change modules and cancel an in-flight request; no stale edits/diagnostics apply.
6. Find/replace literal dollars/backslashes and regex captures over Unicode/CRLF; Undo one in-file Replace All. Review workspace replacements, exclude files, change a disk baseline and cause a later file to fail; exact outcomes remain visible.
7. Exercise Quick Open, palette, Go to Line, Search and pending Back/Forward/symbol workflows keyboard-only. Close/switch context during indexing and queries; late replies never navigate.
8. Run and test real packages, one selected test and a go.work workspace; trigger compiler/test failure, long output, hanging test, cancellation, lost IPC and retry cleanup. No unacknowledged operation permits a new mutation.
9. Debug package main and a selected test; inspect actual locals/stack/goroutines, step, switch frame and stop/restart. Old stop tokens cannot show or control a new session.
10. Resize/use the terminal, Ctrl+C a process and spawn descendants; close workspace/app during execution. Verify no owned process/readers remain and unrelated processes survive.
11. Stage one of two files, commit staged only, inspect history/diff, switch branches with dirty buffers, stash/apply/pop and resolve a real conflict. Include failed remote operations, hooks, cancelled mutation and root deletion/retargeting.
12. Restart and restore valid tabs; missing roots/invalid settings recover cleanly. Validate crash-draft recovery when implemented, then upgrade/uninstall and inspect settings preservation, artifact version/signature/checksum.

A walkthrough failure opens a named blocker. A flaky critical fixture is a reliability failure until diagnosed; rerunning green does not replace root-cause evidence. Never count ignored cases as passing.

## What can wait

AI/cloud indexing, plugin marketplace, remote development, elaborate graph animation, advanced trace/causality claims, coverage dashboards, fuzz/benchmark history, hunk staging/blame and broad interactive rebase UI need not expand the minimum release scope. Existing full Git/addendum/navigation prompts still have their own commitments; deferral in this focused release proposal does not declare those prompts completed or silently change their agreed requirements.

A safe manual-update path is sufficient initially; an auto-updater should wait for signed metadata, channel selection, consent and failure recovery. Existing race/concurrency features can ship with accurate experimental labels and must not destabilize the core editor or claim proof of causality.

## Decision gates

- **Alpha ready:** all critical preservation/ownership/security/build blockers closed; core native journey and candidate packaging actually work; remaining limitations disclosed. Partial feature coverage is acceptable.
- **Beta ready:** the focused everyday Go journey is usable end to end, P0 acceptance complete and supported-tool/platform evidence recorded. Work is primarily stabilization.
- **RC ready:** selected release scope frozen; native performance/accessibility, security and all claimed packages pass; docs/changelog reflect actual behavior.
- **Stable candidate:** RC evidence plus clean install/upgrade and recovery acceptance, no open release blockers. The human maintainer approves the first stable release under VERSIONING.md and the release decision prompt.

Do not choose a version until its maturity gate passes. Follow RELEASE.md only after this checklist is satisfied for the selected channel. The next engineering work is R1, then R2/R3; avoid adding P2 features before those dependencies are reliable.
