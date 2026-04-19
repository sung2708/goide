---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
inputDocuments:
  - C:\Users\t15\Training\goide\_bmad-output\planning-artifacts\prd.md
  - C:\Users\t15\Training\goide\_bmad-output\planning-artifacts\product-brief-goide.md
  - C:\Users\t15\Training\goide\_bmad-output\planning-artifacts\ux-design-specification.md
  - C:\Users\t15\Training\goide\_bmad-output\planning-artifacts\research\domain-developer-tooling-ides-concurrency-debugging-research-2026-04-07-161705.md
  - C:\Users\t15\Training\goide\_bmad-output\planning-artifacts\research\market-go-ide-developer-tooling-concurrency-debugging-runtime-visualization-research-2026-04-07-160018.md
  - C:\Users\t15\Training\goide\_bmad-output\planning-artifacts\research\technical-go-runtime-tracing-delve-dap-goroutine-visualization-research-2026-04-07-162617.md
  - C:\Users\t15\Training\goide\_bmad-output\project-context.md
workflowType: 'architecture'
project_name: 'goide'
user_name: 'sungp'
date: '2026-04-08T14:23:47.5610506+07:00'
status: 'complete'
completedAt: '2026-04-08T14:39:39.5924851+07:00'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Current Parser Architecture

The current implementation does not include Tree-sitter. Go source handling is split across:

- CodeMirror Lezer in the frontend for editor syntax highlighting.
- A lightweight Rust tokenizer for static concurrency markers.
- `gopls` for symbol enrichment, diagnostics, and completion data.
- Delve (`dlv`) for runtime Deep Trace sampling.

If Tree-sitter becomes required for deploy, integrate `tree-sitter` and `tree-sitter-go` in the Rust backend and use it to replace or augment the tokenizer path before marking that requirement complete.

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
- FR1–FR8 define an editor‑first IDE with inline Concurrency Lens overlays:
  - Hover → inline hints with confidence labels
  - Click/Cmd‑click jump to counterpart within the same file
  - Deep Trace activation scoped to flow/function
  - Runtime sampling via Delve (DAP) + static analysis via gopls
  - Optional lightweight panels (right summary, bottom) collapsed by default
- Single‑file reliability is the MVP priority; multi‑file and replay are Phase 2+

**Non‑Functional Requirements:**
- Performance: UI interactions <16ms; startup <1.5s; memory <300MB
- Reliability: fallback to static hints when runtime fails; no UI breakage
- Trust: prefer no signal over wrong signal; confidence levels required
- Security/Privacy: local‑only execution; opt‑in telemetry; no remote services
- UX: minimal overlays, no dashboards, editor dominant (70–80% width)

**Scale & Complexity:**
- Primary domain: desktop IDE (Tauri) with runtime analysis + visualization
- Complexity level: medium (multi‑protocol integration + real‑time overlays)
- Estimated architectural components: 5–7 core subsystems

### Technical Constraints & Dependencies

- Runtime integration: Delve DAP (live), runtime/trace (deep capture)
- Static analysis: gopls (LSP)
- UI stack: Tauri v2 + React + TypeScript + Tailwind
- Cross‑platform: macOS, Linux, Windows
- Local‑only data handling; no external network calls in MVP

### Cross-Cutting Concerns Identified

- UI responsiveness and non-blocking runtime sampling
- Signal confidence + fallback strategy (trust preservation)
- Data volume control (density guard, scoped tracing)
- Cross-platform process management and permissions
- Accessibility (WCAG AA, reduced motion, keyboard parity)

## Starter Template Evaluation

### Primary Technology Domain

Desktop (Tauri v2) based on project requirements and UX constraints.

### Starter Options Considered

**Option A: Official create-tauri-app (recommended)**
- Official Tauri-maintained project creator with framework templates, including React.
- Provides current CLI commands for cross-platform scaffolding.

**Option B: Community starters**
- Available but not aligned with “prefer official defaults” and “minimal dependencies” constraints.
- Deprioritized for MVP to reduce drift from official guidance.

### Selected Starter: create-tauri-app (React + TypeScript template)

**Rationale for Selection:**
- Matches explicit preference for official Tauri v2 starter with React + TypeScript.
- Minimizes custom scaffolding while staying aligned with cross-platform desktop requirements.

