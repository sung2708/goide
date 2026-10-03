# GoIDE Final Product Audit

Product name: **Goro**. Reviewed 2026-10-03 against develop `00b741d36b1b210937e55ad0d901ae09c6fac081` plus the workflow/documentation changes described below. This is an engineering acceptance report, not a release announcement. See [release readiness](RELEASE_READINESS.md) for acceptance procedures and existing commitments.

## Release Classification

**NOT READY.** Critical release gates: **3**. High-priority gates: **5**. Known non-blocking issue groups: **3**. These counts identify the named gates below; missing acceptance evidence is distinguished from reproduced product defects.

## Recommended Version

**NONE for publication.** Keep the existing `0.2.0-alpha.1` development version. No tag, main merge, version bump or release publication was performed.

## Executive Summary

The Windows backend has substantial automated evidence, including real Go/gopls/Delve integration. The production executable and both Windows installers built successfully; isolated process launch succeeded. It does not yet have complete native user-journey certification. Computer Use failed before API initialization, so neither browser previews nor mocked component tests are counted as desktop QA. Baseline frontend failures remain relevant even if later reruns pass. No claim of comprehensive completion, zero process leaks, measured editor performance or stable-release readiness is made.

## Automated Validation

Machine: Windows 10 Pro 10.0.19045 x64, Intel i7-8550U, approximately 31.6 GiB RAM. Installed tools: Go 1.26.5 windows/amd64, gopls v0.23.0, Delve 1.27.2. Assertions/timeouts were not relaxed.

| Check | Result | Limit |
| --- | --- | --- |
| Baseline `npm test` | **FAIL: 779/784 passed, 5 failed** | Concurrent with native tests/build; cause not established |
| Focused frontend rerun, serial files | **PASS: 32/32, 3 files** | Branch switch, completions, document safety; does not resolve baseline flakiness |
| Full frontend rerun before test hardening, serial files | **FAIL: 783/784 passed, 1 failed** | Failed-save workspace test could not find Save; build overlapped the later portion |
| Focused document safety after test hardening | **PASS: 23/23** | Includes new Auto Save Off timing case; unchanged timeout |
| Two-worker frontend suite after dirty-fixture hardening | **FAIL: 775/785, 10 failed, 122 files** | 7 deadline timeouts across branch/completion/symbols; 3 module-button readiness failures |
| Final one-worker default frontend suite | **PASS: 785/785, 122/122 files** | Same test/expectation deadlines; 514.10 s total |
| Default native suite, MSVC, serial tests | **PASS: 253, 24 ignored** | Ignored tests are not counted as passing here |
| Explicit native `--ignored`, serial tests | **PASS: 24/24** | Real installed tools; one Windows tool combination |
| TypeScript + Vite production build | **PASS** | Browser assets, not installed-app acceptance |
| Cargo fmt/check/Clippy all targets | **PASS** | MSVC helpers for native compilation |
| Version synchronization | **PASS** | npm/Cargo/Tauri 0.2.0-alpha.1; MSI 0.2.0 |
| Artifact selection/MSI conversion tests | **PASS: 4/4** | Scripts, not installation |
| Windows production desktop/package build | **PASS: executable, MSI, NSIS** | `scripts/tauri_build_msvc.cmd --ci`; no publication |
| Isolated desktop process launch | **PASS, limited smoke** | Responding Goro window; no UI interaction |
| Documentation links / diff whitespace | **PASS: 58 links, 20 documents** | Rechecked after report updates |
| Lint script | **NOT APPLICABLE** | No separate configured frontend lint command |

Native evidence includes actual unsaved-buffer completion/navigation, cross-file rename, format/imports, resolved code actions, cancellable language queries, scoped module/test execution, real breakpoints/locals, Debug Test, stale debugger control rejection and owned startup cleanup preserving other requests.

## Computer-Use Validation

**BLOCKED BY ENVIRONMENT.** The Windows Computer Use Node kernel failed with `failed to write kernel assets: The system cannot find the path specified. (os error 3)`. Resetting the kernel and retrying initialization produced the same error. No desktop API initialized; no clicks, keyboard walkthrough, screenshots or window-level acceptance were performed. This is an environment failure, not a reproduced application failure.

