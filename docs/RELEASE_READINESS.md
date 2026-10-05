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

### Monaco develop candidate

The editor migration is not accepted for release yet. Keep these gates open:

User testing on 2026-10-05 reported missing completion,
save-preparation races and gopls parser errors shown as banners. The previous 821
frontend passes predate these regression fixes; verify the updated candidate again.

Completion fixes now separate React text commits from request ownership, cancel
only requests for older model versions, refresh prefix suggestions, avoid native
waits for declaration snippets and prevent duplicate bodies in name placeholders.
Autosave writes exact drafts; explicit Save accepts recognized gopls parser errors
without losing incomplete code. Focused checks and a real-gopls incomplete-code
fixture pass. Native interactive popup latency and the full release matrix remain
open; browser snippet/tab-stop checks do not close those gates.

- Final full frontend/native suites on a fixed candidate, including real gopls
  completion, diagnostics, format/import/rename/code-action and Delve fixtures.
- Native save → Run, Test/Debug, dirty multi-tab transitions, breakpoint/race
  navigation, Vim mappings and Markdown row hover; screenshots of the native app.
- Cold/warm completion and typing/scroll latency, memory after repeated tab/workspace
  cycles, large/long-line files, Vietnamese IME and keyboard/accessibility checks.
- The same candidate's declared platform, installer and distribution gates below.

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

The Monaco migration's broad native integration run reported 210 passing and
four failing tests. Code-action and two process-lifecycle fixtures passed isolated
retries, but that does not replace the failing broad run. The managed no-system-Go
setup fixture failed its isolated retry with a native execution deadline; managed
tool installation and the dependent Run/Test/Debug acceptance gate remain open.
The fresh Windows 10 x64 frontend run passed all 821 tests across 133 files with
successful runner shutdown and an unchanged source digest. TypeScript/build,
documentation links, release-contract tests and version synchronization also pass
locally. These checks cover uncommitted develop source; they do not establish an
immutable release candidate or replace the failing native and unverified platform,
installed-app, IME and measured-performance gates. Verify the complete committed
candidate before promotion.
Do not remove a gate simply because its investigation log was moved to local files.

Durable behavior contracts: [document recovery](DOCUMENT_RECOVERY.md),
[managed tools](TOOLCHAIN_MANAGER.md), [navigation/search](NAVIGATION_SEARCH.md),
[updates](UPDATES.md) and [testing](TESTING.md). The requested complete `0.5.0`
milestone must meet its agreed scope; changing the version does not satisfy QA.
