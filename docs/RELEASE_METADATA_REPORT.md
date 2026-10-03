# Release metadata contract

This file keeps its existing path for website consumers. It documents the wire
contract, not a dated implementation report or a claim of platform certification.
The implementation is [release-contract.mjs](../scripts/release-contract.mjs);
setup is described in [RELEASE_SETUP.md](RELEASE_SETUP.md).

## Version and artifacts

package.json is the version source; Cargo.toml and tauri.conf.json must match.
Tags use canonical `v{SEMVER}`. Alpha maps to the alpha channel, beta/RC to beta,
and a version without prerelease to stable. Release from main only after the
[develop/main gates](RELEASE.md) pass and the release hold is lifted.

| platformKey | Website installers | Updater payload |
| --- | --- | --- |
| windows-x86_64 | EXE setup, MSI | Signed NSIS/MSI, preserving installation flavor |
| macos-aarch64 | DMG | Signed app.tar.gz |
| macos-x86_64 | DMG | Signed app.tar.gz |
| linux-x86_64 | AppImage, DEB | Signed AppImage |

The required inventory contains eight payloads. macOS archives are updater
payloads, not recommended manual downloads. No other architecture is implied.
Names are `goro-v{FULL_SEMVER}-{PLATFORM}-{ARCH}[-{PACKAGE}].{EXT}`; EXE ends in
`-setup.exe`, macOS updater archive in `-updater.tar.gz`. Signatures are paired
`.sig` files. Renaming must preserve signed bytes.

## Website: release.json

Schema 1 requires `schemaVersion`, `product`, `version`, `tag`, `channel`,
`publishedAt`, `releaseNotes`, `releaseUrl`, `checksumUrl` and `downloads`.
Each download contains `filename`, `platformKey`, `platform`, `architecture`,
`format`, `url`, lowercase `sha256` and byte `size`. Multiple formats for a target
remain explicit. Release notes describe the published main version only.

[release.fixture.json](examples/release.fixture.json) is a complete schema
example using local fixture bytes and deliberately nonexistent fixture URLs.
It is not production metadata or a real download.

## App: latest.json

The Tauri manifest contains `version`, `notes`, `pub_date` and `platforms`.
Each platform entry contains its public `url` and actual `signature` contents.
The app uses `darwin-*` keys where the website uses `macos-*`; Windows NSIS/MSI
keys preserve installer flavor. `updater.json` is a compatibility alias containing
the same JSON bytes. Both contracts derive from one verified artifact inventory.

## Public endpoints and publication

Configure `GORO_RELEASE_BASE_URL` as a public HTTPS base ending in `/channels/`.
The website reads `<BASE><CHANNEL>/release.json`; the app reads
`<BASE><CHANNEL>/latest.json`. Immutable version metadata lives under
`/versions/<SEMVER>/` at the same site root. Binary links refer to the configured
public GitHub release repository. Existing public source repositories are supported;
permissions and token selection are covered in [release setup](RELEASE_SETUP.md).

Validate artifact names, versions, sizes, checksums, notes and signatures before
publication. Publish verified immutable release assets, verify anonymous downloads,
then publish version metadata and eligible channel pointers **last**. Use the
actual release publication time. Refuse overwriting published versions or moving
an existing tag; concurrent metadata updates must not force-push over each other.
Failure must leave the previous channel pointer usable.

Serve JSON over HTTPS with appropriate CORS for the website; keep channel metadata
fresh and versioned files immutable. A green source job does not prove that public
URLs, signing or upgrades work. See [updates](UPDATES.md) for security behavior and
[release readiness](RELEASE_READINESS.md) for the outstanding acceptance gates.
