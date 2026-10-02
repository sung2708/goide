# GoIDE

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand/logo-dark.svg" />
  <img src="public/brand/logo-light.svg" alt="GoIDE — Go gopher with an editor and concurrent runtime paths" width="326" height="104" />
</picture>

**A lightweight, native-backed desktop IDE built for Go developers.**

Fast startup, low memory footprint, native terminal execution, integrated `gopls` language intelligence, Delve debugging, and specialized workflows for runtime inspection and concurrency analysis.

[![CI](https://github.com/sung2708/goide/actions/workflows/ci.yml/badge.svg)](https://github.com/sung2708/goide/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Pre-1.0](https://img.shields.io/badge/Status-Pre--1.0%20(Alpha)-orange.svg)](docs/ROADMAP.md)

</div>

---

> [!NOTE]
> **Product Maturity Notice**: GoIDE is currently undergoing a formal pre-1.0 stabilization track (`0.x.y`). While core editing, terminal, and debugging workflows are functional, GoIDE is **not yet declared stable for production use**. See our [Roadmap](docs/ROADMAP.md) and [Versioning Policy](docs/VERSIONING.md) for details.

---

## Why GoIDE?

Many contemporary developer environments consume gigabytes of system memory, take seconds to load, and treat Go as merely one of dozens of generic languages.

GoIDE is built from the ground up specifically for Go:
- **Instantaneous Startup & Lean Footprint**: Powered by **Tauri v2** and **React 19**, GoIDE opens in under a second and maintains minimal memory overhead compared to Electron-based IDEs.
- **Concurrency & Race First**: First-class support for `go run -race`, runtime signal sampling, and channel counterpart jump actions.
- **Native Developer Tooling**: Direct integration with the official Go toolchain, `gopls` language server, and `dlv` (Delve) debugger.
- **Workspace-Owned Terminal**: Persistent PTY shell sessions that remain active and uninterrupted as you browse and edit files.

---

## Key Capabilities

### Implemented & Ready for Testing
- **Go Source Editing**: CodeMirror 6 editor engine with Go syntax highlighting, bracket pairing, smart indentation, and in-file find/replace (`FindWidget`).
- **Language Intelligence**: Auto-completion, hover hints, parameter documentation, and symbol navigation powered by `gopls`.
- **Delve DAP Debugger**: Start debug sessions, set/toggle breakpoints, pause, continue, and step into/over/out with Delve.
- **Race Detector Integration**: Direct `go run -race` execution with findings surfaced inline in the editor and terminal output.
- **Causal Concurrency Inspection**: Visual indicators for channel operations, counterpart pairing, and blocked goroutine signals.
- **Integrated Terminal Workbench**: Persistent PTY shell sessions with dual tab views (Interactive Shell and Process Logs).
- **Workspace Management**: Hierarchical file explorer with auto-sync, workspace-wide text search, and Git branch switching.

### Experimental
- **Deep Trace Mode**: Dynamic runtime signal correlation for active goroutines.

### Planned for 1.0
- Automated code formatting on save (`go fmt` / `goimports`).
- In-editor Go test and benchmark runner with visual test result tree.
- Stack frame switching and interactive variable watches in the debugger.

---

## Prerequisites & Required Tooling

GoIDE integrates directly with tools installed in your local environment. Ensure these commands are available on your system `PATH`:

| Tool | Version | Purpose | Installation |
|:---|:---|:---|:---|
| **Go** | 1.21+ | Compiler and runtime execution | [go.dev/dl](https://go.dev/dl/) |
| **gopls** | Latest | Language intelligence, diagnostics, completion | `go install golang.org/x/tools/gopls@latest` |
| **dlv** | Latest | Delve debugger for runtime sessions | `go install github.com/go-delve/delve/cmd/dlv@latest` |

GoIDE performs an automated toolchain preflight on launch and surfaces missing tools in the status bar.

---

## Supported Platforms

GoIDE is developed and tested for 64-bit desktop environments:

| Operating System | Architecture | Package Format | Status |
|:---|:---|:---|:---:|
| **Windows** | x86_64 | `.exe` (NSIS), `.msi` | :white_check_mark: Supported |
| **macOS** | Apple Silicon (`aarch64`), Intel (`x86_64`) | `.dmg`, `.app` | :white_check_mark: Supported |
| **Linux** | x86_64 | `.AppImage`, `.deb` | :white_check_mark: Supported |

---

## Quick Start (Development)

```bash
# 1. Clone the repository
git clone https://github.com/sung2708/goide.git
cd goide

# 2. Install dependencies
npm ci

# 3. Verify toolchains and version synchronization
npm run version:check

# 4. Run test suites
npm test

# 5. Launch GoIDE in development mode
npm run tauri dev
```

For complete platform build instructions, see [docs/BUILDING.md](docs/BUILDING.md).

---

## Documentation Suite

- **[Product Vision & Goals](docs/PRODUCT.md)**: Product philosophy, target users, and definition of stable 1.0.
- **[System Architecture](docs/ARCHITECTURE.md)**: Detailed breakdown of the Tauri IPC boundary, frontend, and Rust backend.
- **[Engineering Rules](docs/ENGINEERING_RULES.md)**: Architectural invariants, component boundaries, and testing rules.
- **[Development Guide](docs/DEVELOPMENT.md)**: Workflow guidelines, Conventional Commits, and code standards.
- **[Build Guide](docs/BUILDING.md)**: Platform prerequisites, MSVC setup, and release packaging.
- **[Testing Guide](docs/TESTING.md)**: Vitest frontend suites, unit testing conventions, and test commands.
- **[Product Roadmap](docs/ROADMAP.md)**: Pre-stable stabilization phases and exit criteria.
- **[Versioning Policy](docs/VERSIONING.md)**: Semantic versioning rules, tag naming, and version synchronization.
- **[Release Runbook](docs/RELEASE.md)**: Maintainer release checklist, GitHub Actions pipeline, and recovery.
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)**: Solutions for common toolchain, terminal, and build issues.
- **[Security Policy](SECURITY.md)**: Vulnerability disclosure policy and architectural security invariants.
- **[Contributing Guide](CONTRIBUTING.md)**: Contributor onboarding and pull request guidelines.

---

## Contributing

We welcome contributions! Please review [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md) before opening issues or submitting pull requests.

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/):
```bash
feat(editor): add bracket match indicator
fix(debugger): prevent race condition on session stop
```

---

## Security

Please report vulnerabilities privately via [GitHub Private Vulnerability Reporting](https://github.com/sung2708/goide/security/advisories/new) rather than public issues. See [SECURITY.md](SECURITY.md) for full details.

---

## License

GoIDE is released under the [MIT License](LICENSE).

The GoIDE gopher artwork adapts the Go gopher by Renee French, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes include a vector redraw, editor/breakpoint panel, concurrent flow trails, and GoIDE colors. See the [original Go gopher](https://go.dev/blog/gopher) and [brand guide](docs/BRAND.md). GoIDE is an independent project.
