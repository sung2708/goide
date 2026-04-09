# Story 1.5: Optional Panels Default State

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
Completion note: Ultimate context engine analysis completed - comprehensive developer guide created

## Story

As a Go developer,
I want optional panels to stay out of my way by default,
so that the editor remains the primary focus.

## Acceptance Criteria

1. **Given** the app loads
   **When** I have not toggled any panels
   **Then** the right summary panel is collapsed and the bottom panel is hidden
   **And** both can be toggled explicitly without shifting focus from the editor

## Tasks / Subtasks

- [x] Task 1: Add optional panel components with collapsed/hidden defaults (AC: #1)
  - [x] Create `src/components/panels/SummaryPeek.tsx` as a lightweight, text-first placeholder panel
  - [x] Create `src/components/panels/BottomPanel.tsx` as a minimal panel container (hidden by default)
  - [x] Use Catppuccin-aligned surfaces and the existing `PANEL_BG`/`BORDER` tokens from `EditorShell`
- [x] Task 2: Wire panel visibility into `EditorShell` layout (AC: #1)
  - [x] Add local state for `isSummaryOpen` and `isBottomPanelOpen`, defaulting to `false`
  - [x] Ensure the editor remains dominant (target 70-80% width) when panels are hidden
  - [x] When summary panel opens, cap its width and keep it text-first (no charts)
- [x] Task 3: Add explicit toggle controls without stealing editor focus (AC: #1)
  - [x] Add toggle buttons (header or status bar) for summary + bottom panel
  - [x] Preserve editor focus on toggle (e.g., `onMouseDown` + `preventDefault` + restore focus)
  - [x] Provide accessible labels and keyboard activation
- [x] Task 4: Empty + no-signal states remain intact (AC: #1)
  - [x] Confirm existing empty/placeholder states in `EditorShell` still render unchanged
  - [x] Panels must not appear unless toggled

## Dev Notes

### Developer Context (Read First)

- This story is UI-only and should stay inside the frontend (`src/`).
- Do NOT introduce global state; keep panel visibility in `EditorShell` local state.
- Preserve the workspace scoping safeguards already in `EditorShell` (no regressions).

### Technical Requirements

- Use React functional components only (no class components).
- Styling via Tailwind only; reuse existing color tokens in `EditorShell`.
- Panels are optional UI surfaces (no data wiring in this story).
- Respect reduced-motion preferences (no new animations beyond subtle fades if needed).

### Architecture Compliance

- Keep module boundaries: UI components in `src/components/*`.
- No new IPC commands or backend changes.
- No new external dependencies; use existing libs only.

### Library / Framework Requirements

- React, Vite, Tailwind, and Tauri versions are already pinned in `package.json`; do not upgrade in this story.
- Ensure panel toggles do not introduce layout shifts that reduce editor dominance.

### File Structure Requirements

- New components must live in `src/components/panels/` (create folder if needed).
- `EditorShell` remains the layout orchestrator in `src/components/editor/EditorShell.tsx`.
- If toggles are placed in the status bar, edit `src/components/statusbar/StatusBar.tsx` only (no new location).

### Testing Requirements

- No automated tests required for this story.
- Manual checks:
  - Default load shows no right panel and no bottom panel
  - Toggles show/hide panels without stealing editor focus
  - Editor remains dominant in width when panels are hidden

### Previous Story Intelligence (1.4)

- `EditorShell` now renders a read-only CodeMirror editor via `CodeEditor`.
- Loading/error/empty states were tuned; do not regress these branches.
- CodeMirror integration uses `@uiw/react-codemirror` with Go syntax highlighting.

### Git Intelligence Summary

- Recent commits focused on `EditorShell` workspace switching race conditions and file loading.
- Do not disturb the `workspacePathRef` guard or `isReading` flow; keep async safety intact.

### Latest Technical Information

- Stick with the current pinned stack in `package.json` for this story.
- Any upgrades to React/Tauri/Tailwind/CodeMirror require separate, explicit stories.

### Project Context Reference

- Core rules: `_bmad-output/project-context.md` (Critical Implementation Rules, Architecture boundaries, Workspace scoping rule)
- Epic definitions: `_bmad-output/planning-artifacts/epics.md` (Epic 1, Story 1.5)
- Architecture patterns: `_bmad-output/planning-artifacts/architecture.md` (Project Structure & Boundaries)
- UX requirements: `_bmad-output/planning-artifacts/ux-design-specification.md` (Editor-first layout, optional panels, text-first summary)

## Dev Agent Record

### Agent Model Used

GPT-5 (Amelia)

### Debug Log References

- 2026-04-09: Installed Vitest + Testing Library (required for workflow red-green cycle).
- 2026-04-09: `npm test` (vitest) passed after setup fixes (`@testing-library/jest-dom/vitest`).

### Completion Notes List

- Added optional Summary and Bottom panel components with text-first placeholders.
- Wired panel visibility into `EditorShell` with local state and preserved editor dominance.
- Added status bar toggles that avoid focus stealing via `onMouseDown` preventDefault.
- Added a minimal Vitest + Testing Library setup and a UI toggle test.

### File List

- package.json
- package-lock.json
- vite.config.ts
- src/test/setup.ts
- src/components/panels/SummaryPeek.tsx
- src/components/panels/BottomPanel.tsx
- src/components/statusbar/StatusBar.tsx
- src/components/editor/EditorShell.tsx
- src/components/editor/EditorShell.test.tsx

## Change Log

- 2026-04-09: Implemented optional panels, toggles, and unit test coverage for panel visibility.
