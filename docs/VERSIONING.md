# Goro Versioning Policy

Goro adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) (`MAJOR.MINOR.PATCH`).

---

## 1. Pre-1.0 Versioning Track

Goro has not yet reached stable 1.0 production maturity. During the pre-1.0 lifecycle, versions are structured as:

```
0.MINOR.PATCH[-PRERELEASE]
```

- **`0.MINOR.0`**: Introduces significant new capabilities, major UI changes, or internal architectural refactoring. Breaking changes before 1.0 increment the **`MINOR`** version.
- **`0.MINOR.PATCH`**: Backward-compatible bug fixes, stability improvements, and documentation updates.
- **Prerelease Tags**:
  - **Alpha**: `0.x.y-alpha.N` (Internal testing, stabilization, experimental features)
  - **Beta**: `0.x.y-beta.N` (Feature-complete milestones undergoing stabilization)
  - **Release Candidate**: `0.x.y-rc.N` (Candidate builds undergoing final release verification)
- **Production Stable**: `1.0.0` (Signifies full production readiness, multi-platform stability, and API commitment)

---

## 2. Git Tag Naming Conventions

All releases in Git are marked with annotated or signed tags prefixed with `v`:

| Release Type | Tag Pattern | Example | GitHub Release Status |
|:---|:---|:---|:---|
| **Alpha Pre-release** | `v0.x.y-alpha.N` | `v0.2.0-alpha.1` | Marked as **Prerelease** |
| **Beta Pre-release** | `v0.x.y-beta.N` | `v0.3.0-beta.1` | Marked as **Prerelease** |
| **Release Candidate** | `v0.x.y-rc.N` | `v0.9.0-rc.1` | Marked as **Prerelease** |
| **Stable Release** | `vX.Y.Z` | `v1.0.0` | Marked as **Latest Release** |

> [!IMPORTANT]
> **Immutability Principle**: Never retag or reuse an already published Git tag for different source code. Once pushed, a tag and its published artifacts are permanent.

---

## 3. Version Synchronization & Enforcement

The repository contains version declarations across three configuration files:
1. `package.json`: `"version": "..."`
2. `src-tauri/tauri.conf.json`: `"version": "..."`
3. `src-tauri/Cargo.toml`: `version = "..."`

To prevent version drift, Goro provides an automated version manager tool (`scripts/version-manager.mjs`):

```bash
# Check that all version sources are synchronized
npm run version:check

# Validate that the version matches a specific git tag
node scripts/version-manager.mjs check --tag v0.2.0-alpha.1

# Update the version manifests and derived MSI version
npm run version:set 0.2.0-alpha.1
```

The GitHub Actions release workflow (`.github/workflows/release.yml`) strictly enforces this check: if a pushed tag does not match the checked-in version, the release job fails immediately before running any build steps.

Windows MSI packaging needs a separate numeric `bundle.windows.wix.version`. The version manager derives `MAJOR.MINOR.PATCH` (for example, `0.2.0-alpha.1` maps to `0.2.0`) and checks it for drift and MSI field limits. Application versions and artifact filenames retain complete SemVer. [Windows Installer compares only the first three numeric fields](https://learn.microsoft.com/en-us/windows/win32/msi/productversion), so prereleases sharing the same core version have the same MSI ProductVersion; a fourth field would not establish upgrade ordering. Uninstall the prior MSI before testing another prerelease of that core version, and validate upgrades separately before release. NSIS is the preferred Alpha installer. The manifests are written sequentially, not as a cross-file atomic transaction.

The version check covers these three manifests. The tracked lockfiles also contain root-package version metadata: after a version change, refresh `package-lock.json` with `npm install --package-lock-only` and `src-tauri/Cargo.lock` with `cargo check --manifest-path src-tauri/Cargo.toml`. Review the generated diff before committing. Do not edit lockfiles manually; a missing Rust toolchain leaves Cargo lockfile synchronization and locked native builds unverified.

---

## 4. Historical Tags & Migration Recommendation

### Context
Early repository development created tags `v1.0.0`, `v1.0.1`, `v1.0.2`, and `v1.1`. While these tags marked exploratory milestones, the product has not yet achieved 1.0 maturity.

### Recommended Migration Strategy: **Option A (Preserve & Clarify)**
We strongly recommend **Option A**:
1. **Preserve Historical Git Tags**: Keep `v1.0.0`, `v1.0.1`, `v1.0.2`, and `v1.1` in Git history to ensure no commit references or external links break.
2. **Archive Old GitHub Release Descriptions**: Edit existing GitHub Release entries for `v1.0.0` through `v1.1` to add a notice:
   > *"Notice: This release represents an early developer prototype. Goro is currently undergoing a formal pre-1.0 stabilization track leading to the true v1.0.0 production release."*
3. **Current Synchronized Baseline**: Repository metadata (`package.json`, `tauri.conf.json`, `Cargo.toml`) is synchronized at **`0.2.0-alpha.1`** as the first official release candidate of the Alpha stabilization milestone.
4. **No Destructive Deletions**: Do not delete remote Git tags or rewrite history without explicit written maintainer approval.
