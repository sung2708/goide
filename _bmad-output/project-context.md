---
project_name: 'goide'
user_name: 'sungp'
date: '2026-04-08T11:29:48.5396593+07:00'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'quality_rules', 'workflow_rules', 'anti_patterns']
status: 'complete'
rule_count: 133
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

- Core language: Rust (stable, latest toolchain)
- Desktop shell: Tauri v2
- Frontend: React 18+ with TypeScript
- Frontend build tool: Vite
- Styling: Tailwind CSS (latest stable)
- Go tooling: gopls (latest stable) for LSP/static analysis
- Debug/runtime: Delve (DAP, latest stable)
- Python scripts (if needed): use `uv` for runtime management (no global Python)

**Compatibility constraints**
- Must support Go 1.21+ for tooling integration
- Primary targets: macOS, Linux, and Windows
- All runtime analysis must be local (no external services)
- Prefer stable dependencies; avoid experimental frameworks
- MVP has no plugin system (avoid compatibility complexity)

## Critical Implementation Rules

### Language-Specific Rules

**Rust**
- Edition: Rust 2021 (stable)
- Async runtime: Tokio
- Error handling:
  - Use `anyhow` for application-level errors
  - Use `thiserror` for structured/domain errors
- Module layout:
  - `src/main.rs` (entry)
  - `src/core/` (business logic, concurrency analysis)
  - `src/integration/` (gopls, Delve, OS/process interaction)
  - `src/ui_bridge/` (Tauri commands, IPC layer)
- Process handling:
  - Use async process management for gopls/Delve
  - Avoid blocking calls in UI-critical paths
- Logging: use `tracing` (no `println`)
- Linting: Clippy enabled (warn by default, deny critical issues)
- General:
  - Prefer explicit types over inference in core logic
  - Keep functions small and composable
  - Avoid premature abstractions

**TypeScript**
- Language level: TypeScript latest stable with `"strict": true`
- No `any` unless explicitly justified
- React 18+ functional components only
- State: minimal (local state or lightweight store like Zustand)
- File structure:
  - `/components` (UI)
  - `/features/concurrency` (lens logic + overlays)
  - `/hooks` (custom hooks)
  - `/lib` (shared utilities)
- Imports: prefer absolute, keep flat/readable
- Error handling: fail gracefully in UI; never crash editor
- Styling: Tailwind only (no mixed styling systems)
- Rendering: avoid unnecessary re-renders (memoize when needed)
- General: keep components small and focused; clarity over abstraction; no heavy state in MVP

**Cross-layer boundaries**
- Rust handles process management, runtime signals, gopls/Delve integration
- TypeScript handles rendering, UI interactions, lightweight state
- Use clear, typed IPC contracts; do not leak Rust internals into UI

### Framework-Specific Rules

**Tauri v2**
- Keep the Tauri layer thin; commands expose clear app actions, not raw internals
- Use typed IPC contracts between Rust and frontend
- Minimize command surface area (no broad "execute anything" commands)
- File system access limited to opened workspace only
- No remote content loading in MVP
- No shell execution from frontend; process spawning stays in Rust
- Keep permissions explicit and minimal

**React**
- No router in MVP unless clearly needed
- Prefer layout composition over deep prop chains
- Editor shell stays stable; overlays mount contextually
- Editor-first UI: sidebar, editor, status bar, optional lightweight panel
- Prefer controlled local UI state for overlays/interactions
- Avoid global state unless it supports cross-editor/runtime coordination

**Vite**
- Keep config minimal
- Avoid heavy plugins unless directly required
- Prefer standard Vite + React + TypeScript setup
- No experimental build plugins in MVP
- Optimize for fast local iteration, not complex bundling tricks

**Security / UX principle**
- Reinforce local-first behavior, minimal attack surface, minimal UI complexity, fast MVP iteration
- Use Tauri/React/Vite in the simplest way that supports the Concurrency Lens experience

### Testing Rules

**Rust**
- Use built-in Rust test framework (`cargo test`)
- Focus on concurrency analysis logic (blocking detection, causal inference)
- Test core data structures and transformations
- Prefer unit tests over complex integration tests in MVP
- Avoid heavy mocking frameworks
- Use simple fixtures and deterministic inputs

**TypeScript / React**
- Minimal testing for MVP
- Test only critical UI logic (core hooks, key interaction flows)
- Avoid snapshot-heavy testing
- Prefer simple behavior tests

**Integration**
- Minimal: basic verification that Rust <-> frontend communication works
- No full end-to-end testing required in MVP

**Coverage**
- No strict coverage target
- Prioritize correctness of core concurrency logic over percentage metrics

### Code Quality & Style Rules

**Rust**
- Formatting: `rustfmt` (default config)
- Linting: `clippy`; treat important warnings as errors (e.g., `unwrap`, unused code)
- Naming: `snake_case` for functions/variables; `PascalCase` for types/structs/enums
- File structure: modules small and focused; one responsibility per module
- Error handling: avoid `unwrap`/`expect` in production
- Documentation: comment only non-obvious logic (especially concurrency analysis)

**TypeScript / React**
- Formatting: Prettier (default config)
- Linting: ESLint recommended rules
- Naming: `camelCase` for variables/functions; `PascalCase` for React components
- File structure: components small and focused; co-locate related files where possible
- Typing: no `any` unless explicitly justified
- Documentation: comment only complex logic

**General**
- Prefer clarity over abstraction
- Avoid large files and deeply nested logic
- Keep functions small and composable
- Remove unused code immediately
- Consistency across the codebase > personal preference

### Development Workflow Rules

**Branch naming**
- Prefixes: `feat/`, `fix/`, `chore/`, `refactor/`
- Examples: `feat/concurrency-lens-hover`, `fix/deep-trace-block-detection`

**Commit messages**
- Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`
- Keep messages short and descriptive
- Examples: `feat: add static concurrency hints`, `fix: correct blocking detection threshold`

**Pull requests**
- Keep PRs small and focused
- Include: short description and problem solved
- Prefer incremental PRs over large changes
- No strict template required for MVP

**Release / deployment**
- No formal release process in MVP
- Simple versioning (v0.x)
- Build artifacts manually for testing (Tauri build)
- Prioritize fast iteration over release automation

### Critical Don't-Miss Rules

**Performance / responsiveness**
- Never block the UI thread; heavy work runs in Rust async tasks
- Avoid frequent polling loops for runtime state
- Limit active signals per viewport (respect density guard)
- Avoid unnecessary re-renders in React

**Concurrency Lens integrity**
- Do not show signals without clear confidence (predicted / likely / confirmed)
- Avoid misleading or ambiguous causal links
- Prefer no signal over incorrect signal
- Ensure smooth transitions (no flicker between states)

**Security / safety**
- No arbitrary shell execution from the frontend
- All process spawning (gopls, Delve) controlled in Rust
- Restrict file system access to opened workspace
- No external network calls by default (local-first guarantee)

**Architecture boundaries**
- Do not mix Rust backend logic with frontend rendering concerns
- Do not leak internal Rust state directly into UI
- Maintain clear IPC contracts (typed, minimal)

**Complexity control**
- No plugin system in MVP
- No dashboard-heavy UI or persistent panels
- Avoid features not directly tied to the Concurrency Lens

**Reliability / fallback**
- Always provide graceful fallback: if runtime/trace fails -> revert to static hints
- Never crash the editor due to missing runtime signals

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code
- Follow all rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**
- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-04-08
