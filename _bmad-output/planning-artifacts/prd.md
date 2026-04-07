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
- **Key Features:** Quick Insight + Deep Trace (flow/function scope) reliable for single files. Fail-safe fallback to static hints. Smooth fade/scale transitions and density guards to cap visible signals.

### Growth Features (Phase 2)
- Multi-file causal trace chains.
- Robust runtime and trace integration accuracy.
- Reliable deadlock and contention risk detection.
- Native Docker/K8s integration for remote troubleshooting over local environments.

### Expansion Vision (Phase 3)
- Real-time temporal replay + risk layer (scrub/freeze trace ribbon).
- Contextual visibility scaling to cross-service distributed concurrency.

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

- **Invisible Runtime UX:** Concurrency relationships are contextual overlays injected directly into the source code, eliminating the need for disjointed external trace dashboards or dashboards.
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

## Non-Functional Requirements

- **NFR1 (Performance):** The system shall render UI interaction updates in under 16ms to maintain 60 FPS visual smoothness.
- **NFR2 (Performance):** The system shall launch from cold start to an interactive state in less than 1.5 seconds on supported macOS/Linux hardware.
- **NFR3 (Performance):** The system shall maintain a baseline memory operational footprint of under 300MB.
- **NFR4 (Reliability):** The system shall maintain fully operational static hinting (100% uptime within session) regardless of trace process crash states.
- **NFR5 (UX):** The system shall animate the appearance/disappearance of UI signals utilizing smooth fade/scale CSS/native transitions.
- **NFR6 (Security):** The system shall strictly execute Delve DAP inspection confined strictly within the local host boundaries.
