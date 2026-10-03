# Goro Release Runbook

This document defines the complete operational procedure for preparing, validating, publishing, and verifying releases of Goro.

For the maintainer-requested experimental alpha publication from main, follow [Release setup](RELEASE_SETUP.md) and the reviewed [alpha notes](releases/v0.2.0-alpha.1.md). The current native/stable acceptance audit remains NOT READY in [Release Readiness](RELEASE_READINESS.md); the alpha does not certify those missing checks.

The secure updater/distribution contract is defined in [UPDATES.md](UPDATES.md).
The release workflow requires real version-bound signatures, an already public
distribution repository and protected signing/distribution configuration. The
current target is the existing public source repository sung2708/goide; no second
repository is required. Only source reachable from main can release.
It verifies artifacts before committing public Pages channel pointers. A manual
workflow dispatch defaults to candidate-only validation. Published installers are
GitHub Release assets in the configured public repository; the current target
is sung2708/goide. The updater/web pointers are deployed separately through Pages.

The workflow initializes MSVC on Windows, runs Rust tests as well as frontend tests, explicitly builds each matrix target, and uses Bash for artifact packaging on every runner. The Intel macOS job uses `macos-15-intel`, replacing the retired `macos-13` image ([GitHub runner retirement notice](https://github.com/actions/runner-images/issues/13046)). These configuration checks and local Windows builds do not establish that hosted Linux/macOS builds, installation, signing, or publication have succeeded.

---

## 1. Release Flow Overview

```
Developer Work / PRs
       │
       ▼
CI Validation (All checks green)
       │
       ▼
Merge into main
       │
       ▼
Release Preparation (version:set & changelog generation)
       │
       ▼
Create & Push Git Tag: vX.Y.Z[-prerelease]
       │
       ▼
GitHub Actions Release Workflow:
  ├─ 1. Validate tag & verify version synchronization
  ├─ 2. Run Vitest & Cargo test suites
  ├─ 3. Multi-platform build matrix (Windows, macOS, Linux)
  ├─ 4. Generate SHA-256 checksums (SHA256SUMS.txt)
  ├─ 5. Generate Conventional Commit release notes
  └─ 6. Publish GitHub Release with attached assets
       │
       ▼
Maintainer Post-Release Verification
```

---

## 2. Step-by-Step Maintainer Release Procedure

### Step 1: Ensure Clean Branch State
Ensure you are on the `main` branch with no uncommitted changes:
```bash
git checkout main
git pull origin main
git status
```

### Step 2: Choose the Next Version
Select the next version following [docs/VERSIONING.md](VERSIONING.md):
- Alpha: `0.x.y-alpha.N` (e.g. `0.2.0-alpha.1`)
- Beta: `0.x.y-beta.N` (e.g. `0.3.0-beta.1`)
- Release Candidate: `0.x.y-rc.N` (e.g. `0.9.0-rc.1`)
- Stable: `1.0.0`

### Step 3: Update and Synchronize Versions
Atomically update `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`:
```bash
npm run version:set <NEW_VERSION>

# Verify synchronization
npm run version:check
```

### Step 4: Update the Changelog
Prepend the release section into `CHANGELOG.md`:
```bash
node scripts/generate-changelog.mjs --tag v<NEW_VERSION> --prepend-changelog
```
Review `CHANGELOG.md` to ensure highlights and breaking change notices are accurate.

### Step 5: Execute Quality Verification
Run local quality gates:
```bash
npm run typecheck
npm test
npm run build
```

### Step 6: Commit and Create the Release Tag
Commit the version and changelog updates:
```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml CHANGELOG.md
git commit -m "chore(release): prepare v<NEW_VERSION>"
git push origin main

# Create annotated Git tag
git tag -a v<NEW_VERSION> -m "Goro v<NEW_VERSION>"
git push origin v<NEW_VERSION>
```

### Step 7: Monitor GitHub Actions
1. Open the GitHub Actions tab at `https://github.com/sung2708/goide/actions`.
2. Monitor the **Release** workflow triggered by your tag push.
3. Ensure all matrix build jobs (Windows, macOS, Linux) succeed.

### Step 8: Verify the Published GitHub Release
Once the workflow completes:
1. Verify the GitHub Release in the configured public distribution repository
   (`GORO_RELEASE_REPOSITORY`), plus the matching public Pages updater/website
   contracts. The source repository's release page is not the download endpoint.
2. Ensure the release is correctly marked as **Prerelease** (for `-alpha`, `-beta`, `-rc`) or **Latest**.
3. Verify that all expected platform bundles follow the canonical naming convention:
   - Windows Setup: `goro-v<VER>-windows-x86_64-setup.exe`
   - Windows MSI: `goro-v<VER>-windows-x86_64.msi`
   - macOS Apple Silicon: `goro-v<VER>-macos-aarch64.dmg`
   - macOS Intel: `goro-v<VER>-macos-x86_64.dmg`
   - Linux AppImage: `goro-v<VER>-linux-x86_64.AppImage`
   - Linux Debian: `goro-v<VER>-linux-x86_64.deb`
   - Checksums: `SHA256SUMS.txt`
4. Confirm that `SHA256SUMS.txt` matches the final published filenames and verify hashes.
5. Confirm the website `release.json` and Tauri `latest.json` point to the same
   version, actual publication date and verified artifacts. Run the public
   CORS/cache/propagation probe described in [UPDATES.md](UPDATES.md). See the
   [Release Metadata Report](RELEASE_METADATA_REPORT.md) for schema, exact fixture
   example, secret locations and the alpha.1 → alpha.2 acceptance procedure.

---

## 3. Release Artifact Naming Standards

All distributable artifacts MUST use deterministic, human-readable filenames. Generic or ambiguous names (such as `setup.exe`, `app.exe`, or `goide.exe`) are strictly forbidden.

### Canonical Pattern
```
goro-v{VERSION}-{PLATFORM}-{ARCH}.{EXT}
```
Or for installer formats requiring package disambiguation:
```
goro-v{VERSION}-{PLATFORM}-{ARCH}-{PACKAGE}.{EXT}
```

### Normalization Rules
- **Platform**: `windows`, `macos`, `linux`
- **Architecture**: `x86_64`, `aarch64`
- **Prerelease preservation**: Tags such as `alpha.1`, `beta.2`, `rc.1` are preserved exactly in the filename (e.g. `goro-v0.1.0-beta.2-windows-x86_64-setup.exe`).

### Windows Executable Naming vs. Distribution Artifact
- **Distribution Artifact**: `goro-v{VERSION}-windows-x86_64-setup.exe`
- **Installed Executable**: `Goro.exe`
- Tauri `mainBinaryName` sets the executable filename; `productName` sets the display name and does not rename Cargo's output by itself.
- The version, platform, and architecture identifiers apply exclusively to distribution artifacts, NOT the application executable installed on the user's system.

### Automated Packaging & Verification
- `scripts/package-artifacts.mjs`: Renames Tauri outputs to canonical distribution names and generates `.sha256` hashes.
- `scripts/validate-release-assets.mjs`: Automated gate in CI verifying canonical names, absence of generic filenames, version preservation, and 100% cryptographic match with `SHA256SUMS.txt`.

---

## 3. Release Checklist

Maintainers must review this checklist before declaring a release complete:

- [ ] Working tree is clean and all commits are merged into `main`.
- [ ] Version numbers are synchronized across `package.json`, `tauri.conf.json`, and `Cargo.toml`.
- [ ] `npm run version:check` passes without warnings.
- [ ] The full current Vitest test suite is green with no skipped failures.
- [ ] TypeScript typecheck passes (`npm run typecheck`).
- [ ] Frontend production build succeeds (`npm run build`).
- [ ] `CHANGELOG.md` is updated and reviewed for clarity.
- [ ] Release tag adheres strictly to `vX.Y.Z[-prerelease]` format.
- [ ] Release workflow ran to completion on GitHub Actions.
- [ ] `SHA256SUMS.txt` is published and verified.
- [ ] Windows installer runs cleanly on a test machine.
- [ ] Linux AppImage / deb runs cleanly on Ubuntu.
- [ ] macOS DMG installs and opens cleanly.
- [ ] Known limitations or prerequisites are clearly noted in release notes.

---

## 4. Rollback & Recovery Procedure

If a critical flaw or packaging corruption is discovered immediately after tag publication:

1. **Do NOT delete the Git tag**: Retaining tag history prevents build discrepancies and broken references.
2. **Mark the GitHub Release as Broken**:
   - Edit the GitHub Release notes to prepend a prominent warning:
     > `> [!CAUTION]`
     > `> **Known Critical Issue**: Do not use this release. See advisory issue #...`
   - Uncheck "Set as latest release".
3. **Publish a Fast-Forward Hotfix**:
   - Resolve the issue on `main`.
   - Bump to a new patch or prerelease version (`0.x.y+1` or `0.x.y-alpha.N+1`).
   - Push the new tag to trigger a clean release pipeline.

## Product branding in release assets

The repository remains `goide`; public packages and the installed application use **Goro**. The packaging script selects bundle filenames matching the configured product name and requested version, so leftover GoIDE installers or older Goro bundles cannot be republished under the new name. Windows packages install `Goro.exe`.

Verify artifact selection with:

```sh
node --test scripts/package-artifacts.node-test.mjs
```

## Code Actions gate update (2026-10-03)

Reviewed direct gopls edits and edit-only ApplyFix actions are implemented and tested, including actual native gopls queries. Full Code Actions support is incomplete: selection refactorings, interactive/other command workflows and resource operations still need dedicated ownership and review handling. The overall addendum and source-control acceptance gates remain open. Do not create or push a release tag from this checkpoint.

## Final audit hardening

Release Cargo tests use the same serial fixture scheduling as CI because native fixtures share process/tool registries. Dedicated concurrency fixtures still test overlapping operations. Every valid prerelease suffix is marked prerelease after synchronized SemVer validation, rather than only recognizing alpha/beta/rc words. These changes do not establish hosted release execution, signing, installer acceptance or authorization to publish.
