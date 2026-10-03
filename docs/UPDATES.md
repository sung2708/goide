# Secure updates and public distribution

Goro uses Tauri 2's official native updater. Application source may be private;
downloads, updater manifests and website metadata must be public and require no
account or repository credential. The repository does not provision a production
signing identity or public endpoint automatically.

Upstream references: [official Tauri updater](https://v2.tauri.app/plugin/updater/)
and [GitHub release assets API](https://docs.github.com/en/rest/releases/assets).

## Architecture and ownership

`src/features/updates/UpdateService.ts` owns frontend subscription, deduplication
and revision ordering. The native store in `src-tauri/src/integration/updates`
owns release policy, operations, cancellation and verified artifact bytes.
Bytes and signature-verification authority never cross IPC. Frontend commands
accept only channel selections, never arbitrary URLs or installer paths.
Settings/About and Command Palette call this same service.

The official plugin is pinned to 2.12.0 to retain the repository's Rust 1.88
contract. Tauri CLI 2.12.1 signs trusted comments with the app version.
`requireSignedVersion: true` rejects a manifest claiming a newer version while
serving an older signed binary. Downgrades are disabled. No signature, TLS or
version-binding bypass exists in production.

## State and scheduling

States: `idle`, `checking`, `upToDate`, `updateAvailable`, `downloading`,
`downloaded`, `installing`, `restartRequired`, `error`. Native state revisions
prevent late events overwriting newer state. Native and frontend operation locks
deduplicate clicks. Cancellation interrupts check/download, discards partial
bytes and never invokes install. Cancellation acknowledgement is asynchronous.

`updates.autoCheck` defaults to true. One quiet application-lifetime check runs
eight seconds after startup; a successful check is cached locally for 24 hours
per app version/channel. Failed requests are not cached. No background modal,
editor focus movement or automatic installation occurs. Auto-download defaults
to false. Preferences apply to the next automatic check and manual operations.

Manual Check for Updates opens Settings/About and uses the same service. Network
errors, configuration errors, incompatible platforms, channel violations and
signature errors have sanitized messages. Raw server responses, stack traces,
URLs with query credentials and IPC transport errors are never rendered or logged.
Logs contain only the update error code.

## Version and channels

`package.json` is canonical; `scripts/version-manager.mjs` synchronizes Tauri,
Cargo and numeric MSI versions. Metadata generation rejects a mismatching tag.
Comparison uses SemVer precedence, not lexical strings. Build metadata does not
make an otherwise identical release a newer update.

| Channel | Accepted release versions |
| --- | --- |
| stable | Stable only |
| beta | Beta, RC and stable |
| alpha | Alpha, beta, RC and stable |

Build default resolves from the installed version. Stable builds default stable;
beta/RC builds default beta; alpha builds default alpha. Unknown prerelease
identifiers are rejected. Selecting another channel requires another check;
native download/install revalidate the requested channel and version. An alpha
build selecting stable remains up to date until a newer stable version exists.

## Download and installation safety

Metadata endpoints and initial artifact URLs require HTTPS, no credentials,
query tokens or fragments. Downloads allow only the configured endpoint host
and explicit GitHub release hosts. Redirects retain HTTPS and an allowed host,
with a five-hop limit. Signed GitHub CDN redirect queries are allowed but never
displayed. System TLS trust/proxy settings remain enabled. Check timeout is 20
seconds; download timeout is ten minutes. Release notes are plain escaped text,
bounded at 64 KiB; signatures at 4 KiB and metadata at 256 KiB after parsing.

Progress reports actual received bytes. Unknown Content-Length gives an
indeterminate progress bar. A 256 MiB limit cancels oversized downloads; the
final verified buffer is checked again. Only the official plugin's verified
download result enters `downloaded`. Cached verified bytes remain in memory,
never in a frontend-controlled path. Cancellation/check discards them.

Install and Restart enters the existing `useSafeWindowClose` dialog. It cancels
autosave, blocks document/workspace transitions, protects dirty editor documents
and retained conflict-result drafts, and offers explicit Save or Discard.
Failed saves never start cleanup or installation. Active document/Git operations
block the action. Cancel before cleanup leaves the workspace intact.

Native `shutdown_owned_resources` closes the registration gate, cancels and
reaps owned Go/tool output, Git, runs, Delve, terminals, watchers and LSP.
Only its successful exit acknowledgement authorizes the native installer.
Failures keep the app open for retry. Once shutdown succeeds, an installer
failure remains in recovery: retry installation or close/reopen; Cancel cannot
pretend the stopped workspace is still usable.

On Windows, the official installer launches and exits the app itself. After
acknowledged cleanup only, the app-lifetime job temporarily permits *new*
installer children to break away. Existing descendants retain kill-on-close;
the closed lifecycle gate rejects new tools. Failure restores the flag. An
externally imposed ancestor job can still prohibit breakaway; validate this
scenario on the actual deployment host. macOS/Linux use the official installer
then native `app.restart()`. There is no generic frontend restart permission.

## Public contracts

Use a dedicated **already public** distribution repository, e.g. a maintainer's
chosen `OWNER/REPOSITORY`, with GitHub Releases plus GitHub Pages from `gh-pages`.
The source repository may remain private. The chosen example is a setup
placeholder, not a provisioned service. Configure Pages first, including an
existing `gh-pages` branch and `.nojekyll`. No publisher changes visibility.

`GORO_RELEASE_BASE_URL` must be an actual public HTTPS Pages root followed by
`channels/`, ending in `/`. Paths published in the Pages branch:

```text
channels/stable/updater.json
channels/stable/latest.json
channels/stable/release.json
channels/beta/updater.json
channels/beta/latest.json
channels/beta/release.json
channels/alpha/updater.json
channels/alpha/latest.json
channels/alpha/release.json
versions/<exact-semver>/updater.json
versions/<exact-semver>/latest.json
versions/<exact-semver>/release.json
```

Only real published channels have pointers. An absent endpoint is an actionable
network error; never fabricate an empty release, placeholder URL or up-to-date
result. Publish stable candidates to eligible beta/alpha pointers only when
their SemVer is newer than that channel's current release. Never downgrade a
pointer. Existing versions cannot be overwritten or reused.

`latest.json` is the exact Tauri schema: `version`, `notes`, `pub_date` (RFC3339
UTC) and `platforms` entries `{url, signature}`. `signature` is the actual `.sig`
file's base64 content, not a URL. Keys: `windows-x86_64`/`-nsis`/`-msi`,
`darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`/`-appimage`. The Windows generic
entry targets NSIS; installer-specific entries preserve installation flavor.
Debian packages remain human downloads, without a claimed automatic update
entry. Native Linux checks reject non-AppImage installations, preventing an
installed Debian package from falling back to an incompatible AppImage payload.
Windows ARM/Linux ARM are unsupported, not invented manifest targets.

Website `release.json` uses `schemaVersion: 1`, `product`, `version`, `tag`, `channel`,
`publishedAt`, `releaseNotes`, `releaseUrl`, `checksumUrl`, and `downloads`.
`channel` classifies the release version, not the selected feed: a stable release
can appear on beta/alpha pointers when eligible and newer. Website consumers
validate SemVer acceptance for the chosen feed rather than requiring channel
label equality.
Each download has filename, normalized `platformKey`, platform, architecture,
format, public URL, lowercase SHA-256 and size in bytes. The array represents
multiple formats without ambiguous duplicate object keys. Recommended formats:
Windows `exe`, macOS `dmg`, Linux `AppImage`; MSI/DEB are explicit alternatives.
The macOS `app.tar.gz` format is the updater payload rather than a user installer.
`release.json` and `latest.json` come from the same verified artifact
set. Metadata generation requires the complete supported updater matrix.
The native app requests `latest.json`. `updater.json` remains an identical
compatibility alias for older builds using that endpoint. Website consumers must use `release.json`;
the earlier unreleased website `latest.json` naming is superseded. No production
release used that former website contract. See the exact generated local example
in [release.fixture.json](examples/release.fixture.json) and the
[Release Metadata Report](RELEASE_METADATA_REPORT.md).

The website fetches `/channels/stable/release.json` by default; a prerelease
selector fetches beta/alpha explicitly. Render text safely, validate schema,
and select an exact platform/architecture. Never construct guessed asset URLs,
scrape the source repo or embed a GitHub token. A missing platform should say
unavailable. Fetch pointers with `credentials: "omit"` and `cache: "no-cache"`.
Revalidate on page load and explicit refresh, with a five-minute UI freshness
interval. Latest endpoints require public `Access-Control-Allow-Origin: *`
(or the exact website origin), no credentialed CORS, and Cache-Control max-age
at most 600 seconds. Pages/CDN defaults must be measured; if they exceed this
limit, configure a CDN or reverse proxy in front of Pages before launch.
Immutable `/versions/...` metadata and versioned binaries can be cached longer.
Keep a last verified release on network/schema errors with a visible stale/error
message; never substitute guessed links or advance to incomplete metadata.
No live endpoint has been provisioned or certified in this task. Run the read-only
acceptance check after provisioning and each release propagates:

```sh
node scripts/check-distribution-endpoint.mjs --base-url https://OWNER.github.io/REPOSITORY/channels/ --website-origin https://YOUR-WEBSITE --channel alpha
```

Replace both placeholder origins with actual public HTTPS configuration.
Website implementation
is external to this repository; this is its integration contract.

## Signing, CI and publication

Required public source-repository variables:

- `GORO_UPDATER_PUBLIC_KEY`: complete base64 Tauri public key file content.
- `GORO_RELEASE_BASE_URL`: configured public Pages URL ending `/channels/`.
- `GORO_RELEASE_REPOSITORY`: the separate public `OWNER/REPOSITORY`.

Optional `GORO_SIGNING_PUBLIC_KEY` defaults to GORO_UPDATER_PUBLIC_KEY. During an
explicit key migration it verifies the current signing identity while the
bridge application's embedded updater key can be the next identity. The CI
generator therefore never disables verification to build a bridge.

Required protected CI secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: complete encrypted Tauri private key file content.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: its password (empty only for an explicitly
  approved unencrypted key; encrypted production keys are recommended).
- `GORO_RELEASE_TOKEN`: fine-grained token or GitHub App token scoped to contents
  write on the public distribution repo only. It is used solely by the CI
  publisher; never exposed to application, website, artifacts or metadata.

Create protected `release-signing` and `release-distribution` environments.
Restrict deployment refs/reviewers. Grant the signing secret only to the signing
environment, publisher credential only to distribution. Public variables can
be repository variables. The source `GITHUB_TOKEN` has contents read only.
Repository admins must review workflow changes before allowing secret access.
Release workflow action references are pinned to audited commit SHAs. The
unprivileged planning job checks release commits are reachable from develop/main;
manual candidate dispatch accepts only those branches. These checks supplement
protected environment reviewers/ref restrictions: an untrusted modified workflow
must never be approved for signing or publication. Ordinary PR CI has no release
secrets. Update pinned actions deliberately after review.
Signing secrets are injected only into configuration preflight/build steps, not
checkout, dependency installation or test steps. The protected build toolchain
still has signing authority and must be reviewed accordingly.
Production key creation, rotation, storage and endpoint provisioning are
maintainer actions; this implementation does not perform them.

`bundle.createUpdaterArtifacts` is enabled through
`src-tauri/tauri.updater.conf.json` in release/QA builds. The
`scripts/update-build-config.mjs` preflight generates `.tmp/goro-updater-build.json`
with the actual **public** signing key required by Tauri's bundler. Release builds
use that merged override; it contains no private signing identity/password.
Ordinary local builds
remain possible without signing secrets and explicitly report updates as
unconfigured. Public key/base are compiled into the native backend using
`option_env!`; `build.rs` tracks their changes. Release build must have these
values before Cargo runs. Private keys are used by the CLI signing step only.

Workflow sequence:

1. Validate synchronized tag, docs, frontend/native tests and configuration.
2. Build/sign the complete OS/architecture matrix with the updater override.
3. Package only each explicit fresh target bundle directory, preserving paired
   signatures. Names retain `goro-v<full-semver>-<platform>-<architecture>`.
4. Verify every updater artifact using the official Minisign verification crate
   and its signed version, through `tools/update-verifier`. Generate checksums,
   updater and website JSON once from the same files.
5. For a requested publication, reject existing versions and private destination
   repos. Create a draft, upload all binaries/signatures/checksums, and require
   GitHub's digest/size acknowledgement before making it public.
6. Verify every binary's public unauthenticated URL, actual SHA-256 and size.
7. Atomically commit version metadata and eligible channel pointers on Pages.
   A non-forced branch update rejects races. Metadata is the last publication
   step. Check Pages propagation before announcing the release.

`workflow_dispatch` with publish=false produces a verified candidate without
publishing. Tag runs or explicit publish=true enter protected distribution.
No workflow has been dispatched by this implementation. No tag was created.
Any upload failure leaves a draft for maintainer inspection. Failure after a
release becomes public leaves channel pointers unchanged; do not overwrite
assets. Resolve deliberately with a new version or documented draft recovery.
Rollback is a **newer** signed release carrying reverted code, never a lower
version pointer or downgraded binary. Key rotation needs a bridge release signed
by the old key that embeds the next public key. Preserve an old-key distribution
endpoint permanently pointing at that bridge for clients that were offline.
Provision a new public endpoint/repository for next-key clients: bridge builds
embed its base/key, but bridge artifacts/metadata are published through the old
repository with GORO_SIGNING_PUBLIC_KEY set to the old public key. Subsequent
releases use the new repository/base and next signing identity. Do not advance
the legacy pointer to new-key-only releases. Review and stage this migration
explicitly; keep the old key protected until support policy permits retirement.
A lost signing key requires a separately trusted
manual installer migration, not disabling signature verification.

## Testing and limitations

`node --test scripts/*.node-test.mjs` includes a real ephemeral Tauri key/signature
fixture, tampered bytes, wrong key, malformed signature and signed-version
mismatch. It writes temporary keys outside the workspace, suppresses key output,
and removes its own verified temporary directory. It never creates a production
identity. Unit tests cover channel/SemVer, sanitized errors, native operation
locking, frontend event ordering/deduplication and shared safe-close ordering.

Before first real release, test two genuinely signed application versions through
the configured public HTTPS service: manual/startup checks, all channels, offline,
malformed manifests, missing target, broken link, interrupted download, invalid
signature, unknown length, dirty/external-conflict drafts, active Run/Test/Debug/
terminal/Git, refused cleanup, installer failure, successful upgrade and relaunch.
Validate both Windows MSI/NSIS, both macOS architectures and Linux AppImage.
Test signing/notarization separately: updater Minisign is not Windows Authenticode
or Apple Developer ID/notarization. No platform trust certification is claimed.

Current known limits: the official check parses metadata before the 256 KiB
policy check (timeout and trusted origin constrain requests, but this is not a
preallocation cap). Verified downloads use bounded in-memory buffers, so peak
memory still rises during download/verification. Platform install paths and
Windows breakaway need signed end-to-end host QA. The pre-existing Unix PTY
descendant and Git cleanup edge cases remain release blockers in
[release readiness](RELEASE_READINESS.md). See the current evidence in
Update System Report (local archived report).
