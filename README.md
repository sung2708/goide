# Goro

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand/logo-dark.svg" />
  <img src="public/brand/logo-light.svg" alt="Goro — Go gopher with an editor and concurrent runtime paths" width="278" height="104" />
</picture>

**Understand Go in motion.**

A Go IDE for coding, debugging, and understanding concurrent programs.

Go source editing, native terminal execution, `gopls`, Delve, and runtime/concurrency inspection in one desktop workbench.

[Releases](https://github.com/sung2708/goide/releases) · [Quick start](#quick-start-development) · [Product vision](docs/PRODUCT.md) · [Roadmap](docs/ROADMAP.md)

[![CI](https://github.com/sung2708/goide/actions/workflows/ci.yml/badge.svg)](https://github.com/sung2708/goide/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Pre-1.0](https://img.shields.io/badge/Status-Pre--1.0%20(Alpha)-orange.svg)](docs/ROADMAP.md)

</div>

**Goro** takes its name from *goroutine*. It is a Go IDE built to help you write Go and understand it while it runs: follow execution, inspect goroutines, and investigate race reports without losing the source context. The product is called **Goro**; this repository remains **[`sung2708/goide`](https://github.com/sung2708/goide)**.

---

> [!NOTE]
> **Product Maturity Notice**: Goro is currently undergoing a formal pre-1.0 stabilization track (`0.x.y`). While core editing, terminal, and debugging workflows are functional, Goro is **not yet declared stable for production use**. See our [Roadmap](docs/ROADMAP.md) and [Versioning Policy](docs/VERSIONING.md) for details.

---

## Why Goro?

Go source tells you what a program can do. Understanding a concurrent program also means investigating what happens when it runs: which goroutine is blocked, where a channel operation connects, and which accesses appear in a race report.

Goro brings those questions into the workbench:

- **Write Go with context**: CodeMirror editing and `gopls` language intelligence, backed by your local Go toolchain.
- **Follow execution**: Native terminal sessions and Delve debugging alongside the source.
- **Investigate concurrency**: `go run -race` findings, sampled runtime signals, and channel counterpart navigation.
- **Keep the workbench focused**: Tauri v2 and React 19 provide a native-backed desktop environment dedicated to Go.

Runtime inspection combines observations and heuristic analysis; it is not a complete execution trace or proof of causality. See [Product Vision & Goals](docs/PRODUCT.md) for the evidence model and [Key Capabilities](#key-capabilities) for implemented, experimental, and planned work.

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

### Implemented with acceptance still pending
- Reviewed gopls Format Document, Organize Imports and optional save actions, plus validated cross-file symbol rename and edit-based Quick Fixes.
- Structured package/workspace/single-test execution, semantic entry actions and Debug Test.
- Actual Delve stack/goroutine/frame selection and lazy variable inspection.
- Source Control staging, staged commits, remote actions, stash and commit/file history.

### Remaining before a dependable release
- Complete native data-preservation/process-ownership acceptance, real-tool compatibility tests and clean installation/upgrade validation.
- Source-jump Back/Forward, semantic symbol pickers and remaining search/Problems ergonomics.
- Save As/draft recovery, configured shell selection and measured desktop performance. Advanced watches, benchmarks and coverage can follow the focused core.

See [Release Readiness](docs/RELEASE_READINESS.md) for the audited scope and blockers.

---

## Prerequisites & Required Tooling

Goro integrates directly with tools installed in your local environment. Ensure these commands are available on your system `PATH`:

| Tool | Version | Purpose | Installation |
|:---|:---|:---|:---|
| **Go** | Tested release matrix pending | Compiler and runtime execution | [go.dev/dl](https://go.dev/dl/) |
| **gopls** | Compatible tested Go/tool pair | Language intelligence, diagnostics, completion | `go install golang.org/x/tools/gopls@latest` |
| **dlv** | Compatible tested Go/tool pair | Delve debugger for runtime sessions | `go install github.com/go-delve/delve/cmd/dlv@latest` |

Goro performs toolchain inspection and surfaces missing tools in the status bar. Version detection does not certify compatibility. Installation commands above select current tools; release support must use the tested Go/gopls/Delve matrix described in [Release Readiness](docs/RELEASE_READINESS.md).

---

## Release Build Targets

The release workflow targets these 64-bit environments. Source CI and installer acceptance are separate; clean installation/upgrade validation is still pending:

| Operating System | Architecture | Package Format | Status |
|:---|:---|:---|:---:|
| **Windows** | x86_64 | `.exe` (NSIS), `.msi` | Installer acceptance pending |
| **macOS** | Apple Silicon (`aarch64`), Intel (`x86_64`) | `.dmg`, `.app` | Installer acceptance pending |
| **Linux** | x86_64 | `.AppImage`, `.deb` | Installer acceptance pending |

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

# 5. Launch Goro in development mode
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
- **[Brand & Artwork](docs/BRAND.md)**: Goro logo, gopher, color palette, app icons, and attribution.
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

Goro is released under the [MIT License](LICENSE).

The Goro gopher artwork adapts the Go gopher by Renee French, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes include a vector redraw, editor/breakpoint panel, concurrent flow trails, and Goro colors. See the [original Go gopher](https://go.dev/blog/gopher) and [brand guide](docs/BRAND.md). Goro is an independent project.