**Initialization Command (Windows PowerShell):**

```powershell
irm https://create.tauri.app/ps | iex
```

Choose the React + TypeScript template when prompted.

**Alternative (npm):**

```bash
npm create tauri-app@latest
```

Then select the React + TypeScript template interactively.

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
- React framework template with TypeScript option.

**Build Tooling:**
- Build tooling is determined by the chosen template during scaffolding (verify at init; we will keep Vite per project context).

**Code Organization:**
- Standard Tauri project scaffold (frontend + Rust core) as provided by official starter.

**Development Experience:**
- Official, maintained scaffold with Tauri’s recommended defaults for project creation.

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- No database in MVP; in-memory signal model + minimal local settings file
- Tauri IPC only; typed request/response contracts; no external API
- Frontend overlay architecture with minimal shared store (Zustand allowed)
- Manual Tauri builds for MVP (no CI/CD)

**Important Decisions (Shape Architecture):**
- Local-only permissions; no auth or encryption in MVP
- Rust-only process spawning; no frontend shell execution
- Manual type mirroring between Rust and TypeScript (no codegen)

**Deferred Decisions (Post-MVP):**
- Embedded DB / structured persistence
- Auth / encryption
- CI/CD and auto-updates
- Telemetry / monitoring

### Data Architecture

- **Storage:** No database in MVP.
- **Source of truth:** opened workspace files + runtime signals.
- **Persistence:** minimal local settings file only (app preferences).
- **Cache:** in-memory, bounded; reset on app restart.

### Authentication & Security

- **Authentication:** none (single-user desktop app).
- **Authorization:** not applicable.
- **Encryption:** none in MVP.
- **Security boundaries:**
  - Tauri permissions minimal and explicit
  - File access restricted to opened workspace
  - No network access by default
  - Process spawning only in Rust layer

### API & Communication Patterns

- **IPC:** Tauri commands only.
- **Contracts:** typed request/response models; manual type mirroring (Rust ↔ TS).
- **Errors:** minimal, structured error shapes; no raw Rust error leakage.
- **External API:** none in MVP.

### Frontend Architecture

- **State:** local state by default; Zustand only for cross-editor/runtime coordination.
- **Routing:** none in MVP.
- **Components:** small, focused; overlays mounted contextually.
- **Overlay rendering:** minimal DOM; memoization to avoid re-render churn.
- **Styling:** Tailwind-only, design tokens first.

### Infrastructure & Deployment

- **Builds:** manual Tauri build per platform.
- **CI/CD:** none in MVP.
- **Env config:** minimal `.env`/Tauri config flags only.
- **Logging:** Rust `tracing`, surfaced to UI if needed.
- **Monitoring/updates:** none in MVP.

### Decision Impact Analysis

**Implementation Sequence:**
1. Establish Tauri IPC contracts and data model
2. Implement Rust process management (gopls/Delve)
3. Build frontend overlay layer and signal rendering
4. Add minimal settings persistence
5. Manual packaging/testing per platform

**Cross-Component Dependencies:**
- IPC contracts must precede UI overlay integration
- Runtime sampling depends on stable process management
- Overlay performance depends on signal density guard + memoization

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 7 areas where AI agents could make different choices

### Naming Patterns

**Database Naming Conventions:**
- N/A for MVP (no DB). If introduced later: snake_case tables/columns.

**API Naming Conventions:**
- Tauri commands: `verb_noun` snake_case on Rust side (e.g., `get_signals`)
- Frontend invoke names: `camelCase` wrappers (e.g., `getSignals()`)

**Code Naming Conventions:**
- Rust: snake_case funcs/vars, PascalCase types (per rules)
- TypeScript: camelCase funcs/vars, PascalCase components
- Files: `kebab-case` for folders, `PascalCase.tsx` for React components, `snake_case.rs` for Rust modules

### Structure Patterns

**Project Organization:**
- Rust:
  - `src/core/` for analysis logic
  - `src/integration/` for gopls/Delve/process
  - `src/ui_bridge/` for Tauri IPC
- Frontend:
  - `src/components/`, `src/features/concurrency/`, `src/hooks/`, `src/lib/`

