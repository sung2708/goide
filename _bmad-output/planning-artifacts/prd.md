---
stepsCompleted: [step-01-init, step-02-discovery, step-02b-vision, step-02c-executive-summary, step-03-success, step-04-journeys, step-05-domain, step-06-innovation, step-07-project-type, step-08-scoping, step-09-functional, step-10-nonfunctional, step-11-polish]
inputDocuments:
  - {project-root}/_bmad-output/planning-artifacts/product-brief-goide.md
  - {project-root}/_bmad-output/brainstorming/brainstorming-session-2026-04-07-143837.md
  - {project-root}/_bmad-output/planning-artifacts/research/technical-go-runtime-tracing-delve-dap-goroutine-visualization-research-2026-04-07-162617.md
  - {project-root}/_bmad-output/planning-artifacts/research/market-go-ide-developer-tooling-concurrency-debugging-runtime-visualization-research-2026-04-07-160018.md
  - {project-root}/_bmad-output/planning-artifacts/research/domain-developer-tooling-ides-concurrency-debugging-research-2026-04-07-161705.md
workflowType: 'prd'
briefCount: 1
researchCount: 3
brainstormingCount: 1
projectDocsCount: 0
classification:
  projectType: developer_tool
  domain: developer_tooling
  complexity: medium
  projectContext: greenfield
---
# Product Requirements Document - goide

**Author:** sungp
**Date:** 2026-04-07

## Executive Summary

goide is a Go-first IDE that surfaces concurrency behavior directly inside the editor. It allows developers to understand and fix goroutine and channel issues in seconds, eliminating the need to piece together logs or external traces. Our target users are backend and microservices Go developers building concurrent systems. The vision is to reveal runtime relationships seamlessly via an "Invisible Runtime UX"—contextual overlays that appear on demand (hover, click, jump, trace) to visually map execution flows.

## Purpose

goide is a developer tool focused on understanding and debugging Go concurrency directly inside the editor using a Concurrency Lens (Invisible Runtime UX).

## Experience Constraints (Critical)

- Must feel fast, lightweight, and responsive.
- Editor-first experience where code remains the dominant surface.
- Avoid heavy dashboards and multi-panel complexity.
- Prioritize performance over visual effects.
- No clutter and no unnecessary UI.

## Project Classification

- **Project Type:** Developer tool
- **Domain:** Developer tooling
- **Complexity:** Medium
- **Project Context:** Greenfield

## Success Criteria

### User Success
- **Time-to-Resolution:** Median time to isolate and understand a single-file concurrency issue strictly under 5 minutes.
- **Activation:** 70% of first-session users successfully invoke Concurrency Lens (hover -> see -> jump).
- **"Aha" Moment:** Within a 30-second deadlock break demo, a developer visualizes a blocked operation, follows its causal chain, and comprehends the failure without external tools.

### Business Success
- **Growth:** Reach 500-1,000 GitHub stars and land early adopters within 3 months; 2,000-3,000 stars within 6 months.
- **Retention:** 40-50% of active users employ Deep Trace multiple times weekly during debugging sessions.
- **Market Fit:** Users proactively select goide over VS Code/GoLand specifically for concurrency debugging tasks.

### Technical Success
- **Performance:** App startup under 1.5 seconds, base memory footprint under 300MB, and UI interaction latency under 16ms.
- **Reliability:** Correctly detect >=80% of blocked operations in single-file contexts.
- **Resilience:** Gracefully fall back to predicted static hints without UI breakage when runtime/trace signals fail.

## Product Scope

### MVP (Phase 1)
- **Core Loop:** Open a Go file, activate Concurrency Lens, and resolve a blocking issue rapidly.
- **Key Features:** Quick Insight + Deep Trace (flow/function scope) reliable for single files. Fail-safe fallback to static hints. Minimal fade transitions and density guards to cap visible signals.

### Growth Features (Phase 2)
- Multi-file causal trace chains.
- Robust runtime and trace integration accuracy.
- Reliable deadlock and contention risk detection.
- Native Docker/K8s integration for remote troubleshooting over local environments.

### Expansion Vision (Phase 3)
- Real-time temporal replay + risk layer (scrub/freeze trace ribbon).
- Contextual visibility scaling to cross-service distributed concurrency.

