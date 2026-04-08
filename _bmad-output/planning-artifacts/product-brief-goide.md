---
title: "Product Brief: goide"
status: "draft"
created: "2026-04-07 16:41:30 +07:00"
updated: "2026-04-08 00:00:00 +07:00"
inputs:
  - {project-root}/_bmad-output/planning-artifacts/research/market-go-ide-developer-tooling-concurrency-debugging-runtime-visualization-research-2026-04-07-160018.md
  - {project-root}/_bmad-output/planning-artifacts/research/domain-developer-tooling-ides-concurrency-debugging-research-2026-04-07-161705.md
  - {project-root}/_bmad-output/planning-artifacts/research/technical-go-runtime-tracing-delve-dap-goroutine-visualization-research-2026-04-07-162617.md
---

# Product Brief: goide (Go-First IDE with Concurrency Lens)

## Executive Summary

goide is a Go‑first, Rust‑native IDE purpose‑built for developers working on highly concurrent backend and microservices systems. Its defining capability is the Concurrency Lens: an Invisible Runtime experience that surfaces goroutine states and blocking relationships directly in the editor, only when the developer asks for it. The result is faster, more confident debugging without switching to external trace viewers or heavy dashboards.

**Why now:** Go's recent tracing and flight recorder improvements make reliable, low-overhead runtime insight practical for in-editor workflows.

This product is positioned as a specialized complement to VS Code and GoLand, not a wholesale replacement. The Go developer community already uses multiple editors; goide earns its place by providing a single, unmatched outcome: understanding and fixing concurrency issues in minutes, not hours.

## Purpose

goide is a developer tool focused on understanding and debugging Go concurrency directly inside the editor using a Concurrency Lens (Invisible Runtime UX).

## Critical Constraints

- Must feel fast, lightweight, and responsive.
- Editor-first workflow where code is always dominant.
- Avoid heavy dashboards and multi-panel complexity.
- Performance takes priority over visual effects.
- Keep UI clutter-free and low-noise.

## The Problem

Go developers routinely struggle to understand runtime concurrency behavior. Execution traces can reveal the truth, but they are external, complex, and time‑consuming. In practice, teams spend hours triangulating blocked goroutines, channel contention, and deadlocks across logs, traces, and mental models. The cost is slow diagnosis, reduced confidence, and longer incident resolution.

## The Solution

goide delivers an in‑editor Concurrency Lens that makes runtime behavior visible only when needed. Developers hover or click to reveal contextual overlays, then activate Deep Trace for scoped, high‑fidelity insight. The UI stays minimal and code‑first by default, preserving flow while enabling fast, precise debugging.

Core experience:
- **Quick Insight**: lightweight static + runtime hints, single‑file first.
- **Deep Trace**: scoped runtime sampling and trace windows for causal chains and temporal replay.
- **Invisible Runtime UX**: overlays appear on intent, not as persistent dashboards.

## UI Structure

- Left sidebar: source tree and optional file search with subtle, low-weight visuals.
- Top: minimal toolbar / command palette trigger only.
- Center: code editor remains primary (70-80% of layout) with inline Concurrency Lens.
- Bottom panel: lightweight logs/debug/trace panel, hidden by default.
- Right panel: optional, collapsible, narrow summary panel for quick health states.
- Status bar: mode and runtime state indicators with low visual noise.

## Component Hierarchy

- AppShell
- TopBar
- MainSplit
- LeftSidebar (SourceTree, OptionalSearch)
- EditorRegion (CodeEditor + ConcurrencyLensLayer)
- ConcurrencyLensLayer (HintUnderline, BlockPulse, CausalThreads, TraceBubble)
- RightSummaryPanel optional (GoroutineCount, BlockingSummary, HealthStatus)
- BottomPanel optional
- StatusBar

## Visual System

- Aesthetic: dark, high-contrast Catppuccin-inspired UI (Mocha palette preferred).
- Tone: soft contrast and calm colors, never aggressive neon.
- Typography: JetBrains Mono (or similar) for code, paired with a refined UI sans font (not Inter/Roboto defaults).
- Motion: minimal and meaningful only (pulse for blocking, fade for overlays), no decorative animations.
- Signal design: runtime highlights are lightweight and should never overwhelm source readability.

## Concurrency Lens Behavior

- Dotted underline for static hint.
- Soft pulse for blocked operations.
- Thin thread-like lines for causal flow.
- Small trace bubbles for wait time and confidence (Predicted, Likely, Confirmed).
- Signals appear only on hover, click, or trace activation.

## Dashboard Boundaries

- Not a full dashboard and not a separate workflow.
- Collapsible, narrow, text-forward, no charts.
- Supports click-to-jump from summary item to code location.

## What Makes This Different

- **Concurrency as a first‑class UX**: runtime states map directly to code, not external views.
- **Invisible Runtime design**: minimal by default; only contextual signals appear.
- **Single‑file reliability first**: ensures trust before expanding to multi‑file views.
- **Complementary positioning:** designed to coexist with incumbent editors rather than replace them. **Low switching friction:** keep existing setups, add goide only when concurrency debugging is needed.

## Who This Serves

**Primary**: Backend and microservices Go developers working with concurrent systems (goroutines, channels, worker pools).

**Secondary**: General Go developers who occasionally hit concurrency problems but want fast, reliable guidance without tooling overhead.

## Success Criteria (First 3–6 Months)

- **Time‑to‑debug**: measurable reduction in time to isolate and fix concurrency issues.
- **Activation**: users successfully use Concurrency Lens in their first session.
- **Retention**: repeated use of Deep Trace on real debugging tasks.

## Scope

**In scope (MVP):**
- Quick Insight overlays (static + lightweight runtime hints).
- Deep Trace (scoped to flow → function → test), single‑file reliability first.
- In‑editor, on‑demand signals only (no external dashboards).

**Out of scope (non‑goals):**
- AI pair programming or code generation.
- Full observability platform or distributed tracing system.
- Heavy dashboards or external views.
- Cloud IDE features.

## Vision (2–3 Years)

goide becomes the default “concurrency diagnostic” IDE in the Go ecosystem: a fast, trustworthy, and minimally intrusive environment where developers can understand and fix runtime coordination issues in seconds. Over time, it expands from single‑file clarity to broader system‑wide visibility while retaining its Invisible Runtime ethos.

