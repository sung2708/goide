# Goro Update System Report

Audit dates: 2026-10-03–04. Implementation targets develop after `0bd19076`.
Production distribution remains **NOT READY**. This report distinguishes source
and automated fixtures from a real published/signed application upgrade.

## Existing Infrastructure Found

Tauri 2.10.3, React/Vite, centralized typed settings, Command Palette and an
existing safe-close/process cleanup boundary. Prior release workflow published
in the source repository. No production updater key/endpoint was configured.

## Architecture Implemented

Official native Tauri updater 2.12.0; frontend UpdateService; native exclusive
store and typed commands; guarded shared safe-close installer handoff. Contracts
and engineering details: [UPDATES.md](UPDATES.md).

## Version Source of Truth

package.json → version-manager → Cargo/Tauri/MSI. Current version remains
0.2.0-alpha.1; no maturity bump or tag. Generator rejects tag/version mismatches.

## Update State Machine

idle, checking, upToDate, updateAvailable, downloading, downloaded, installing,
restartRequired, error. Native revision ordering, cancellation and exclusive
operation ownership. Bytes are private and only verified downloads become ready.

## Automatic Check Behavior

Default ON; deferred eight seconds; successful local cache for 24 hours per
installed version/channel. Background failure does not open a dialog or steal
focus. Auto-download defaults OFF; installation always requires consent.

## Manual Check Behavior

Settings/About and Goro: Check for Updates in the shared command registry.
Reports real runtime version, state, channel, last check, plain-text release
notes, byte progress and sanitized actionable failures.

## Update Channels

Stable accepts stable; beta accepts beta/RC/stable; alpha accepts all three.
Build default follows runtime SemVer. Channel is revalidated natively before
download/install. SemVer precedence ignores build metadata and rejects downgrade.

## Download Behavior

Official verified download, real byte progress/indeterminate total, cancellation,
ten-minute timeout and 256 MiB policy. HTTPS/host/redirect restrictions. No partial
download is installable; signature/security errors have no bypass button.

## Install / Restart Behavior

Explicit Install and Restart enters shared close consent. Native install requires
successful owned cleanup. Windows uses the official installer; macOS/Linux use
official installation plus native restart. Failure stays in recovery.

## Unsaved Work Protection

Reuses Save All and retained conflict-draft preservation. Failed saves do not
start cleanup/install. Explicit discard is separate. Autosave and document
transitions are blocked during consent. Cancel remains available before cleanup;
after irreversible shutdown starts, retry/close recovery remains explicit.

## Process Lifecycle Integration

Central cleanup closes registration and acknowledges tools, Git, runs, Delve,
terminals, watchers and LSP. Windows installer handoff permits only new children
to escape the app job after cleanup; existing descendants retain kill-on-close.
Existing Unix PTY/Git identity gaps remain blockers for overall release.

## Signing Architecture

Official Tauri Minisign signature plus signed-version binding; no disabled
verification. CLI 2.12.1 binds the app version. An independent small CI verifier
uses the same official Minisign verification crate and checks trusted version.

## Public Key Integration

GORO_UPDATER_PUBLIC_KEY compiles into the backend; build.rs tracks changes.
Missing key/base yields unconfigured, never a fake up-to-date answer. Current
local builds have no production key. No private key is embedded.

## Private Secret Requirements

Encrypted signing identity/password in protected signing CI; narrowly scoped
public distribution publisher token in distribution CI. No app/site access token.
No production key generation, upload, rotation or visibility change performed.

## Release Pipeline

Validate → matrix build/sign → verify artifacts and version-bound signatures →
derive contracts/checksums → draft/upload/digest acknowledgement → public release
and unauthenticated asset verification → atomic Pages metadata commit last.
Candidate-only workflow dispatch defaults false for publication.

## Artifact Naming

goro-v<full-semver>-<platform>-<architecture> with package suffix where needed.
Explicit target bundle folders prevent stale cross-target fallback. macOS app
tar archives and paired signatures are preserved, separate from human DMGs.

## Checksums

SHA256SUMS.txt generated from actual binary bytes. Publisher validates GitHub's
upload digest and checks public bytes/size before metadata. Hashes alone do not
authorize automatic installation.

## Updater Manifest

Exact official version/notes/pub_date/platforms schema; actual signature content.
Windows installer flavor entries, both macOS architectures, Linux AppImage.
No invented Windows/Linux ARM or Debian automatic updater support.

## Website Metadata

schemaVersion/product/version/tag/channel/date/notes/release/checksum links and
exact download filename/platform/architecture/format/URL/hash/size. Generated
together with updater JSON from one verified release set.

## Public Distribution Endpoint

BLOCKED pending maintainer configuration: separate already-public repository,
GitHub Releases and Pages gh-pages channel/version metadata. No private source
credentials needed by clients; source visibility can remain private.

## Website Integration Contract

Fetch stable release.json by default; explicit prerelease selector; escaped text,
validated schema, exact asset selection, short pointer caches and truthful
network/unsupported-platform UI. Website code is outside this repository.

## Security Review

Mandatory signatures/version binding, HTTPS restrictions, no remote HTML execution,
no raw IPC credentials, no frontend installer path/restart primitive, no automatic
install, no overwrite of release versions and metadata-last publication.
Official parser's metadata allocation is capped only after parsing; endpoint
compromise/resource-exhaustion review and signed native/platform QA remain open.

## Privacy Review

Only app version/channel/platform requests and public download traffic. No source,
workspace path, terminal output, repository credential, fingerprint or analytics
payload. Local settings/check cache only. Error logs contain code only.

