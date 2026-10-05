# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> [!NOTE]
> Historical tags (`v1.0.0`, `v1.0.1`, `v1.0.2`, `v1.1`) represent early exploratory prototypes.
> As detailed in [docs/VERSIONING.md](docs/VERSIONING.md), Goro is establishing a formal pre-1.0 stabilization track (`0.x.y`) leading toward its first production-stable 1.0 release.

---

## [Unreleased]

### Editor migration (develop; not yet published)

- Replace CodeMirror with Monaco ESM and locally bundled workers; remove the old editor adapters and dependencies. Keep Goro's save, workspace edit review, navigation, run/test/debug and filesystem ownership.
- Retain per-file models, undo history and view state across tabs, with disposal on close/workspace change and UTF-16 positions for Unicode paths and source.
- Carry gopls completion metadata and import edits into Monaco; synchronize unsaved Go tabs and reject cancelled or obsolete language results. Add Monaco hover/signature providers and retain semantic outline, folding and Run/Debug entry actions.
- Fix completion cancellation when React commits a just-typed buffer, refresh gopls suggestions as prefixes grow, and enable package-member previews for Monaco automatic Invoke requests.
- Keep quick suggestions active inside snippet placeholders; avoid native waits for function-declaration snippets and reuse identical recent completion results without carrying edits across model versions or cursor changes.
- Autosave exact drafts without asynchronous format/import preparation. Explicit saves retain preparation preferences and persist incomplete Go unchanged when gopls reports a parser error, while preserving stale-edit and operational-error guards.
- Request diagnostics from live buffers after a short debounce, fix the initial-open snapshot race, and keep saves independent from diagnostics. Preserve independent language, race and test markers and inline error messages.
- Preserve bounded Find/Replace; stop ordinary rescans from moving the caret. Keep replacement undo groups and stale/read-only/regex-limit guards.
- Keep BOM and LF/CRLF through editor serialization and undoable external reloads. Correct special-key Vim mappings and sanitize Markdown resource URLs before DOM insertion.
- Add configurable Vim motions and sanitized Markdown row previews. Render boolean Settings as accessible switches. Rename displayed Kott themes to Goro Dark/Light while retaining stored IDs and all palettes.
- Add restrained workbench hover, press and keyboard focus feedback; use existing glass tokens on dialogs/menus. Space square Run/Debug buttons and align them with their source row.
- Release acceptance remains pending: full suite, real native workflows, screenshots, platform/installer and measured editor-performance gates must pass before promotion.

## [0.5.0-alpha.1] - 2026-10-04

### Added
- Optional managed Go/gopls/Delve setup, new Go projects, and bounded local draft recovery with export copies.
- Persistent Project actions for opening, creating and closing projects with existing document-safety guards.

### Fixed
- Restore only the saved active document while loading background tabs.
- Honor Don't Save on normal app exit and dismiss Project when pressing outside the menu.
- Scope the Welcome new-project regression to its own navigation area.

### Release status
- Experimental alpha from main after develop promotion; native recovery, containment, performance and cross-platform install/upgrade acceptance remain open. See [release notes](docs/releases/v0.5.0-alpha.1.md).

## Historical development notes

### Changed
- Rename the public product to **Goro**, inspired by goroutines, with the brand line **Understand Go in motion.** Repository URLs, npm/Cargo package names, and the application identifier remain `goide`.
- Replace legacy branding with the runtime gopher, original Goro wordmark, light/dark/monochrome logos, simplified favicons, and native application icons. Update README, product/brand documentation, welcome screen, window title, and release names.

### Added
- Kott-inspired graphite workbench styling, an editorial welcome screen, and a title-bar file picker shortcut.
- A persistent color-theme selector with Black & White as the default for users without a saved preference, plus Goro Dark, Goro Light, VS Code Dark, Nord, Tokyo Night/Storm/Light, and Catppuccin Latte/Frappé/Macchiato/Mocha. The existing `kott` and `light` preference IDs remain intact.
- Live terminal palette updates that preserve the existing shell session and output.

### Known Issues
- Shutdown, external-edit conflicts, and Explorer rename/delete still need complete dirty-buffer safety validation. Hosted cross-platform release verification and clean installation/upgrade validation are pending.

### Fixed
- Preserve dirty buffers before Git status/checkout and on commit/stash/discard confirmation, block failed/in-flight saves and late edits, and reload destination files without replaying previous-branch edits. Retire unavailable destination files, reload after failed Git actions, and require active run/debug sessions to stop before switching. Document-safety and native lifecycle gaps listed above still block a readiness claim.
- Derive and validate a numeric Windows MSI version separately from application SemVer, allowing Alpha builds to package without dropping prerelease labels from metadata or artifact names.
- Set `mainBinaryName` explicitly so the packaged Windows application is `Goro.exe`; `productName` alone only sets the display name.
- Encode gopls file URIs correctly, distinguish server requests from responses, bound incoming messages, and release language-server processes/readers on session replacement and app exit.
- Surface completion failures instead of treating a failed CLI fallback as an empty successful result.
- Release failed gopls sessions so subsequent requests can initialize a fresh server and resynchronize unsaved content.
- Retry failed filesystem reconciliation scans without requiring a second native event.
- Configure locked Rust checks and tests across Windows, macOS, and Linux CI runners, using MSVC discovery on Windows. Hosted execution remains to be verified.
- Initialize MSVC for release builds, run Rust release verification tests, select explicit build targets, use Bash for cross-platform packaging, and replace the retired Intel macOS runner.
- Replace the no-op filesystem watcher with real native subscriptions, bounded/coalesced scans, metadata-based polling fallback, and subscription cleanup on workspace changes and app exit.
- Protect the workspace root from delete/rename/move, mutate symlink entries without following their referents, and reject dangling destination collisions.
- Reject Windows drive-relative rename destinations that would replace the scoped parent path during path joining.
- Handle Windows canonical workspace paths and report filesystem-sync startup failures, including unavailable sync in browser preview.
- Discover MSVC installations on any drive, remove the machine-specific Cargo linker override, and declare the Rust version required by locked dependencies.
- Preserve dirty editor buffers before opening another file or workspace; failed saves and reads retain the current document and expose an error.
- Scope autosaves to their originating document, cancel pending autosaves after manual saves and transitions, and retain newer edits while a write is pending.
- Keep toolchain availability probes independent of document loading and ignore results for previous documents.
- Prevent save completion after editor unmount from scheduling another autosave.
- Make runtime polling recovery tests deterministic with controlled timeout and backoff clocks.
- Bound frontend test worker concurrency to avoid workbench test timeouts under resource contention.
- Update Vite and Vitest within their existing major versions and refresh affected transitive toolchain dependencies to address high/critical npm audit findings.
- Make the scheduled npm security audit fail when its high-severity threshold is exceeded.

