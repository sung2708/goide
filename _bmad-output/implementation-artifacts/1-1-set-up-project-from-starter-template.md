# Story 1.1: Set Up Project from Starter Template

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Go developer,
I want the project initialized from the official Tauri starter,
so that the workspace and build system are set up correctly from the start.

## Acceptance Criteria

1. **Given** no project exists yet
   **When** I run the official `create-tauri-app` starter (React + TypeScript)
   **Then** the project scaffolding is created successfully
   **And** the app can be launched in dev mode without errors

## Tasks / Subtasks

- [x] Task 1: Verify prerequisites on the target OS (AC: #1)
  - [x] Confirm Rust toolchain installed via `rustup`
  - [x] Confirm Node.js LTS installed
  - [x] On Windows, confirm required build tools and WebView2 runtime are installed
- [x] Task 2: Scaffold the app with official starter (AC: #1)
  - [x] Run official `create-tauri-app` command (PowerShell) and select **React + TypeScript** template
  - [x] Choose package manager (prefer `pnpm` to match architecture lockfile expectations; otherwise `npm`)
  - [x] If repo root is non-empty, scaffold into a temporary folder and move app files to repo root, preserving existing `docs/`, `_bmad/`, `_bmad-output/`, and `.git/`
- [x] Task 3: Confirm dev mode runs (AC: #1)
  - [x] Install dependencies via selected package manager
  - [x] Launch `tauri dev` and confirm the app opens without errors

## Dev Notes

### Technical Requirements

- Use **official** `create-tauri-app` (Tauri v2) with **React + TypeScript** template only.
- No custom templates, community starters, or extra dependencies in this story.
- Keep build tooling as provided by the official starter (Vite expected).
- No CI/CD, no DB, no external API calls, no auth/encryption in MVP.
- All runtime analysis must remain local-only (no network calls).

### Architecture Compliance

- Tauri IPC only; keep the Rust layer thin and typed.
- Enforce module boundaries when later code is added: `src-tauri/src/core`, `src-tauri/src/integration`, `src-tauri/src/ui_bridge`.
- Frontend file structure will live in `src/` with `components/`, `features/concurrency/`, `hooks/`, `lib/` (do not add yet in this story).

### Library / Framework Requirements (Latest)

- Tauri v2 official starter (`create-tauri-app`) is the required scaffold path.
- Follow official Tauri prerequisites for Rust and Node.js; Windows also requires build tools and WebView2.

### File Structure Requirements

- Final scaffold must match the architecture structure at repo root:
  - `src/` (frontend)
  - `src-tauri/` (Rust/Tauri)
  - Root-level configs: `package.json`, `tsconfig.json`, `vite.config.*`, `tailwind.config.*`, `src-tauri/tauri.conf.json`
- Preserve existing docs and BMAD output directories in the repo root:
  - `docs/`, `_bmad/`, `_bmad-output/`, `.git/`

### Testing Requirements

- No automated tests required for this story.
- Dev verification is sufficient: `tauri dev` launches without errors.

### Git Intelligence Summary

- Recent commits appear to be documentation/setup only; no existing app scaffold to reuse yet.

### Latest Tech Information (as of 2026-04-08)

- Official Tauri v2 docs list prerequisites and supported setup steps, including Rust installation and platform requirements.
- Use the official `create-tauri-app` flow and select **React + TypeScript**.

### Project Context Reference

- Follow strict local-first constraints, minimal UI complexity, and Tauri v2 + React + TypeScript + Vite + Tailwind stack.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Starter Template Evaluation]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Design System Foundation]
- [Source: _bmad-output/planning-artifacts/prd.md#Technical Constraints]
- [Source: _bmad-output/project-context.md#Technology Stack & Versions]
- [Source: https://v2.tauri.app/start/prerequisites/]
- [Source: https://v2.tauri.app/start/create-project/]

## Dev Agent Record

### Agent Model Used

GPT-5

### Implementation Plan

- Run `create-tauri-app` non-interactive with React+TypeScript and npm
- Scaffold in temp folder and copy into repo root (preserve docs and BMAD outputs)
- Merge `.gitignore`, replace `README.md`
- Install dependencies and run `tauri dev` for verification

### Debug Log References

- `npm create tauri-app@latest goide -- --template react-ts --manager npm --identifier com.sungp.goide --yes --tauri-version 2`
- `npm run tauri dev` failed with `spawn EPERM`; escalated retry timed out
- `npm run tauri dev` (retry) failed during Rust build: `vswhom-sys` could not detect MSVC toolchain; `zig` used as CXX and target `x86_64-pc-windows-msvc` parse failed
- `cmd /c "vcvars64.bat && set CC=cl && set CXX=cl && npm run tauri dev"` timed out after 60s; cargo/node processes continued running, no success confirmation
- `cmd /c "vcvars64.bat && set CC=cl && set CXX=cl && npm run tauri dev"` (post port-clear) timed out after 60s; port 1420 is now listening (PID 9648). Awaiting confirmation that the app window opens.
- User confirmed app opens successfully after running `tauri dev` from repo root with VS build tools env.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Scaffolded Tauri v2 React+TypeScript app into temp folder and copied into repo root
- Merged `.gitignore` and replaced `README.md` with scaffold README
- `npm install` completed (node_modules present)
- `tauri dev` not yet confirmed. With vcvars and CC/CXX=cl, build ran past timeout; requires manual confirmation that the app opens without errors.
- `tauri dev` confirmed by user; app launches without errors.

### File List

- .gitignore
- README.md
- index.html
- package.json
- package-lock.json
- tsconfig.json
- tsconfig.node.json
- vite.config.ts
- .vscode/extensions.json
- public/tauri.svg
- public/vite.svg
- src/App.css
- src/App.tsx
- src/main.tsx
- src/vite-env.d.ts
- src/assets/react.svg
- src-tauri/Cargo.lock
- src-tauri/Cargo.toml
- src-tauri/build.rs
- src-tauri/tauri.conf.json
- src-tauri/capabilities/default.json
- src-tauri/src/lib.rs
- src-tauri/src/main.rs
- src-tauri/icons/32x32.png
- src-tauri/icons/128x128.png
- src-tauri/icons/128x128@2x.png
- src-tauri/icons/StoreLogo.png
- src-tauri/icons/Square30x30Logo.png
- src-tauri/icons/Square44x44Logo.png
- src-tauri/icons/Square71x71Logo.png
- src-tauri/icons/Square89x89Logo.png
- src-tauri/icons/Square107x107Logo.png
- src-tauri/icons/Square142x142Logo.png
- src-tauri/icons/Square150x150Logo.png
- src-tauri/icons/Square284x284Logo.png
- src-tauri/icons/Square310x310Logo.png
- src-tauri/icons/icon.ico
- src-tauri/icons/icon.icns
- src-tauri/icons/icon.png
