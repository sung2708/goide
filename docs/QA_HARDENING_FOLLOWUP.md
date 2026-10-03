# QA hardening follow-up — 2026-10-04

This follow-up starts from develop 928e3a4. It supplements, rather than replaces, the historical FINAL_PRODUCT_AUDIT.md and RELEASE_READINESS.md. Release classification remains NOT READY. No tag, main merge, production signing key, publication or website deployment is created.

## Git cancellation

Source Control assigns a UUID to each mutation and passes that UUID to Cancel. The native registry binds the original workspace alias and canonical repository path at registration. Cancellation does not canonicalize a live path: it still reaches the registered token after deletion, movement or alias retargeting. Repository-validation subprocesses are covered by the registration. Stale IDs cannot cancel the next operation, and an ambiguous legacy alias fails closed. Late cancellation responses cannot replace errors from a newer operation.

Regression coverage includes original-path removal/replacement, wrong workspace, stale ID, retargeted alias ambiguity, and a real Git pre-commit hook that is stopped without changing another repository. Root mutation ownership and process teardown remain separate obligations; this change does not claim complete Unix terminal containment.

## Dependency security

The initial npm audit had two moderate and one low entries. Vitest was deliberately upgraded from 3.2.7 to the patched 4.1.11 line; esbuild was updated to 0.28.2 inside Vite's supported dependency range. The subsequent full-graph npm audit reports zero findings. This is a controlled upgrade with suite/build validation, not an audit --force upgrade.

Primary advisories: [Vitest redirect mocks](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9), [esbuild Windows development server](https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr).

Installed cargo-audit 0.22.2 and audited both tracked lockfiles against RustSec database revision ef6173cbc5c50ec8166f9a5b28f07834144373ee (updated October 3, 2026). The application initially had two quick-xml vulnerability records. Targeted compatible updates changed anyhow 1.0.102 → 1.0.104, event-listener 5.4.1 → 5.4.2, plist 1.8.0 → 1.10.0, quick-xml 0.38.4 → 0.41.0 and rand 0.8.5 → 0.8.8. Post-update vulnerability count is zero. The separate signature verifier has zero vulnerabilities and no warnings.