### Out of Scope (Current Planning Horizon)
- AI pair programming and code generation features.
- Full observability platform capabilities (service-wide tracing, metrics storage, alerting stack).
- Heavy dashboard workflows and chart-centric analysis surfaces.
- Cloud IDE functionality and remote multi-tenant execution.

## UX Direction

### Aesthetic Direction
- Dark, high-contrast, Catppuccin-inspired developer UI (Mocha palette preferred).
- Soft contrast and calm color balance; avoid aggressive neon styling.
- Clean, modern, developer-focused visual language.

### Core UX Principle
"Simple by default, rich on intent"

- No persistent overlays.
- No always-on visualization.
- Runtime signals appear only on hover, click, or trace activation.

## Output Definition

### 1) UI Structure

- **Left Sidebar:** Source tree with minimal visual weight and optional file search.
- **Top Bar:** Minimal toolbar with command-palette trigger; avoid heavy menu bars.
- **Center (Primary, 70-80% width):** Code editor with inline Concurrency Lens overlays.
- **Bottom Panel (Optional):** Lightweight logs/debug/trace panel; hidden by default.
- **Right Panel (Optional, Collapsible):** Lightweight summary dashboard visible only when toggled.
- **Status Bar:** Low-noise indicators for mode (Quick Insight / Deep Trace) and runtime availability.

### 2) Component Hierarchy

- **Shell Layout**
  - **TopBar**
  - **MainRegion**
    - **LeftSidebar**
      - SourceTree
      - OptionalSearch
    - **EditorRegion**
      - CodeEditor
      - ConcurrencyLensLayer
        - HintUnderline (dotted)
        - BlockPulse (soft)
        - CausalThreads (thin flow lines)
        - TraceBubble (wait time + confidence)
    - **RightSummaryPanel (optional/collapsible)**
      - ActiveGoroutinesCount
      - BlockingSummary
      - RuntimeHealthStatus (healthy / blocked / contention)
  - **BottomPanel (optional/hidden by default)**
  - **StatusBar**

### 3) Visual System

- **Typography**
  - Primary code font: JetBrains Mono (or equivalent high-legibility mono).
  - UI font: refined sans-serif that supports long sessions (avoid Inter/Roboto defaults).
- **Color**
  - Catppuccin Mocha base tones for surfaces.
  - Accent colors reserved for runtime signals (blocked, flow, confidence states).
  - Bright colors used sparingly to preserve focus and readability.
- **Motion**
  - Minimal and purposeful only: soft pulse for blocking, fade for overlays.
  - No decorative animations.

## Concurrency Lens UI Rules (Critical)

- Dotted underline indicates static hint.
- Soft pulse indicates blocked operation.
- Thin thread-like lines communicate causal flow.
- Small trace bubbles show wait time and confidence (Predicted / Likely / Confirmed).
- Lens visuals must feel native to the code surface.
- Visual cues must remain lightweight and never overwhelm code readability.

## Dashboard Rules (Lightweight Only)

- Not a full dashboard and not a separate workflow.
- Collapsible and narrow by default.
- Text-first summaries with minimal visual indicators.
- No charts and no graph-heavy layouts.
- Supports quick navigation from panel item to code location.

## User Journeys

**1. The Happy Path: Debugging a Hang**
A backend Go developer encounters a hanging worker. Unable to see the blocked goroutine, they open the file in goide and hover over a channel operation, revealing an inline Quick Insight hint. They activate Deep Trace. The blocked send pulses visually, and the causal chain points immediately to the corresponding receiver. The developer spots the missing consumer, fixes the code, and resolves the issue in minutes.

**2. The Edge Case: Signal Degradation**
A developer encounters an issue, but runtime trace sampling fails due to environmental constraints. The system automatically shifts to fallback mode, displaying static hints with "Predicted" confidence levels. The interactive flow (hover -> jump -> inspect) persists securely without breaking the editor's visual flow, keeping the developer contextually grounded.

**3. The Code Review Validation**
A tech lead reviews a newly submitted fix for a concurrency bug. Instead of scanning logs mentally, they pull the code into goide, engage Concurrency Lens, visualize the causal link seamlessly, and confidently approve the pull request.

**4. The Incident Responder Workaround**
An incident responder reproduces a production fault locally. With minimal installation overhead and strictly local execution (Delve), they leverage Concurrency Lens to spot a localized blocking event, confirming a rapid patch without complex remote configuration.

## Domain-Specific Requirements