## Automated Tests

PASS: real ephemeral Tauri signatures, tampered bytes, wrong key, malformed
signature, signed-version mismatch and shared website/updater metadata fixtures.
PASS: publisher mock verifies upload/public-read/metadata ordering, newer-channel
preservation, private-target refusal and non-forced update race failure.
PASS: focused service ordering/dedup, startup caching/opt-in/manual ownership,
plain-text notes, indeterminate progress, passive focus and guarded
save/cleanup/install tests. The real Windows job handoff fixture preserves
kill-on-close while its new installer child survives job disposal.

## Manual QA

BLOCKED: Computer Use runtime fails before initialization with `failed to write
kernel assets: The system cannot find the path specified. (os error 3)`.
Native update consent, typing/focus during download, actual upgrade/relaunch and
platform installers are not certified by browser or unit fixtures.

## Platform Status

Windows x86_64: source/build/automated checks, installer acceptance pending.
macOS ARM64/x86_64 and Linux x86_64: workflow contracts implemented; hosted build
and signed upgrade QA not run. Windows ARM/Linux ARM: NOT AVAILABLE. Debian
automatic update: NOT APPLICABLE (human download only). Authenticode/Developer ID
and notarization: NOT AVAILABLE in this environment, separate from updater signing.

## Remaining Setup Required

Provision public repo/Pages and protected environments. Generate/secure production
key outside repo. Set variables/secrets. Verify public endpoint routing, retention,
CI environment gates and real platform signing/upgrade behavior.

## Required CI Secrets

TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD, GORO_RELEASE_TOKEN.
Public vars: GORO_UPDATER_PUBLIC_KEY, GORO_RELEASE_BASE_URL,
GORO_RELEASE_REPOSITORY. Optional GORO_SIGNING_PUBLIC_KEY separates a bridge
release's signing identity from the next embedded updater trust key. The build
override contains public keys only. No source-repo token in public products.

## Validation Results

PASS: frontend full suite 797/797 across 124 files, followed by 15/15 focused
tests after the final in-dialog failure/date/size presentation changes.
PASS: native default suite 259/259 plus all 24/24 explicit installed-tool tests
(283 total). PASS: 10/10 Node packaging/signature/metadata/publication fixtures.
PASS: frontend production build, synchronized version 0.2.0-alpha.1 (MSI 0.2.0),
documentation links (67 links/22 documents), npm production audit (0 advisories).
PASS: Cargo fmt/check/Clippy with warnings denied; final focused updater tests
5/5 after the final native policy/config/date changes. PASS: Windows release
Goro.exe, MSI and NSIS build (CLI 2.12.1, updater 2.12.0). Native smoke launch PID
58824 responded with window title Goro; only expected `update_unconfigured`
stderr. Its empty isolated QA process was stopped explicitly. This is launch
evidence, not interactive save/upgrade/close acceptance.
PASS: copies of both newly built Windows installers signed with a disposable
test identity and verified for exact 0.2.0-alpha.1 by the CI verifier. Private
test keys/copies were removed; original unsigned artifacts were unchanged.
NSIS: 4,886,430 bytes; SHA-256
`8a82e5d867f92f401286178f86b1e65cf76ef4592291e06f90f398eab5203414`.
MSI: 7,008,256 bytes; SHA-256
`3cce9cdd5641b9f5702e9e9f6cc6763cb1064fffe775cb1d5e26153880107f88`.
Windows Authenticode: NOT AVAILABLE (`NotSigned`). No production signing claim.
QA profile cleanup: BLOCKED by automatic approval review (`blocked by policy`);
the ignored `.tmp/goro-update-launch-20261004` profile remains, with no running
QA app. The rejection was not bypassed through another deletion mechanism.
Production publication/secret operations: NOT APPLICABLE; not authorized or
performed. Native Computer Use: BLOCKED. macOS/Linux hosted builds and upgrades:
BLOCKED pending platform execution, not inferred from Windows evidence.

## Remaining Blockers

Production configuration, full signed two-version upgrade/restart QA on every
declared platform, platform trust signing policy, native Computer Use runtime,
metadata parser preallocation/resource review, plus prior process/documents
acceptance gates in [Release Readiness](RELEASE_READINESS.md). No release tag.

## Exact Maintainer Steps Before First Real Update Release

1. Resolve prior process/document release blockers and pass installed-app QA.
2. Choose an already-public distribution repo and create gh-pages with .nojekyll;
   enable Pages and verify the actual URL/HTTPS certificate without credentials.
3. Generate the encrypted Tauri signing identity offline/outside source; record
   its public key, protect/back up the private identity and password.
4. Create release-signing/release-distribution protected environments; restrict
   refs/reviewers and configure the three secrets/three public vars listed above.
5. Build a nonproduction signed baseline and a newer candidate using an isolated
   test distribution/key. Run the complete scenarios in UPDATES.md on real hosts.
6. Synchronize the approved production version with version-manager; review the
   candidate-only workflow result, all signed artifacts and both JSON contracts.
7. Only after explicit release authorization, create the unique approved tag or
   request publish=true; inspect draft uploads and public verification results.
8. Verify Pages propagation and exact website/updater/artifact versions publicly;
   upgrade the baseline with dirty/conflict drafts and active owned processes.
9. Announce only after successful install/relaunch. Preserve immutable artifacts;
   remediate regressions with a newer signed release. Plan key rotation with an
   old-key-signed bridge release, never a verification bypass.