**File Structure Patterns:**
- Co-locate UI subcomponents near parent component file
- Feature logic in `features/concurrency` only; no scattered overlays

### Format Patterns

**IPC Response Formats:**
- Success: `{ ok: true, data: T }`
- Error: `{ ok: false, error: { code: string, message: string } }`
- Never return raw Rust error strings to UI

**Data Exchange Formats:**
- JSON field naming: `camelCase` in TS, `snake_case` only inside Rust
- Confidence levels: enum string literals `predicted | likely | confirmed`

### Communication Patterns

**Event System Patterns:**
- No global event bus in MVP
- Use local callback props or minimal Zustand store for runtime state

**State Management Patterns:**
- Local state by default
- Zustand store only for:
  - runtime status
  - active signals by file
  - active hover/selection state

### Process Patterns

**Error Handling Patterns:**
- Rust: `anyhow` at boundaries, `thiserror` for domain errors
- UI: soft-fail with fallback; never crash editor

**Loading State Patterns:**
- Prefer “resolving” micro-state with subtle UI (no spinners)
- If resolution >100ms, show minimal inline placeholder

### Enforcement Guidelines

**All AI Agents MUST:**
- Keep IPC contracts typed and minimal
- Respect module boundaries (`core`, `integration`, `ui_bridge`)
- Avoid new global state unless justified by cross-editor coordination

**Pattern Enforcement:**
- Review new files for naming + placement
- IPC types must be documented in one shared TS type file
- Update `project-context.md` if a new pattern is adopted

### Pattern Examples

**Good Examples:**
- `src/ui_bridge/commands.rs` defines `get_signals`
- `src/features/concurrency/SignalOverlay.tsx` consumes typed IPC response
- `src/lib/ipc/types.ts` mirrors Rust structs

**Anti-Patterns:**
- UI directly spawning processes
- Mixed naming in IPC payloads
- Adding global state for single-component behavior

## Project Structure & Boundaries

### Complete Project Directory Structure
```
goide/
├── README.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── .env.example
├── .gitignore
├── src/
│   ├── main.tsx
│   ├── app.tsx
│   ├── styles/
│   │   └── global.css
│   ├── components/
│   │   ├── editor/
│   │   │   ├── EditorShell.tsx
│   │   │   ├── GutterLayer.tsx
│   │   │   └── EditorTabs.tsx
│   │   ├── sidebar/
│   │   │   └── SourceTree.tsx
│   │   ├── statusbar/
│   │   │   └── StatusBar.tsx
│   │   ├── overlays/
│   │   │   ├── SignalOverlay.tsx
│   │   │   ├── TraceBubble.tsx
│   │   │   └── InlineActions.tsx
│   │   └── panels/
│   │       └── SummaryPeek.tsx
│   ├── features/
│   │   └── concurrency/
│   │       ├── lensTypes.ts
│   │       ├── lensStore.ts
│   │       ├── signalModel.ts
│   │       ├── signalDensity.ts
│   │       └── useLensSignals.ts
│   ├── hooks/
│   │   ├── useHoverHint.ts
│   │   └── useKeyboardReveal.ts
│   └── lib/
│       └── ipc/
│           ├── types.ts
│           └── client.ts
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs
│       ├── core/
│       │   ├── mod.rs
│       │   ├── analysis/
│       │   │   ├── mod.rs
│       │   │   ├── blocking.rs
│       │   │   └── confidence.rs
│       │   └── model/
│       │       ├── mod.rs
│       │       └── signal.rs
│       ├── integration/
│       │   ├── mod.rs
│       │   ├── gopls.rs
│       │   ├── delve.rs
│       │   └── process.rs
│       └── ui_bridge/
│           ├── mod.rs
│           ├── commands.rs
│           └── types.rs
└── docs/
    └── architecture.md
```

### Architectural Boundaries

**API Boundaries:**
- Only Tauri command surface in `src-tauri/src/ui_bridge/commands.rs`
- No frontend shell execution or network access

**Component Boundaries:**
- Editor shell + overlays in `src/components`
- Concurrency signal logic in `src/features/concurrency`
- IPC layer isolated in `src/lib/ipc`

**Service Boundaries:**
- Process management in `src-tauri/src/integration`
- Concurrency analysis in `src-tauri/src/core`