**Compliance & Privacy:**
- All analysis runs locally; source code and trace data remain on-device.
- Telemetry must be strictly opt-in.
- Open-source license compatibility (MIT/Apache preferred).

**Technical Constraints:**
- Local execution restricted to the active workspace.
- Deep Trace must be best-effort, non-blocking, and introduce negligible CPU overhead to the active debug session.
- System integrates with `gopls` for static analysis and Delve (DAP) for runtime sampling. Initially targets macOS and Linux.

## Innovation & Competitive Differentiation

- **Invisible Runtime UX:** Concurrency relationships are contextual overlays injected directly into the source code, eliminating the need for disjointed external trace dashboards.
- **Confidence-Aware Encoding:** Insights clearly label their accuracy level ("Confirmed", "Likely", "Predicted") so developers can calibrate trust intuitively.
- **Density Guard:** UI prevents cognitive overload by capping visible signals per viewport.

## Functional Requirements

### FR1: Editor & Context Navigation
- The system shall open a Go workspace and render Go source files with syntax highlighting.
- The system shall limit concurrent analysis to the currently active source file to preserve performance context.
- The system shall statically detect Go concurrency constructs (`chan`, `select`, `Mutex`, `Wait`) via gopls integration.

### FR2: Quick Insight (Concurrency Lens)
- The system shall overlay a lightweight Quick Insight hint when the user hovers over a primary concurrency construct in the editor.
- The system shall dynamically adjust the visible hints based on a density guard (maximum hints per viewport).
- The system shall degrade to predicted static hinting when runtime sampling is unavailable.
- The system shall visually encode the confidence level of signals (Predicted, Likely, Confirmed).

### FR3: Single-File Causal Navigation
- The system shall navigate the cursor directly to a channel's corresponding sender/receiver operation within the same file upon user click.
- The system shall render an inferred visual flow line between related concurrency operations.
- The system shall discard visual flow highlights within 16ms upon user exit action.

### FR4: Deep Trace Activation & Runtime Sampling
- The system shall activate Deep Trace scoped strictly to the current functional flow triggered by hover or context menu.
- The system shall sample active runtime goroutine wait states seamlessly via Delve (DAP).
- The system shall flag and visually pulse blocked send/receive runtime operations.
- The system shall correlate confirmed blocked operations to their likely causal counterparts using traced evidence.

### FR5: Resilience and Degradation
- The system shall display static hints continuously and suppress all UI errors/breakages when Delve integration terminates unexpectedly.
- The system shall override predicted semantic signals with confirmed runtime signals when conflicts map to the identical location.

### FR6: Editor-First Layout and Optional Panels
- The system shall keep the code editor as the dominant area (target 70-80% width in standard desktop layout).
- The system shall keep the bottom panel hidden by default and reveal it only on explicit user action.
- The system shall keep the right summary panel collapsed by default and show it only when toggled.
- The system shall render right-panel summaries using text and minimal indicators only (no charts).

### FR7: Concurrency Lens Inline Elements
- The system shall render dotted underline hints for static concurrency signals.
- The system shall render a soft pulse style for blocked runtime operations.
- The system shall render thin, thread-like causal connectors between related operations.
- The system shall render compact trace bubbles with wait time and confidence state.
- The system shall clear lens overlays immediately when user intent ends (hover out, dismiss, or trace stop) to preserve readability.

### FR8: Status and Interaction Model
- The system shall expose mode state in status bar: Quick Insight or Deep Trace.
- The system shall expose runtime availability in status bar: available or not available.
- The system shall support click-to-jump navigation from lightweight summary panel items to relevant code lines.

## Acceptance Criteria Matrix

### AC-FR1: Editor & Context Navigation
- Given an active Go workspace, when a Go file is opened, then syntax highlighting and editor interactions are available without loading additional dashboard surfaces.
- Given a file containing `chan`, `select`, `Mutex`, and `WaitGroup` usage, when static analysis completes, then these constructs are detected and mapped to source locations in the active file.

### AC-FR2: Quick Insight
- Given hover on a supported concurrency construct, when intent is detected, then a lightweight hint appears within 100ms and disappears when intent ends.
- Given runtime sampling is unavailable, when Quick Insight is triggered, then predicted static hints still render and no UI error is shown.

### AC-FR3: Single-File Causal Navigation
- Given a mapped sender/receiver pair in one file, when user clicks jump action, then cursor lands on counterpart location in the same file.
- Given causal highlight is active, when user dismisses or exits context, then highlight clears within 16ms target interaction budget.