---

## [0.2.0-alpha.1] - 2026-10-02

> [!WARNING]
> **Alpha Release Notice**: This is an Alpha pre-release intended for testing, validation, and feedback on Go source editing, runtime inspection, and release automation. It is NOT a stable production release.

### Highlights
- First official release on the pre-1.0 stabilization track (`v0.x.y`).
- Full multi-platform release engineering pipeline producing canonical distribution packages (`goide-v0.2.0-alpha.1-{platform}-{arch}`) and SHA-256 manifests.
- Verified Windows installed executable naming (`GoIDE.exe`).
- Complete documentation architecture and automated quality gates.

### Added
- Standardized documentation suite: `PRODUCT.md`, `ARCHITECTURE.md`, `DEVELOPMENT.md`, `BUILDING.md`, `TESTING.md`, `ENGINEERING_RULES.md`, `ROADMAP.md`, `VERSIONING.md`, `RELEASE.md`, and `TROUBLESHOOTING.md`.
- Automated changelog and release notes generation via `scripts/generate-changelog.mjs`.
- Deterministic cross-file version synchronization and verification via `scripts/version-manager.mjs`.
- Deterministic artifact packager and normalizer via `scripts/package-artifacts.mjs`.
- Pre-publication release asset validation via `scripts/validate-release-assets.mjs`.
- Multi-platform GitHub Actions release pipeline (`.github/workflows/release.yml`) with automated SHA-256 checksum generation (`SHA256SUMS.txt`).
- Continuous integration pipeline (`.github/workflows/ci.yml`) validating frontend tests, TypeScript typechecking, version synchronization, and Rust/Cargo checks.
- Dependabot configuration for npm, cargo, and GitHub Actions ecosystems (`.github/dependabot.yml`).
- Structured GitHub issue templates for bug reports and feature requests, with private security reporting links.
- Pull request template with engineering verification checklist.

### Changed
- Synchronized repository baseline version across `package.json`, `tauri.conf.json`, and `Cargo.toml` to `0.2.0-alpha.1`.
- Configured Tauri display name and main binary name as `GoIDE`.
- Refactored Windows developer helper scripts (`scripts/*.cmd`) to eliminate hardcoded machine paths and resolve project directories dynamically.
- Strengthened `.gitignore` to prevent Rust build outputs, test coverage artifacts, OS files, and ephemeral AI/agent scratchpads from entering Git.

### Fixed
- Resolved repository version drift between `package.json`, `tauri.conf.json`, and `Cargo.toml`.

### Removed
- Removed obsolete temporary agent scratch files and one-off patch scripts from the repository.

---

## [1.0.2] - 2026-03-01

### Added
- In-file find and replace widget (`FindWidget`) integrated directly into the CodeMirror editor with keyboard shortcuts (Ctrl+F, Esc).
- Workspace-wide search panel with Replace and Replace All support (`useWorkspaceSearchState`).
- Full Git branch switching integration with dirty-state confirmation dialog and Explorer file tree refresh.
- Delve debugger recovery workflow with dedicated failure modal and status recovery guards.
- Dual terminal workbench integration with persistent shell and process logs views.
- Go semantic analysis powered by `web-tree-sitter` in a dedicated Web Worker.
- Document symbol outline panel with keyboard navigation and breadcrumb jump actions.

### Fixed
- Bounded terminal layout inside workbench viewport and eliminated overflow clipping.
- Fixed literal replacement escaping in regex replacement operations.
- Resolved remote branch identity resolution for duplicate remote branch names.
- Protected debug session start-stop transition state guards from race conditions.

---

## [1.0.1] - 2026-02-15

### Added
- Package member autocompletion and snippet discovery via `gopls` integration.
- Delimiter pairing and bracket matching in the CodeMirror editor.
- Toolchain preflight checks surfacing Go, `gopls`, and `dlv` availability in the status bar.

### Fixed
- Polling guard stability during active runtime signal observation.
- MSVC C/C++ compiler toolchain selection guidance on Windows.

---

## [1.0.0] - 2026-02-01

### Added
- Initial public prototype release.
- Tauri desktop shell with React frontend and Rust backend.
- Workspace file tree explorer with file create, rename, and delete capabilities.
- Go source editing with syntax highlighting and LSP diagnostics.
- Execution of active Go files with stdout/stderr streaming into the integrated terminal panel.
- Experimental `-race` detector execution with in-editor finding markers.
- Delve DAP runtime sampling with breakpoint control and runtime signal inspection.
