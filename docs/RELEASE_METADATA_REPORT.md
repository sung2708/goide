# Goro Release Metadata Report

Operational policy update: the maintainer subsequently requested an experimental
alpha release from main using the existing public sung2708/goide repository.
[Release setup](RELEASE_SETUP.md) supersedes the earlier separate-repository,
develop-dispatch and token-permission assumptions below. Historical audit
results and outstanding native acceptance are retained.

Audit date: 2026-10-04. Implemented locally and validated without publishing a
release. Production distribution remains **BLOCKED pending maintainer setup and
signed platform acceptance**. Product release readiness remains NOT READY; see
[RELEASE_READINESS.md](RELEASE_READINESS.md).

## Existing Release Infrastructure

Read package.json, both lockfiles, Cargo.toml, Tauri configuration, updater native
implementation, artifact packager, validators, release workflow and runbooks.
The GitHub API reports `sung2708/goide` is **public**, default branch `main`, and
the unauthenticated releases list is empty. Checked live on the audit date; npm's
`private: true` describes package publication, not GitHub visibility. Source
visibility was not changed. No existing public download release was assumed.

Existing tag-driven four-target Tauri build/sign/package/verify pipeline is
preserved. The prior dedicated public-distribution architecture is retained to
allow source distribution to become private without changing website/app access.
No separate remote repository, branch, Pages endpoint or production identity was
created. The publisher requires an already public, separately configured target.

## Tauri Version