Five disposable QA projects were created outside the checkout: A simple Unicode CLI, B multipackage module, C intentional compile/test errors, D isolated Git history with staged/unstaged/untracked changes, and E goroutines/channel with an intentional race plus a mutex-protected counter test. A/B `go test` passed; A ran successfully. C produced expected compiler/test locations; E `go run -race` produced two race reports, while its mutex test passed `go test -race ./...`. Git CLI confirmed D's staged-plus-modified state. These establish fixture usability only; their corresponding IDE journeys are **NOT RUN**.

## Core Editor

Automated document/CodeEditor coverage exists; the focused safety suite passed. Real typing, caret/scroll stability, Undo/Redo under background work, IME and theme changes in the release app are **NOT RUN**. No keystroke latency measurement is claimed.

## File / Workspace

Baseline-checked writes, independent buffers and guarded close/workspace/Explorer transitions exist. Native external-change, denied-write, inactive-tab and app-close preservation acceptance is **BLOCKED**. Save As/export-copy and crash recovery remain missing stable-target protections; session metadata is not draft recovery.

## Navigation

Native ignore-aware bounded indexing and worker ranking exist. Actual 20,000-path picker/focus/cancellation acceptance is **NOT RUN**. Shared location routing, individual-result traversal, Back/Forward and symbol ergonomics remain tracked gaps; no added feature is claimed in this audit.

## Search / Replace

Existing range, regex, bounded-worker, dirty-buffer and disk-baseline tests are part of the suite. Installed-app Unicode/CRLF/review/partial-write journeys are **NOT RUN**. Unreadable-file partial-result handling remains a release-scope gap.

## Command Palette

Command model and component tests exist. Keyboard-only action discovery, focus restoration and consistent editor destinations require native acceptance.

## gopls / Language Intelligence

**PASS for the explicit Windows real-tool fixtures**, including unsaved cross-file queries, cancellation reuse, format, imports, rename, signature and reviewed code actions. Project-wide current Problems, killed-tool recovery and a declared supported-version/platform matrix remain unverified or incomplete. A responding version probe alone was not treated as integration evidence.

## Go Modules / Toolchain

Real plain-module/multi-module inspection, selected Go executable propagation, tidy/download and stale-workspace rejection passed. Native settings/setup and missing/incompatible-tool journeys are **NOT RUN**.

## Run

Real package-main scope, startup acknowledgement, stop and preservation of unrelated owned requests passed native fixtures. Installed-app output, failed execution, hanging program and retry journeys remain unverified.

## Tests

Actual package/workspace/build-failure scoping and streaming output passed. Multipackage QA fixture tests passed through Go CLI. Native tree selection/cancel/failure navigation is **NOT RUN**.

## Debugger

Real breakpoint, locals, selected Debug Test, stop-token ownership, actual exit retirement and startup cleanup fixtures passed. Desktop pause/step/frame-switch/restart/focus journeys and macOS/Linux tool compatibility are unverified.

## Goroutines / Concurrency

Concurrency inspection has native/component coverage. Actual UI with running goroutines, frame selection, long-lived sessions and rapid workspace changes is **NOT RUN**. Experimental analysis does not establish causality or absence of races.

## Race Detector

The disposable fixture produced actual Go race reports. IDE parsing, source navigation and stop/retry for that fixture are **NOT RUN**; CLI output is not an IDE acceptance pass.

## Terminal

PTY lifecycle tests exist. Native Unicode/input/resize/Ctrl+C/shell-exit acceptance is **NOT RUN**. Unix descendant containment is a known ownership gap; configurable shell support is incomplete. Documentation now accurately describes Unix `bash -l`.

## Source Control

Git backend/component tests exist, and the disposable repository is ready. Native commit/branch/stash/conflict/remote/hook-cancel journeys are **NOT RUN**. Cancellation lookup still depends on canonicalizing the live root, so deletion/retargeting can prevent lookup of the original operation. This is source-review evidence, not a newly reproduced GUI failure.

## Git Graph

History/graph implementation exists. Native selection, large-history behavior, diff consistency and keyboard focus remain unverified. Advanced Git completion commitments are not declared fulfilled.

## Settings / Keybindings

Typed versioned preferences, themes and reactive application settings have automated coverage. Corrupt-storage migration, failed persistence, conflict discoverability and editor preservation on theme changes require native acceptance.

