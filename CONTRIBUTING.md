# Contributing to Goro

Thank you for your interest in contributing to Goro!

Goro is a desktop IDE focused on Go source editing, runtime inspection, concurrency analysis, race-detector workflows, and lightweight debugger controls.

Please take a few moments to review these guidelines before submitting code, issues, or documentation.

---

## Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any violations through private maintainer channels.

---

## Development Setup

### Prerequisites

1. **Node.js**: v20 LTS or v22 LTS and `npm`
2. **Go Toolchain**: Go 1.21+ installed on `PATH`
3. **Rust Toolchain**: Stable Rust (`rustup default stable`)
4. **Go Developer Tools**:
   - `gopls` (`go install golang.org/x/tools/gopls@latest`)
   - `dlv` (`go install github.com/go-delve/delve/cmd/dlv@latest`)
5. **Platform Build Tools**:
   - **Windows**: Visual Studio 2022 C++ Build Tools (MSVC)
   - **Linux**: WebKitGTK and development libraries (see [docs/BUILDING.md](docs/BUILDING.md))
   - **macOS**: Xcode Command Line Tools

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/sung2708/goide.git
cd goide

# 2. Install frontend dependencies
npm ci

# 3. Verify version synchronization
npm run version:check

# 4. Run frontend tests
npm test

# 5. Start the development desktop application
npm run tauri dev
```

For complete platform-specific setup details, consult [docs/BUILDING.md](docs/BUILDING.md) and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

---

## Branching Model

Goro follows a lightweight trunk-friendly branching model:

- `main`: The primary stable development branch. Must remain green and releasable at all times.
- `develop`: Integration branch for larger multi-feature merges before landing in `main`.
- `feature/<name>`: New capabilities or functional improvements.
- `fix/<name>`: Bug fixes and stability corrections.
- `docs/<name>`: Documentation additions and improvements.
- `refactor/<name>`: Architectural cleanups without behavior changes.

Always branch from the latest `main` (or `develop` for active milestone cycles).

---

## Commit Message Conventions

Goro enforces [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). This allows our automated release tooling to generate accurate changelogs and categorize release notes.

Format:
```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

### Allowed Types

- `feat`: A new user-facing feature or capability
- `fix`: A bug fix
- `perf`: A code change that improves performance
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `docs`: Documentation only changes
- `test`: Adding missing tests or correcting existing tests
- `build`: Changes that affect the build system or external dependencies
- `ci`: Changes to CI configuration files and scripts
- `chore`: Housekeeping tasks that do not modify `src` or `test` files
- `revert`: Reverts a previous commit

### Optional Scopes

Common scopes include:
- `editor`: CodeMirror editor, bracket pairing, syntax highlighting
- `debugger`: Delve DAP integration, breakpoints, stepping
- `concurrency`: Causal analysis, channel tracing, signal detection
- `terminal`: PTY shell sessions, logs view, terminal dock
- `workspace`: Explorer tree, file watch, search panel
- `git`: Branch picker, dirty-state dialog, status integration
- `release`: Version synchronization, changelog, build packaging

### Breaking Changes

Signal breaking changes by appending an exclamation mark `!` after the type/scope or by including `BREAKING CHANGE:` in the footer:

```
feat(debugger)!: redesign DAP session lifecycle contract

BREAKING CHANGE: The IPC command `start_debug_session` now requires explicit package target parameters.
```

---

## Pull Request Guidelines

1. **Small, focused changes**: Submit PRs that address a single concern. Avoid mixing refactoring with bug fixes or new features.
2. **Include tests**: All logic changes, bug fixes, and new features must be accompanied by automated tests in `src/` (Vitest) or `src-tauri/` (Cargo test).
3. **No ephemeral agent artifacts**: Do NOT commit temporary AI planning files, scratchpads, prompt logs, or intermediate task lists. Ensure `.gitignore` rules are respected.
4. **Synchronize versions**: If a pull request increments project versions, use `npm run version:set <version>` to update all files atomically.
5. **Verify before submitting**:
   ```bash
   npm run version:check
   npm run typecheck
   npm test
   npm run build
   ```

---

## Contributor Verification Checklist

Before opening your pull request, verify:
- [ ] Code builds without errors (`npm run build`).
- [ ] All Vitest unit and integration tests pass (`npm test`).
- [ ] TypeScript checks succeed (`npm run typecheck`).
- [ ] Version sources are synchronized (`npm run version:check`).
- [ ] Commits follow Conventional Commits.
- [ ] No internal working notes, debug dumps, or scratch files are committed.
