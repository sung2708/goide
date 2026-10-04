# Goro Development Guidelines

This document outlines the standard development environment, workflows, and quality gates for contributors and maintainers working on Goro.

---

## 1. Prerequisites & Environment Setup

Ensure the following tools are installed and present on your `PATH`:

- **Node.js**: `v20 LTS` or `v22 LTS` with `npm`
- **Go Toolchain**: `Go 1.21+` (`go version`)
- **Rust Toolchain**: Current stable, at least Rust 1.88 for the locked dependencies (`rustup default stable`)
- **Developer Tools**:
  - `gopls`: `go install golang.org/x/tools/gopls@latest`
  - `dlv`: `go install github.com/go-delve/delve/cmd/dlv@latest`

### Recommended Editor Setup
- **Visual Studio Code** with:
  - [Tauri Extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
  - [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
  - [Go Extension](https://marketplace.visualstudio.com/items?itemName=golang.Go)
  - [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)

---

## 2. Branching & Git Workflow

Development integrates on `develop`; all releases originate from `main`:

Do not promote a candidate while required develop checks are pending or failing.
The exact validated SHA is the unit of promotion. See
[Release promotion](RELEASE_PROMOTION.md) for the full automatic promotion
contract, required platform/acceptance gates and current release hold.

```
feature/fix → develop → validated merge → main → release tag
                  ▲                         │
                  └── version/hotfix sync ───┘
```

- **`main`**: The primary branch. Always kept in a releasable, passing state.
- **`develop`**: Integration branch for ongoing work; merge reviewed changes into
  main before release. A push here does not publish a new installer.
- **`feature/<short-description>`**: New features, UI enhancements, or tool integrations.
- **`fix/<short-description>`**: Bug fixes, stability improvements, or test corrections.
- **`docs/<short-description>`**: Documentation updates.
- **`refactor/<short-description>`**: Structural code refactoring without external behavioral changes.

Alpha, beta, release candidate and stable tags must identify the reviewed main
commit. Manual release and non-publishing candidate workflows also run from main.
Synchronize main-only release preparation and hotfixes back into develop. See
[the required release branch policy](RELEASE.md#required-branch-policy).

---

## 3. Commit Message Standards

Goro strictly adheres to [Conventional Commits v1.0.0](https://www.conventionalcommits.org/).

### Format
```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

### Types
| Type | Purpose | Example |
|:---|:---|:---|
| `feat` | User-facing feature | `feat(editor): add bracket match indicator` |
| `fix` | Bug fix | `fix(terminal): prevent stdout buffer overflow` |
| `perf` | Performance improvement | `perf(search): cache workspace file index` |
| `refactor` | Code refactoring | `refactor(ipc): split command handlers into modules` |
| `docs` | Documentation only | `docs(release): document multi-platform packaging` |
| `test` | Adding or updating tests | `test(debugger): add breakpoint sync test cases` |
| `build` | Build system or dependencies | `build: update tauri dependency version` |
| `ci` | CI workflows or scripts | `ci: add Linux WebKitGTK caching` |
| `chore` | Housekeeping | `chore: update repository ignore patterns` |

### Breaking Changes
Signal breaking changes by adding `!` after the type/scope or adding `BREAKING CHANGE:` in the commit footer.

---

## 4. Verification & Quality Gates

Before opening a pull request or pushing commits, execute all quality gates locally:

### 1. Version Synchronization Check
Ensures `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` share identical versions:
```bash
npm run version:check
```

### 2. TypeScript Compilation & Typechecking
```bash
npm run typecheck
```

### 3. Frontend Unit & Integration Tests
Runs the full Vitest suite (400+ tests across editor, panels, hooks, and IPC):
```bash
npm test
```

### 4. Frontend Production Build
Validates that Vite and Tailwind CSS bundle cleanly for production:
```bash
npm run build
```

### 5. Rust Checks (where environment permits)
```bash
# Format check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check

# Clippy linter
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings

# Backend unit & integration tests
cargo test --manifest-path src-tauri/Cargo.toml

# Compile check
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## 5. Dependency Management Policy

1. **Minimal Dependencies**: Always prefer standard platform APIs and standard library utilities over third-party packages.
2. **Lockfile Integrity**: Never edit `package-lock.json` or `Cargo.lock` manually. Always update dependencies via `npm` or `cargo`.
3. **Security Audits**: Dependabot proposes npm, Cargo, and GitHub Actions updates. The weekly security workflow currently runs npm audit; it does not run a Rust advisory audit. A separate Rust advisory check is required before release. New dependencies must be checked for permissive licensing (MIT, Apache 2.0, BSD, CC0).

Run `npm audit --audit-level=high` when changing frontend dependencies. The scheduled security workflow fails at this threshold. Low/moderate findings still require review; do not use forced major upgrades without validating compatibility.

---

## 6. Repository Hygiene & Ephemeral Artifacts

To maintain repository cleanliness:
- **Never commit AI scratchpads**: Temporary agent planning files, intermediate prompt logs, and scratch scripts belong in ignored directories (such as `.tmp/` or local unversioned storage).
- **Never commit binaries or build outputs**: All binaries (`.exe`, `.dmg`, `.AppImage`, `target/`, `dist/`) must remain untracked.
- **Maintain clean diffs**: Review `git status` and `git diff` before committing to avoid accidental formatting or unintended file modifications.