## Session Restore

Bounded metadata restoration exists. Real restart/upgrade, missing roots and corrupt persisted state are **NOT RUN**. Unsaved drafts do not currently survive a crash through this mechanism.

## UI / UX

No visual redesign was introduced during hardening. Logo scale, responsive layout, coherent action labels and native error/focus feedback are unverified in this audit because window interaction is blocked.

## Accessibility

Native keyboard-only, screen-reader, IME and light/dark contrast walkthroughs are **NOT RUN**. Component role assertions are not full accessibility certification.

## Performance

**NOT MEASURED:** startup to editable state, input/render latency, scrolling, picker latency, steady memory and repeated workspace/debug/terminal churn. PRODUCT now calls sub-second startup a target. Build duration and test timing are not product responsiveness measurements.

## Process / Resource Lifecycle

Native ownership tests passed, including real tools preserving unrelated requests. Unix PTY descendant/session containment and Git root-independent cancellation remain open. Desktop close with active shell/debug/language/mutations and long-duration churn are **NOT RUN**. No global leak-free claim is made.

## Security / Privacy

Dated npm audit: production **0 findings**; full graph **2 moderate / 1 low / 0 high / 0 critical**, involving Vitest/mocker/esbuild development tooling. No uncontrolled major upgrade was applied. Rust advisory audit is **NOT RUN** (`cargo audit` is unavailable). Capability/license/signed-distribution review remains required; this audit does not certify native dependencies or arbitrary project execution as safe.

## Packaging

**PASS: current production build** generated `Goro.exe` (18,290,688 bytes), `Goro_0.2.0-alpha.1_x64_en-US.msi` (6,258,688 bytes) and `Goro_0.2.0-alpha.1_x64-setup.exe` (4,348,850 bytes). The fresh executable launched with a disposable WebView profile: live process, `Responding=True`, window title Goro, nonzero window handle, profile directory created and empty stderr. It was then force-stopped by its verified QA PID; graceful app exit was not tested. Profile isolation uses the documented [WebView2 user-data environment override](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/webview2-idl?view=webview2-0.9.622).

All three artifacts returned **NotSigned** from Authenticode checks. MSI/NSIS clean install, upgrade and uninstall are **NOT RUN**; no publisher-trust acceptance is inferred. Artifact SHA-256:

- MSI: `7BB1107B1A99A5A223CFC6A5BE4E02AE44A7EF63643276918A0506554D77F84A`
- NSIS: `9434888796080C8B2DFA0B23050DF33667C41880FCE048C4740F1695FF596FE2`

## Updater

No updater release journey was validated. A documented manual update path may suffice for an initial alpha; signed automatic updates are not claimed.

## Documentation Accuracy

Corrected current editor ownership/save behavior, Quick Open indexing, bottom-panel responsibilities, Unix shell behavior and Windows MSVC troubleshooting. Clarified that startup performance is an unmeasured target. Historical milestone results retain their revision context. No prompt transcripts, fixture source, screenshots, raw logs or scratch notes were added to version control.

## Bugs Found

Release workflow classified only alpha/beta/rc suffixes as prereleases, even though version validation accepts other valid suffixes. It also scheduled registry-sharing native fixtures in parallel unlike CI. The frontend baseline had five failures: branch switch, stale completion after workspace switch, unavailable-workspace preservation, dirty workspace close, and workspace Cancel/Don't Save. Four emitted runner stack errors; one could not find Cancel. A subsequent full rerun failed the failed-save workspace case (Save absent). Tests requiring a still-dirty manual-save decision left timed Auto Save enabled, so elapsed wall time could change that precondition. The Save All assertion also checked a textual bullet although the actual dirty marker is a span with a title, making that assertion ineffective. CPU contention as the explanation for the other baseline failures remains unproven.

## Bugs Fixed

Release prerelease classification now uses any validated version suffix. Release native tests use the same serial fixture scheduling as CI, retaining intentional concurrency tests. Manual dirty-decision test fixtures explicitly select Auto Save Off; dedicated autosave cases retain the default delayed behavior. Save All checks the real dirty markers before/after persistence. Full jsdom workbench files now run with one worker because the two-worker run exhausted unchanged deadlines on this host; individual tests still deliberately overlap operations. This affects test scheduling only, not product execution/concurrency or assertions. Canonical documentation errors described above were corrected. No production runtime repair or data-loss fix is claimed.

