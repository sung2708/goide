# Story 1.2: Initialize App Shell & Workspace Open

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Go developer,
I want to open a workspace and see the editor shell immediately,
so that I can start working without setup friction.

## Acceptance Criteria

1. **Given** the app launches
   **When** I select a workspace folder
   **Then** the editor shell loads with sidebar, editor region, and status bar
   **And** the editor region is visually dominant (target 70-80% width)

## Tasks / Subtasks

- [x] Task 1: Create the editor shell layout scaffolding (AC: #1)
  - [x] Add shell components per architecture (`src/components/editor/`, `src/components/sidebar/`, `src/components/statusbar/`)
  - [x] Layout with sidebar + editor region + status bar; keep editor 70-80% width
  - [x] Ensure right/bottom panels are not shown in this story (they remain future/optional)
- [x] Task 2: Workspace open flow (AC: #1)
  - [x] Add an "Open Workspace" action in the shell (button or placeholder panel)
  - [x] Use Tauri dialog plugin to select a directory
  - [x] Store selected workspace path in local UI state; display it in shell (status bar or header)
  - [x] If user cancels, keep a clear empty state and allow retry
- [x] Task 3: Styling + tokens baseline (AC: #1)
  - [x] If Tailwind is not configured yet, add Tailwind setup (per architecture) and move styling to Tailwind classes
  - [x] Apply base layout tokens (4px spacing, 4px radius, JetBrains Mono for code areas, Geist/IBM Plex Sans for UI)
  - [x] Respect editor-first layout (no clutter; sidebar visually lighter)
- [x] Task 4: Tauri plugin + permissions for dialog (AC: #1)
  - [x] Install `@tauri-apps/plugin-dialog` and `tauri-plugin-dialog`
  - [x] Initialize the plugin in `src-tauri/src/lib.rs`
  - [x] Update `src-tauri/capabilities/default.json` to allow dialog open (use `dialog:allow-open` if available; otherwise the Tauri v2 capability identifier for dialog open)

## Dev Notes

### Technical Requirements

- Implement only the minimal editor shell + workspace picker; no file tree or file open yet (that is Story 1.3).
- Workspace selection is local-only; do not read or index files in this story.
- UI must feel instant: initial shell should render immediately, and dialog should open without visible delay.
- No network access; no DB; no auth/encryption.

### Architecture Compliance

- Follow React + TypeScript + Tauri v2 stack; keep Tauri layer thin.
- Keep UI structure aligned with architecture boundaries:
  - Shell: `src/components/editor/EditorShell.tsx`
  - Sidebar: `src/components/sidebar/SourceTree.tsx` (placeholder only)
  - Status bar: `src/components/statusbar/StatusBar.tsx`
- Use Tailwind-only styling (no mixed CSS systems) per architecture.
- If adding any IPC later, keep typed contracts in `src/lib/ipc/types.ts` and Rust mirrors in `src-tauri/src/ui_bridge/types.rs` (not required in this story).

### Library / Framework Requirements (Latest)

- Tauri v2 dialog is a plugin in v2: use `@tauri-apps/plugin-dialog` and `tauri-plugin-dialog` (requires Rust 1.77.2+).
- Tauri v2 releases are in the 2.x series; use the scaffolded version unless explicitly upgrading.
- React latest major is 19.x; keep scaffolded React version unless there is an explicit upgrade story.
- Vite 8 is in beta per official blog; avoid upgrading build tooling during this story.
- Tailwind CSS latest major is 4.x; follow Tailwind’s latest guidance if setting it up now.
- gopls follows a minor release cadence; keep integration assumptions minimal here (no gopls usage in this story).
- Delve latest releases are v1.25.x; runtime sampling is out of scope for this story.

### File Structure Requirements

- Continue using repo root scaffolded structure (from Story 1.1).
- New files should live under:
  - `src/components/editor/EditorShell.tsx`
  - `src/components/sidebar/SourceTree.tsx`
  - `src/components/statusbar/StatusBar.tsx`
  - Optional `src/styles/global.css` if needed for base font imports (keep Tailwind-first)

### Testing Requirements

- No automated tests required for this story.
- Manual verification:
  - App launches and renders shell immediately.
  - Workspace dialog opens and selected path appears in UI.
  - Editor region remains visually dominant (70-80% width).

### Previous Story Intelligence

- Repo scaffolded via official `create-tauri-app` (React + TS). Use existing `src/App.tsx` and `src/main.tsx` as the starting point for shell wiring.
- Tailwind and design tokens are not yet configured; if needed, add them cleanly and migrate styling away from `App.css`.
- Ensure no new dependencies beyond required plugin(s).

### Git Intelligence Summary

- Recent commits include project scaffold and docs only. No existing editor shell patterns to preserve.

### Latest Tech Information

- Tauri v2 dialog plugin requires explicit setup and permissions (dialog open).
- React latest major is 19.2 (docs maintain latest major only).
- Tailwind CSS v4.1 is the current latest major blogged release.
- gopls release index shows current minor series up to v0.21.x with v0.22.0 expected.

### Project Context Reference

- Follow local-only execution, no network calls, minimal UI, and editor-first layout. See `_bmad-output/project-context.md` and `_bmad-output/planning-artifacts/ux-design-specification.md` for UX and stack constraints.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design System Foundation]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design Direction Decision]
- [Source: _bmad-output/planning-artifacts/prd.md#Output Definition]
- [Source: _bmad-output/project-context.md#Technology Stack & Versions]
- [Source: https://v2.tauri.app/plugin/dialog/]
- [Source: https://v2.tauri.app/reference/acl/capability/]
- [Source: https://react.dev/versions]
- [Source: https://tailwindcss.com/blog/tailwindcss-v4-1]
- [Source: https://go.dev/gopls/release/]
- [Source: https://go.dev/gopls/release/v0.21.0]
- [Source: https://github.com/go-delve/delve/releases]
- [Source: https://main.vitejs.dev/blog/announcing-vite8-beta]

## Dev Agent Record

### Agent Model Used

GPT-5

### Debug Log References

- N/A (story creation only)

### Implementation Plan

- Replace the starter app with an editor-first shell composed of sidebar, editor region, and status bar.
- Add workspace open flow via Tauri dialog plugin, storing path in local UI state and reflecting it in the shell.
- Introduce Tailwind v4 setup and move layout styling to Tailwind classes with Catppuccin-inspired tokens.
- Wire Tauri dialog permissions and Rust plugin initialization.

### Completion Notes List

- Implemented the editor shell layout with sidebar, editor region, and status bar, keeping the editor dominant.
- Added workspace selection via the Tauri dialog plugin, with clear empty state on cancel and status bar display.
- Introduced Tailwind styling and base typography tokens aligned to the UX spec.
- Installed and initialized the dialog plugin with permissions; Cargo.lock updated.
- Tests not added or run (not required for this story).

### File List

- src/App.tsx
- src/main.tsx
- src/components/editor/EditorShell.tsx
- src/components/sidebar/SourceTree.tsx
- src/components/statusbar/StatusBar.tsx
- src/styles/global.css
- vite.config.ts
- package.json
- src-tauri/Cargo.toml
- src-tauri/Cargo.lock
- src-tauri/src/lib.rs
- src-tauri/capabilities/default.json
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/1-2-initialize-app-shell-workspace-open.md

## Change Log

- 2026-04-08: Implemented editor shell layout, workspace open flow, Tailwind setup, and dialog plugin wiring.