Cargo.lock resolves Tauri **2.10.3**, tauri-build **2.5.6**, updater **2.12.0**.
Tauri CLI is pinned to **2.12.1** in package.json/package-lock.json. The updater
plugin remains exact-pinned to preserve Rust MSRV 1.88 and signed-version behavior.
Static manifests follow the [official Tauri updater contract](https://v2.tauri.app/plugin/updater/)
and the resolved plugin implementation, including installer-specific keys.

## Current Version Source of Truth

Canonical app version: package.json, currently `0.2.0-alpha.1`. Cargo.toml and
tauri.conf.json must match it exactly. `version-manager.mjs check --tag` validates
these sources and the Windows numeric MSI conversion (`0.2.0`). Release metadata
CLI repeats this check before generation. Shared metadata policy uses the semver
library and rejects noncanonical strings and unknown prerelease families.
Metadata schemaVersion is independent of application SemVer.

## Release Trigger

Push `v*` tags, followed by strict canonical SemVer, allowed channel and app
version checks. Malformed/mismatched tags fail before privileged jobs. Release
commit must be reachable from develop/main. Candidate workflow_dispatch accepts
only develop/main; `publish` defaults false. Protected environments and required
reviewers remain essential because a workflow changed by untrusted code must
never be authorized to use release secrets. No tag or dispatch was performed.

## Artifact Matrix

| Normalized platformKey | Direct formats | Automatic updater |
| --- | --- | --- |
| windows-x86_64 | EXE setup, MSI | NSIS and MSI, preserving installation flavor |
| macos-aarch64 | DMG | signed app.tar.gz |
| macos-x86_64 | DMG | signed app.tar.gz |
| linux-x86_64 | AppImage, DEB | signed AppImage only |

Eight required payloads. macOS archives are included explicitly as updater
payloads, not recommended website installers. No Windows ARM, Linux ARM, RPM or
unsupported platform entry is fabricated. Extra/stale binaries are rejected.
Matrix coverage is configured CI support, not evidence that macOS/Linux upgrades
have been executed on this Windows host.

## Artifact Naming

`goro-v{FULL_SEMVER}-{PLATFORM}-{ARCH}[-{PACKAGE}].{EXT}`. Names preserve alpha,
beta and RC components. EXE uses `-setup.exe`; macOS archive uses
`-updater.tar.gz`. MSI, DMG, AppImage and DEB keep their extensions. Required
updater signatures are paired `.sig` files; renaming does not change signed bytes.
Packaging selects exact current-product output from explicit target bundle dirs.

## release.json Schema

Schema 1 fields: schemaVersion, product, version, tag, channel, publishedAt,
releaseNotes, releaseUrl, checksumUrl and downloads. Each download has filename,
platformKey, platform, architecture, format, url, lowercase sha256 and size in
bytes. The downloads array keeps multiple packages per platform unambiguous.
Recommend exe/dmg/AppImage according to platform; alternatives remain explicit.

The exact complete generated JSON example is
[release.fixture.json](examples/release.fixture.json). It uses eight-byte local
fixture files with their actual computed SHA-256 and size, and deliberately
nonexistent `fixture/public` URLs. It is a **schema example, not a published
release**. No fabricated production digest, URL or feature claim is presented.

## Tauri latest.json

Implemented: version, notes, pub_date and platforms containing exact public url
and actual signature contents. Both contracts share one verified artifact
inventory and release version/date/notes. No website-specific schemaVersion is
added to the Tauri manifest. Tauri uses `darwin-*` keys while the website uses
`macos-*`; this deliberate mapping matches the official consumer.
`updater.json` remains a byte-equivalent JSON compatibility alias for existing
native endpoint paths. Website `latest.json` naming from the previous unreleased
implementation is superseded by `release.json`.

## Metadata Public URL

No live production URL is provisioned. Configure an HTTPS base ending
`/channels/` as GORO_RELEASE_BASE_URL. With the maintainer's chosen repository,
the website fetches `<BASE>stable/release.json`, or beta/alpha explicitly. The app
uses `<BASE><CHANNEL>/latest.json`, the canonical Tauri manifest; updater.json is
retained for older app builds. Immutable metadata is under `/versions/<SEMVER>/` at the same
Pages origin/root. Binary links use the configured public GitHub release repo.
The website needs this base configuration once; each release updates the same
pointer without editing website source.

## GitHub Actions Changes

All release actions pinned to audited full commit SHAs; source GITHUB_TOKEN
contents permission stays read-only. Trusted-ref gate runs before privileged
signing/distribution jobs. Existing test/build matrix and protected environments
are retained. New standalone metadata validation checks the two generated
contracts against actual files/checksums before publication.
Ordinary push/PR CI now runs all deterministic release tests and actionlint in
a separate read-only job with no production signing/distribution secrets.

Local candidate generation produces release.json, latest.json and compatibility
updater.json, plus SHA256SUMS.txt. Publisher revalidates files/contracts and exact
release notes before any release mutation. It refuses previously published
versions or immutable version metadata. Upload to draft, verify upload digest and
size, publish release, verify every asset via anonymous GET with actual streaming
SHA-256, finalize metadata with GitHub's real published_at, validate again, then
atomically commit version metadata and eligible channel pointers. Non-forced
branch update rejects concurrent writes; metadata is always the final pointer.
Local candidate timestamps are generation timestamps, not production claims.

## Signing

Official Tauri signer creates signatures. The small verifier uses the official
Minisign verification library and requires both valid cryptographic signature and
exact signed app version. Missing signatures, changed bytes, wrong keys,
malformed signatures or signatures for another version fail generation.
Only public verification material enters builds. Production private key/password
are CI secrets and never enter JSON/config artifacts. Local test keys are
ephemeral and removed by fixture cleanup. Updater signing does not confer
Windows Authenticode or macOS signing/notarization; platform trust QA remains open.

## Checksums

SHA256SUMS.txt includes all eight payloads with hashes derived from real bytes.
Each release.json download must match hash and size of its actual file.
Standalone and publisher validators reject missing, duplicate, incorrect or
orphan checksum entries. Extra signature files are verified when present.
Public download verification includes signatures and the checksum manifest too.

## Release Channels

No prerelease suffix → stable. `alpha.*` → alpha. `beta.*` and `rc.*` → beta.
Unknown families rejected. Alpha never advances beta/stable. Beta/RC may advance
alpha. A stable release may advance all eligible feeds only when newer by SemVer.
The channel property classifies the release; it need not equal an accepting feed.
Never reuse version/tag or force a pointer to an older release. Rollback means
newer signed SemVer containing reverted code.

## Security

No source/GitHub token in app or website. CI publisher credential scoped only to
the selected public distribution repo. API/upload redirect handling fails closed;
public asset verification is unauthenticated. Protected environments prevent
untrusted PR secret access; ordinary CI has no release secrets.
Ref checks cannot replace workflow review and environment rules. Metadata notes
are plain text and must be escaped by website consumers. Artifact names, regular
files, exact matrix and final URLs are validated; no arbitrary upload payloads.

## CORS

Public metadata must expose `Access-Control-Allow-Origin: *` or the exact website
origin and must not enable credentialed CORS. Configure/probe Pages or fronting
CDN; do not assume current response headers. `check-distribution-endpoint.mjs`
provides a read-only unauthenticated probe of CORS, both contracts and caching.
Actual public hosting acceptance: **BLOCKED**, target not yet configured.

## Caching

Website fetch credentials omit, cache no-cache; revalidate on page load/refresh
and use five-minute UI freshness. Pointer HTTP max-age/s-maxage must be at most
600 seconds, or require revalidation. Measure Pages/CDN behavior; configure a
proxy/CDN if defaults fail. Immutable versions/binaries may use long caches.
On errors retain only a previously verified release and visibly report stale/error;
never synthesize artifact URLs. The app's quiet startup check cache remains 24h;
manual checks are immediate. Pages propagation is asynchronous and must be probed
before announcing a release. Branch atomicity does not certify CDN atomicity.

## Tests

`node --test scripts/*.node-test.mjs` generates/validates locally without any
network release. Stable, alpha, beta, RC, invalid SemVer, invalid calendar date,
missing binary/signature/checksum, duplicate checksum, malformed schema, duplicate
download, unsupported platform, changed digest/size/URL/version/notes covered.
Real ephemeral signer tests verify bytes/key/signed-version binding. Mock publisher
tests verify metadata-last order, anonymous public reads, actual publication date,
private target refusal, no version reuse, corrupted metadata refusal, no pointer
downgrade and CAS failure. Endpoint tests cover CORS/cache/version failures.
Fixture/example generation does not claim installability of its test bytes.

## Required GitHub Secrets

| Name | Purpose | Configure in source repository |
| --- | --- | --- |
| TAURI_SIGNING_PRIVATE_KEY | encrypted complete Tauri signing key content | Settings → Environments → release-signing → Environment secrets |
| TAURI_SIGNING_PRIVATE_KEY_PASSWORD | password for that signing key | same release-signing environment |
| GORO_RELEASE_TOKEN | fine-grained token/GitHub App credential with Contents write on only the public distribution repository | Settings → Environments → release-distribution → Environment secrets |

Public repository Actions variables: GORO_UPDATER_PUBLIC_KEY (complete public key
file), GORO_RELEASE_REPOSITORY (`OWNER/REPO`) and GORO_RELEASE_BASE_URL (HTTPS
channels base). Optional GORO_SIGNING_PUBLIC_KEY only for a deliberate bridge-key
migration. No real secret was generated, printed, configured or verified here.

## Required Maintainer Setup

1. Choose/provision the separate public distribution repository yourself. Create
   gh-pages with .nojekyll, enable GitHub Pages from that branch/root, and confirm
   actual HTTPS hostname/path. No automation changes repository visibility.
2. Create release-signing/release-distribution environments with required
   maintainer reviewers and ref restrictions. Review workflow/dependency changes
   before approvals; disallow untrusted refs and secrets in PR execution.
3. Generate/store the production Tauri signing identity outside this repo, with
   encrypted backups. Configure the named environment secrets and public variables
   above. Grant publisher access only to the chosen distribution repo.
4. Use the newest reviewed develop/main code containing this workflow. Update
   version sources with `npm run version:set -- <version>`, regenerate package
   lock using `npm install --package-lock-only`, update the app Cargo.lock via
   Cargo, then run version:check, docs:check and required test/build checks.
5. Dispatch a candidate on develop/main with matching tag input and publish=false.
   Inspect all four target outputs and verified candidate JSON/signatures.
6. Complete real platform trust/install/upgrade and preservation QA, including
   both Windows installer flavors, both Macs and Linux AppImage. Resolve product
   release blockers. Approve production distribution only after that evidence.
7. On a separately authorized release, create/push a matching tag. Inspect the
   workflow and public release, then run the endpoint probe for each advanced
   channel with actual base/website origin. Check CORS, freshness and propagation.
8. Configure the website once to fetch its stable release.json pointer. Show only
   returned exact platform/package fields, escape notes and expose stale errors.

## Validation Results

| Check | Result |
| --- | --- |
| Source public visibility and no existing GitHub Releases | PASS, live GitHub API audit |
| App version synchronization | PASS, 0.2.0-alpha.1 / MSI 0.2.0 |
| Metadata/signature/publication/endpoint deterministic tests | PASS, 25/25 |
| Native updater endpoint/policy tests and Rust formatting | PASS, 5/5; cargo fmt --check |
| Release/CI workflow YAML and GitHub Actions expressions | PASS, actionlint 1.7.12; external shellcheck/pyflakes disabled |
| Documentation links and whitespace | PASS, 74 relative links across 23 docs; git diff --check |
| Real public endpoint/CORS/cache/Pages propagation | BLOCKED, maintainer provisioning required |
| Real production secrets and signed cross-platform upgrades | NOT AVAILABLE; no credentials/publication authorized |
| Native computer-use QA runtime recovery | BLOCKED; see below |

QA runtime was reset and retried. Both importing @oai/sky and a minimal
`nodeRepl.write` cell fail before JavaScript execution with:
`failed to write kernel assets: The system cannot find the path specified.
(os error 3)`. Local Temp, Codex node_repl directory and configured Node binary
exist; no failing asset path is exposed. Therefore this is currently a host-tool
initialization failure, not demonstrated Goro behavior. No runtime files/settings
were fabricated, no alternate UI helper was built, and no native QA PASS is claimed.
Save active work, close/reopen Codex, then reset/retry the runtime. If still failing,
report the exact error plus redacted diagnostics via Codex feedback. This recovery
is a next action, not a claimed verified fix. See
[official troubleshooting](https://learn.chatgpt.com/docs/reference/troubleshooting).
The previously rejected QA-profile deletion is separate: automatic approval review
only reported `blocked by policy`; ignored profile remains and is not published.

## First Test Release Procedure

With explicit publication authorization, use only `0.2.0-alpha.1` then
`0.2.0-alpha.2`, each from a reviewed distinct commit with synchronized version
sources and the same signing identity. First run publish=false candidate builds.
For a public alpha test, publish the first authorized tag, install its genuinely
configured signed app in an isolated QA profile, then publish alpha.2. Confirm
only alpha pointers change and stable/beta remain absent or unchanged. Probe
alpha release.json/latest.json for same version/date and public access. Run manual
and startup checks, download/cancel/retry, signature/version rejection, save and
external-conflict preservation, owned-process cleanup, actual installation and
relaunch showing alpha.2. Test MSI/NSIS separately: numeric MSI version remains
0.2.0 across these prereleases, so real installer upgrade behavior must be checked.
No test should use the stable pointer. Fixtures alone do not satisfy this native
upgrade acceptance. No alpha tag or release was created in this task.