## Regression Tests Added

**One new case:** a dirty buffer with Auto Save Off survives 3,000 ms (beyond the default debounce), still requires a close decision, and Cancel retains the text with zero writes. Existing Save All coverage now requires two real dirty markers before saving and zero afterwards. Native default and installed-tool suites were run explicitly. Workflow classification was locally checked against stable, alpha, beta, rc and generic preview suffixes; hosted release execution is **NOT RUN**. No assertions were suppressed or timeouts increased to obtain a pass.

## Removed / Simplified UX

None; there was no verified dead interface removal or visual redesign.

## Critical Blockers

**3 gate groups:**

1. **C1 — Process containment:** Unix PTY descendants and live-path-dependent Git cancellation remain open ownership gaps. No unrelated processes may be killed and cleanup must be acknowledged.
2. **C2 — Preservation acceptance:** native external-file conflict, failed write, dirty close/Explorer/Git transitions and active-process app exit are blocked by Computer Use. Missing evidence is not a reproduced data-loss finding.
3. **C3 — Distribution/security acceptance:** clean install/upgrade/uninstall across claimed packages, signing policy, Rust advisories and capability/license review are incomplete. A successful build does not close this gate.

## High-Priority Blockers

**5 gate groups:** H2 project-wide diagnostic correctness; H3 shared navigation and unreadable-file partial search; H4 Save As/export-copy and crash-draft recovery for the stable target; H5 supported Go/gopls/Delve/platform matrix; H6 measured performance/accessibility and native focus consistency.

H1 test reliability was addressed locally by explicit dirty-buffer preconditions and one-worker default scheduling: the complete 785-test suite passed with unchanged deadlines. Both failing baseline runs remain recorded. This establishes the local test protocol; new-commit hosted CI and actual desktop performance remain separate acceptance evidence.

## Known Non-Blocking Issues

**3 groups:** configurable shell ergonomics; advanced Git/history actions beyond the focused initial release; advanced concurrency/trace claims that must remain accurately experimental. Existing prompt commitments are retained; these are not silently marked complete.

## Platform Validation

- **Windows: BLOCKED** for complete product acceptance. Native automated fixtures pass; desktop interaction and installer acceptance do not.
- **macOS: BLOCKED** for this audit; no macOS test machine/GUI journey or installer execution.
- **Linux: BLOCKED** for this audit; no Linux test machine/GUI journey or installer execution.

Earlier hosted multi-OS CI evidence is recorded in RELEASE_READINESS; it does not establish installed-app acceptance for this candidate.

## Remaining P0

C1–C3 above remain release-blocking gates. Do not reinterpret untested safety as passing or advertise a release candidate.

## Remaining P1

H2–H6 above remain open. Preserve baseline failures and the final complete pass; verify the new candidate's hosted checks before release certification.

## Release Pipeline Readiness

Local workflow hardening is complete for prerelease classification and native fixture scheduling. Tag-driven publication remains active; a non-publishing candidate validation path and exact-artifact manual acceptance are still required. No release workflow was triggered and no tag was created.

## Git Diff Summary

The change covers **11 files**: release workflow; ARCHITECTURE, PRODUCT, README, RELEASE, RELEASE_READINESS, TROUBLESHOOTING and this report; documentation validation; document-safety tests; and test-worker scheduling in vite.config.ts. No production application behavior, dependency lock, version, main history or tags were changed. Existing untracked `.playwright-mcp/` and `dist-release/` were preserved and excluded. Tauri's Cargo.toml line-ending rewrite was restored to the existing Windows checkout style without semantic edits. Final frontend build passed after hardening and produced the same asset names/hashes as the packaged build.

## Recommendation for Next Action

Restore the Windows Computer Use environment, then run the isolated preservation/process/Git/typing journeys in the exact built app and record observed outcomes. Close C1 ownership gaps with adversarial regression fixtures. Verify hosted checks with the newly validated test scheduling; do not suppress assertions or increase deadlines just to pass. Certify security/packages and every declared platform before selecting a public version. This audit stops short of complete native certification because the required interaction environment is irrecoverably unavailable in this session.