### AC-FR4: Deep Trace Activation
- Given runtime is available, when Deep Trace is activated, then blocked wait states are sampled and reflected inline with confidence labels.
- Given a confirmed blocked operation, when counterpart correlation is possible, then causal linkage is displayed with confidence-aware encoding.

### AC-FR5: Resilience and Degradation
- Given Delve integration crash or disconnect, when session continues, then static hints remain available and UI stays interactive.
- Given signal conflicts at the same location, when confirmed runtime evidence exists, then confirmed signal overrides predicted signal.

### AC-FR6: Editor-First Layout
- Given default application start, when shell loads, then editor region remains dominant (target 70-80% width).
- Given default application start, when no explicit user action occurs, then right and bottom optional panels remain collapsed/hidden.

### AC-FR7: Inline Lens Elements
- Given static signal presence, when hint is displayed, then dotted underline style is used.
- Given blocked runtime signal, when rendered, then soft pulse style is used and does not reduce code readability.
- Given trace evidence with latency estimate, when bubble is shown, then wait time and confidence are both visible.

### AC-FR8: Status & Panel Navigation
- Given mode switches between Quick Insight and Deep Trace, when state changes, then status bar updates within the same interaction frame.
- Given right summary panel item click, when mapping exists, then editor jumps to linked code line.

## KPI Instrumentation Plan

### Event Taxonomy
- `session_started`: captures environment metadata (OS, Go version, runtime available flag).
- `quick_insight_invoked`: fired on first and repeated Quick Insight activations.
- `deep_trace_activated`: fired when Deep Trace enters active state.
- `signal_rendered`: includes signal type, confidence level, and render latency bucket.
- `jump_to_counterpart`: includes source type (hover/card/panel) and success/failure.
- `trace_fallback_triggered`: captures reason (runtime unavailable, delve error, timeout).
- `issue_resolved_marker`: user-marked fix completion for time-to-resolution estimation.

### KPI Mapping
- Activation Rate = users with `quick_insight_invoked` in first session / new sessions.
- Deep Trace Retention = weekly active users with >=2 `deep_trace_activated` events.
- Median Time-to-Resolution = median(`issue_resolved_marker` - first relevant lens event).
- Fallback Reliability = sessions with successful static hints after `trace_fallback_triggered`.
- Navigation Effectiveness = successful `jump_to_counterpart` / total jump attempts.

### Telemetry and Privacy Guardrails
- Telemetry is opt-in by default.
- No source code payloads are transmitted; only metadata and timings.
- Event buffering remains local until explicit consent is confirmed.

## Non-Functional Requirements

- **NFR1 (Performance):** The system shall render UI interaction updates in under 16ms to maintain 60 FPS visual smoothness.
- **NFR2 (Performance):** The system shall launch from cold start to an interactive state in less than 1.5 seconds on supported macOS/Linux hardware.
- **NFR3 (Performance):** The system shall maintain a baseline memory operational footprint of under 300MB.
- **NFR4 (Reliability):** The system shall maintain fully operational static hinting (100% uptime within session) regardless of trace process crash states.
- **NFR5 (UX):** The system shall keep visual density low and avoid persistent overlays that reduce code readability.
- **NFR6 (UX):** The system shall limit motion to functional transitions (fade and soft pulse) with no decorative animation.
- **NFR7 (Security):** The system shall strictly execute Delve DAP inspection confined strictly within the local host boundaries.

## Release Gates

### Gate A: MVP Readiness (Phase 1)
- FR1-FR3 and FR5-FR7 acceptance criteria pass in manual verification suite.
- NFR1 and NFR5 pass on target baseline hardware profile.
- Fallback mode validated across Delve unavailable and Delve crash scenarios.

### Gate B: Growth Readiness (Phase 2)
- FR4 and FR8 acceptance criteria pass with runtime-enabled flows.
- Deep Trace activation success and counterpart navigation success meet internal quality thresholds.
- Right summary panel remains optional, collapsible, and low-noise under stress scenarios.

### Gate C: Expansion Readiness (Phase 3)
- Temporal replay and risk overlays preserve editor readability and density guard constraints.
- Reliability and performance regression checks pass against Phase 1 baseline targets.
- Cross-file visibility features preserve default minimal UX behavior unless explicitly activated.
