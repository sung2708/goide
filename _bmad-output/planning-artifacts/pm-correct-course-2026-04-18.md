# PM Correct Course Note - 2026-04-18

## Context

User validation after Epic 1-4 indicates a clear gap between current "basic autocomplete" capability and expected professional IDE typing experience.

Core Concurrency Lens value is present, but day-to-day editing flow still has friction:

- Completion confidence is inconsistent across contexts.
- Package/member discovery is not consistently delightful (`fmt` flow is the benchmark scenario).
- Diagnostics fallback messaging is not explicit enough when `gopls` is unavailable.
- Keyboard behavior (`Tab` vs `Enter`) and snippet/pairing behavior require stricter consistency.

## Decision

Prioritize an execution-focused Epic 5 before any Phase 2 expansion.

Epic 5 objective:

- Make completion and diagnostics trustworthy.
- Make typing ergonomics fast and predictable.
- Keep failure handling low-noise and non-disruptive.

## Updated Planning Artifacts

- `prd.md`: Added FR9-FR12 and AC-FR9 to AC-FR12.
- `epics.md`: Replaced template with execution-ready epics and Story 5.1-5.6.
- `sprint-status.yaml`: Added Epic 5 and story backlog entries.

## Delivery Strategy

Order of execution:

1. Story 5.1 + 5.2 (completion acceptance + package/member intelligence)
2. Story 5.3 (diagnostics robustness and missing dependency UX)
3. Story 5.4 + 5.5 (pairing/surround + snippet quality)
4. Story 5.6 (performance and polish hardening)

Definition of success:

- Users can type, discover, and accept completions with confidence using keyboard-first flow.
- `fmt` and common package flows behave predictably, including import assistance.
- Diagnostics behavior is explicit when tooling is missing, without disrupting editing.