Primary XML advisories: [RUSTSEC-2026-0194](https://rustsec.org/advisories/RUSTSEC-2026-0194.html), [RUSTSEC-2026-0195](https://rustsec.org/advisories/RUSTSEC-2026-0195.html).

Application warnings are still visible and are not ignored:

- glib 0.18.5: RUSTSEC-2024-0429, Linux GTK VariantStrIter unsoundness. The app has no direct use of the affected iterator; upgrading to glib 0.20 is not compatible with the current GTK3 dependency tree. Transitive reachability and Linux acceptance remain open. [Advisory](https://rustsec.org/advisories/RUSTSEC-2024-0429.html).
- rand 0.7.3: RUSTSEC-2026-0097. It is used through phf_codegen for build-time selector generation. The resolved feature graph does not enable rand's log feature, required by the reported custom-logger problem. The warning remains recorded; future feature changes need review.
- Eight unmaintained-crate warnings: fxhash, proc-macro-error, serial, unic-char-property, unic-char-range, unic-common, unic-ucd-ident and unic-ucd-version. These have no patched compatible release identified by the auditor. They are dependency maintenance debt, not proof of an exploit or a blanket security pass.

Security CI now audits npm at low severity and both Cargo lockfiles on relevant pushes/PRs and the existing scheduled/manual runs. Actions and the auditor version are pinned. Cargo informational warnings remain in the logs.

## Capability and license inventory review

Reviewed main-window capabilities and CSP. Only the main window receives core window destruction, folder dialog and opener permissions; no updater webview permission was added. Signed updates are native-managed. The webview CSP limits scripts/fonts to self and connections to self/local IPC. This is a configuration review, not a penetration-test certificate.

The Cargo metadata inventory contains 574 packages and no missing license declaration. Permissive choices predominate; the graph also contains MPL-2.0 packages and Unicode licenses. Declarations alone do not prove distribution notice/source obligations are complete. A final shipped-artifact notice review remains required. The vendored portable-pty license remains preserved.

## Native Computer Use attempt

The JavaScript kernel and @oai/sky now initialize and list Goro. Launched the existing release executable using a separate WebView profile and a fixture project under .tmp/native-qa-20261004. Read its real native accessibility tree: empty workspace, local toolchain status, theme selector and controls. Ctrl+O opened the native folder dialog.

Graphics capture failed with FrameArrived/window-capture timeouts, including after target re-selection. Indexed click failed with coordinate input geometry unavailable, and folder-dialog value input could not resolve the cached element. Keyboard attempts did not establish a reliable selected fixture workspace. No dirty-buffer, Explorer, run/debug, Git UI or graceful-exit journey is counted as passing. Both launched QA processes were stopped by verified PID/path; real user projects were never opened. Force-stopping an empty QA process is not graceful-exit acceptance.

Ubuntu WSL responds to CLI inventory, but no Rust/Go toolchain was present in that inventory. It is not a certified Linux GUI/installer machine. No macOS machine was available.

## Remaining release gates

1. Unix PTY descendant/session containment remains an engineering gap. Windows ownership fixtures do not certify it.
2. Native external-file conflict, failed-save, dirty close/Explorer/Git transitions and active-process app exit need a functioning interaction/capture environment and exact candidate acceptance.
3. Installer clean install/upgrade/uninstall, platform trust/signing, actual signed upgrades and the declared platform/tool matrix remain unverified. Production update hosting and release credentials are not configured.
4. Editor latency/scroll/focus/IME/accessibility measurements and full distribution license notices remain pending.
5. Website production CORS/CDN/deep-link/download verification needs actual hosting and published artifacts.

Save As/export-copy and crash-draft recovery remain part of the dependable stable target described in RELEASE_READINESS.md. Existing normal-close preservation tests are not crash recovery. No old open commitment is marked complete by this follow-up.

## Validation

- Native standard suite: 261 passed, 24 intentionally ignored, zero failures. The added alias-ambiguity regression then passed separately (1 passed, 285 filtered). The final ignored real-tool run passed all 24 cases (262 filtered). Together these cover all 286 current native tests on Windows; the extra alias test was not present in the initial standard-suite binary.
- Real-tool versions: Go 1.26.5 windows/amd64, gopls 0.23.0, Delve 1.27.2, Git 2.54.0.windows.1. Tests include real Go process ownership, unsaved-buffer language operations, actual debugger breakpoints and selected-test locals.
- Clippy all targets with warnings denied: passed. Documentation links: 75 passed across 23 documents. Product/MSI version consistency: passed. Security workflow actionlint: passed.
- Initial Vitest 4 upgrade run: 772 passed, 26 failed across four test files. Constructor mocks used arrow functions, and one outline spy installed itself as its own implementation. Updated only the test harness to constructible functions and an independent scroll spy. ResizeObserver's constructor mock was also repaired. Assertions and deadlines remain intact. Focused compatibility checks passed after the repairs.
- Frontend final full suite: 798 passed across 124 files, zero failures (Vitest 4.1.11). Production TypeScript/Vite build and separate typecheck passed. Git whitespace validation passed.
- Full npm audit: zero findings. Cargo application audit: zero vulnerability records, ten informational warnings retained as described above. Release verifier audit: zero findings/warnings.

Raw logs/fixture projects remain ignored under .tmp; only this summarized report is committed. Native visual/manual QA and hosted CI are not counted as passing by these local checks.

## Hosted CI fixture follow-up (2026-10-04)

The Windows and macOS backend jobs in run 37146247220 failed in different fixtures:

- Windows: `normal_root_exit_still_reaps_descendants_that_keep_output_pipes_open` exceeded its five-second execution deadline while launching a PowerShell fixture. Replace that launcher with the current Rust test executable. The descendant explicitly inherits both output pipes; the observer retains its process handle and confirms it is alive before acknowledging the parent may exit. Success requires a successful parent exit, drained output and the same descendant handle becoming signalled. This removes the PowerShell startup dependency and strengthens the previous optional PID lookup. The five-second fixture deadline and production process cleanup are unchanged.
- macOS: `spawn_process_extracts_dynamic_port_from_output` parsed the advertised DAP port, then failed to confirm retirement of the shell/sleep fixture group. Use `exec sleep` so the fake adapter replaces its launcher and remains the owned group leader. This test concerns port parsing and adapter ownership; the dedicated Unix descendant/permission-denial tests remain intact. No EPERM-to-success bypass or process-group policy change is introduced.

Windows focused output tests passed (6 tests), the inherited-pipe regression passed 20 consecutive subprocess runs, and all-target Clippy passed with warnings denied. Full Windows suite results and hosted macOS verification are recorded after completion; this fixture correction does not certify native platform acceptance or resolve the outstanding Unix PTY containment gate.

The existing `v0.2.0-alpha.1` tag continues to point to its original commit. Rerunning that tag's workflow does not incorporate later fixes on main; a release containing this correction needs a new version/tag.

## Release frontend fixture follow-up (2026-10-04)

The alpha.4 Windows release job failed because the Save All failure test waited for the writer invocation, then synchronously queried the error banner before the awaited write failure and React update completed. The test now waits for the actual permission-denied banner and disables Auto Save for this explicit Save All scenario. It still verifies exactly one write, no extra reads, and preservation of both dirty buffers. Production save behavior and test timeouts are unchanged.

Validation: 23 document-safety tests and the complete 798-test/124-file frontend suite passed on Windows. Typecheck, production build, all 31 release script tests, release workflow actionlint, version consistency and documentation links passed; npm audit reported zero vulnerabilities. Native code is unchanged by this correction. Hosted release execution, actual installers and native acceptance still require their own results.
