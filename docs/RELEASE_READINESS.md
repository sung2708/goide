# Release readiness

The maintainer resumed releases on 2026-10-04 and authorized develop-to-main
promotion. The next candidate is experimental `0.5.0-alpha.1`. Source features and
passing unit tests do not certify an installer. This checklist does not declare
beta/stable readiness; publication requires the reviewed source and package gates.

The release path is **validated develop candidate → main → verified candidate
packages → immutable tag/release → metadata last**. Follow
[release runbook](RELEASE.md).
Automatic develop-to-main promotion is specified but is not implemented/enabled.

## Required acceptance

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

The latest local full frontend attempt reported debugger/diagnostics timeouts and
was interrupted. Its root cause is unestablished; a focused passing regression
cannot close that full-suite gate. Verify the complete candidate before promotion.
Do not remove a gate simply because its investigation log was moved to local files.

Durable behavior contracts: [document recovery](DOCUMENT_RECOVERY.md),
[managed tools](TOOLCHAIN_MANAGER.md), [navigation/search](NAVIGATION_SEARCH.md),
[updates](UPDATES.md) and [testing](TESTING.md). The requested complete `0.5.0`
milestone must meet its agreed scope; changing the version does not satisfy QA.
