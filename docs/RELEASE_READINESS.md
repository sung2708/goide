# Release readiness

The maintainer resumed the next prerelease on 2026-10-05 and reported that manual
testing of the dev app passed. This records acceptance of the manually tested
flows; it does not identify coverage of every matrix gate below.
Publication and main promotion remain conditional on the exact-candidate gates;
official releases remain on hold. Source features and passing unit tests do not
certify an installer. Prerelease authorization does not replace candidate validation.

The release path is **validated develop candidate → main → verified candidate
packages → immutable tag/release → metadata last**. Follow
[release runbook](RELEASE.md).
Automatic develop-to-main promotion is specified but is not implemented/enabled.

## Required acceptance

### Monaco alpha.2 candidate

Experimental candidate `47d6955294871949736f9ca04e2599fad61dd6e1` was
validated on develop and fast-forwarded to main. Tag `v0.5.0-alpha.2` retains that
identity. Published on 2026-10-05; successful source/package checks are distinct
from installed-app acceptance.

| Check | Result and exact-candidate evidence |
| --- | --- |
| Develop CI and security | Passed: Actions 37248897148 and 37248897153; frontend 838 tests / 135 files, release contracts, Rust checks/tests on all four targets |
| Main CI and security | Passed: Actions 37249955832 and 37249955865 on the same SHA |
| Managed tools | Passed: Actions 37249330359, real managed setup, project creation, Run/Test/diagnostics/Delve on all four targets |
| Windows complete native fixtures | Passed: 303 tests, zero failures, 854.75s with `--include-ignored --skip real_managed_setup`; the filtered fixture is covered by the managed matrix above |
| Candidate packages | Passed: candidate-only Release 37250005976, all four platform builds and version/checksum/updater-signature/notices verification; publication and Pages intentionally skipped |
| Manual dev application | Maintainer reported successful testing on 2026-10-05; independent native UI coverage could not be completed because Computer Use capture/control failed |
| Public distribution | Passed: Release 37251306415 attempt 2 (28m53s), all four builds, public byte/checksum verification and Pages deployment; anonymous alpha.2 feed/CORS/cache/web-updater contracts and SHA256SUMS HTTP 200 verified |

The Windows native run used Go 1.26.5, gopls 0.23.0 and Delve 1.27.2.
It exercises real completion, diagnostics, format/import/rename/code actions,
signature queries, execution and debugger fixtures. Ignored system-tool fixtures
on the other targets have not been independently run; managed acceptance is a
separate matrix, not a replacement for every existing/custom tool combination.

Completion regression fixes separate React text commits from request ownership,
cancel only older model versions, refresh prefixes and prevent duplicate snippet
bodies. Autosave writes exact drafts; explicit Save preserves incomplete Go on
recognized parser errors. Local syntax markers are tied to exact source rows;
operational errors use the status bar and Problems dock.

Keep installed save/Run/Test/Debug, dirty multi-tab, Vim and Markdown interaction
coverage, cold/warm measured latency, repeated workspace memory checks, large and
long-line files, Vietnamese IME and accessibility acceptance open.

Development browser previews exercise the actual frontend editor with fixture
callbacks. They are not native filesystem/tooling or installer acceptance.

Record the exact candidate SHA, OS/architecture, tool versions, commands and
results for every gate. Required targets are Windows x64, Linux x64, macOS ARM64
and macOS Intel x64. A skipped or ignored fixture is not a passing check.

| Gate | Required evidence |
| --- | --- |
| Source checks | Complete frontend, native, release-contract and security checks for the same candidate; explicitly run required ignored real-tool fixtures |
| Documents and projects | Save/Don't Save/Cancel, multiple dirty tabs, external changes, denied/deleted files, failed writes, safe Explorer/Git transitions, open/create/close project and restore the last active tab without cycling through tabs |
| Draft recovery | Installed-app checkpoint/restart and crash recovery, corrupt/quota-failed storage, export-copy picker and failed shutdown; preserve original baselines and unaffected drafts |
| Editor and navigation | Measured typing, scroll, completion and picker latency, ordinary/large/long-line files, IME, keyboard focus, light/dark contrast and screen-reader acceptance |
| Go tooling | Existing/custom and managed Go/gopls/Delve; no-Go setup, single-file and module/go.work projects, completion/diagnostics, format/imports/rename, Run/Test and real breakpoint/stack/variables |
| Process ownership | Startup/cancel/exit/retry under Run/Test/Debug/terminal/Git; descendants retaining pipes or changing groups, deleted/retargeted roots, unrelated processes remain alive |
| Git and search | Dirty guards, staged-only commit, real conflicts, rejected network/hooks, operation-bound cancellation, stale search/replacement previews and partial failures |
| Distribution | Exact-version packages for all declared targets; clean-machine install/upgrade/uninstall, WebView prerequisites, tool discovery, retained settings, icons, licenses and truthful support claims |
| Security and updates | Dependency/license disposition, capabilities and execution trust, signing/notarization policy, genuinely signed upgrade between two versions, offline/tampered/interrupted downloads and failed installer recovery |
| Public consumers | Anonymous downloads/checksums, Pages/CORS, website metadata/changelog and app updater agree with the published main release |

## Open acceptance

Release readiness is **not established**. Installed-app recovery, native shutdown
and process containment, performance/accessibility measurements, real-tool coverage
and signed install/upgrade acceptance across the complete target matrix remain
required. Unix PTY descendant containment needs explicit verification; source
cleanup tests alone do not close it. Security informational warnings, shipped
license notices and platform publisher trust also require documented disposition.

Earlier development runs had 821 frontend passes and a native run with four
failures, including a managed setup deadline. They predate the current candidate:
Windows now passes the complete 303-test native run and managed setup passes on
all four targets. Historical retries are not counted as current full-suite
coverage. The exact-candidate checks above supersede those source test results;
they do not close installed recovery, platform publisher trust, signed upgrade,
IME/accessibility or measured performance gates.
Do not remove a gate simply because its investigation log was moved to local files.

Durable behavior contracts: [document recovery](DOCUMENT_RECOVERY.md),
[managed tools](TOOLCHAIN_MANAGER.md), [navigation/search](NAVIGATION_SEARCH.md),
[updates](UPDATES.md) and [testing](TESTING.md). The requested complete `0.5.0`
milestone must meet its agreed scope; changing the version does not satisfy QA.