**Data Boundaries:**
- Rust core models are source of truth
- Frontend maintains view-models only
- No persistent DB

### Requirements to Structure Mapping

**Core Concurrency Lens:**
- Rust analysis: `src-tauri/src/core/analysis`
- Signal model: `src-tauri/src/core/model`
- UI overlays: `src/components/overlays`
- Signal store: `src/features/concurrency/lensStore.ts`

**Runtime Integration:**
- gopls: `src-tauri/src/integration/gopls.rs`
- Delve: `src-tauri/src/integration/delve.rs`

**Editor Shell:**
- Shell layout: `src/components/editor/EditorShell.tsx`
- Sidebar: `src/components/sidebar/SourceTree.tsx`
- Status bar: `src/components/statusbar/StatusBar.tsx`

### Integration Points

**Internal Communication:**
- Rust ↔ TS via IPC types in `src-tauri/src/ui_bridge/types.rs` and `src/lib/ipc/types.ts`

**External Integrations:**
- None (local-only)

**Data Flow:**
- gopls/Delve → Rust core model → IPC → TS store → overlays

### File Organization Patterns

**Configuration Files:**
- Frontend build config at repo root
- Tauri config in `src-tauri/tauri.conf.json`

**Source Organization:**
- Frontend in `/src`, backend in `/src-tauri`
- Feature isolation in `/features/concurrency`

**Test Organization:**
- Rust unit tests co-located in modules
- Frontend tests minimal and co-located (if needed)

**Asset Organization:**
- All UI styles in `src/styles/`

### Development Workflow Integration

**Development Server Structure:**
- Vite dev server for UI + Tauri dev command
- IPC available via Tauri dev runtime

**Build Process Structure:**
- `vite build` for UI
- `tauri build` for desktop artifacts

**Deployment Structure:**
- Manual Tauri builds per platform

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
- All choices align: Tauri v2 + React 18 + Vite + Tailwind, Rust 2021 + Tokio, local-only constraints.
- No conflicts between IPC patterns, process boundaries, and UI architecture.

**Pattern Consistency:**
- Naming, structure, and IPC conventions match the chosen stack.
- No router in MVP is reflected in structure and patterns.

**Structure Alignment:**
- Project structure supports all decisions and keeps Rust/TS boundaries clean.
- IPC boundary is explicit and isolated.

### Requirements Coverage Validation ✅

**Epic/Feature Coverage:**
- Core Concurrency Lens hover/click/jump flow is fully covered by overlays + signal model + IPC + runtime integrations.

**Functional Requirements Coverage:**
- Runtime + static hints supported by `core/analysis` + `integration` + overlay rendering.
- Optional summary panel supported via `components/panels`.

**Non-Functional Requirements Coverage:**
- Performance addressed via non-blocking Rust tasks + memoized overlays.
- Trust/fallback covered by static hints + explicit confidence levels.
- Security covered by local-only constraints and minimal permissions.

### Implementation Readiness Validation ✅

**Decision Completeness:**
- Critical choices recorded (no DB, no auth, manual builds, IPC contracts).
- Patterns documented with clear conventions.

**Structure Completeness:**
- Complete project tree provided with clear boundaries.
- Integration points mapped.

**Pattern Completeness:**
- Naming, IPC, error handling, and state patterns are explicit.

### Gap Analysis Results

**Critical Gaps:** None identified.

**Important Gaps:**
- None blocking. Possible later refinement: schema/codegen for IPC if complexity grows.

**Nice-to-Have Gaps:**
- Add a brief IPC type mapping guide in docs once implementation starts.
- Optional lint rules to enforce naming conventions.

### Validation Issues Addressed

- None required; architecture is coherent and ready.

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**

- [x] Critical decisions documented
- [x] Technology stack specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**✅ Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Clear boundaries between Rust core, integrations, and UI
- Local-first, minimal surface area aligned with MVP scope
- Consistent patterns to prevent agent conflicts

**Areas for Future Enhancement:**
- Optional IPC codegen if model grows
- Optional automated build/packaging later

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently
- Respect project structure and boundaries
- Refer to this document for architectural questions

**First Implementation Priority:**
- Initialize project via `create-tauri-app` and establish IPC type contracts

