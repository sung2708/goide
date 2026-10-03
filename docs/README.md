# Goro Documentation Directory

Welcome to the Goro engineering and product documentation. This directory provides comprehensive guides for users, contributors, and maintainers.

---

## Documentation Map

### 1. Product & Strategy
- [PRODUCT.md](PRODUCT.md): Product vision, target users, problem statement, Go workflows, core differentiators, non-goals, and definition of stable 1.0.
- [ROADMAP.md](ROADMAP.md): Detailed phase-by-phase roadmap toward production 1.0 (Foundation, Alpha, Beta, RC, Stable 1.0) with explicit exit criteria.

### 2. Architecture & Design
- [ARCHITECTURE.md](ARCHITECTURE.md): Comprehensive system architecture, Tauri IPC boundaries, Rust backend modules, editor architecture, terminal docking, gopls/delve integrations, Mermaid diagrams, and technical debt documentation.
- [ENGINEERING_RULES.md](ENGINEERING_RULES.md): Durable engineering principles and invariants governing component boundaries, state ownership, typed IPC contracts, and async lifecycle cleanup.

### 3. Development & Contribution
- [DEVELOPMENT.md](DEVELOPMENT.md): Contributor development environment, branching workflow, Conventional Commit standards, and verification expectations.
- [BUILDING.md](BUILDING.md): Detailed build instructions and prerequisites across Windows, macOS, and Linux, including MSVC toolchain configuration.
- [TESTING.md](TESTING.md): Testing strategies, Vitest suites, Rust tests, and testing conventions.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md): Solutions for common issues regarding gopls, Delve, terminal PTY, and MSVC toolchains.

### 4. Release Engineering & Operations
- [UPDATES.md](UPDATES.md): Official updater, signing, public distribution, website contracts and first-release setup.
- [VERSIONING.md](VERSIONING.md): Semantic Versioning policy, pre-1.0 guidelines, version synchronization mechanism, tag naming, and migration of historical prototype tags.
- [RELEASE_READINESS.md](RELEASE_READINESS.md): Current evidence-based decision, focused Go IDE scope, blockers and native acceptance protocol.
- [RELEASE.md](RELEASE.md): Step-by-step maintainer release runbook, tag-driven CI/CD release workflow, verification checklists, artifact naming, and rollback procedures.
- [SECURITY.md](../SECURITY.md): Vulnerability reporting policy, SLA, and architectural security boundaries.

---

## Documentation Principles

Every document in this repository must satisfy one standard:
> **"Will a developer, contributor, maintainer, security researcher, or user need this?"**

We maintain documentation integrity:
- Documentation reflects the **actual implementation** in code. Non-existent functionality is never claimed as implemented.
- We clearly distinguish between **Implemented**, **Experimental**, and **Planned** capabilities.
- Ephemeral AI agent scratchpads, raw prompt histories, and intermediate planning documents are strictly excluded from git tracking.

## Brand identity

The product is **Goro**; repository paths and GitHub URLs remain **goide**. See [Brand & Artwork](BRAND.md) for logos, app icons, color tokens, licensing, and icon export.

- [Navigation and Search](NAVIGATION_SEARCH.md): input, matching/replacement contracts, worker ownership, budgets and acceptance gates.
