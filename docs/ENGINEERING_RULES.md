# Goro Engineering Rules

This document establishes durable architectural and engineering rules for all contributors and maintainers working on Goro. These rules govern code structure, lifecycle management, security boundaries, and code quality.

---

## 1. Source Ownership & Boundary Discipline

1. **Clear Tier Separation**:
   - The **Frontend** (`src/`) owns presentation, user input routing, editor viewport rendering, and client-side view state.
   - The **Backend** (`src-tauri/`) owns native OS resources, child process lifecycles, PTY terminals, filesystem persistence, and compiler/debugger bridges.
2. **No UI Lifecycle Entanglement**:
   - The UI must never directly spawn, manage, or kill system processes via arbitrary shell commands. All operations must proceed through explicit, typed backend IPC handlers.
3. **No Giant God Modules**:
   - Avoid monolithic files. Functions and components should have a single, coherent responsibility. Modules approaching excessive size (e.g. over 500 lines) should be decomposed into cohesive sub-modules.

---

## 2. IPC & Type Safety Invariants

1. **Strictly Typed IPC Contracts**:
   - Every Tauri command handler in `src-tauri/src/ui_bridge/commands.rs` must have corresponding Serde DTOs in `src-tauri/src/ui_bridge/types.rs` and matching TypeScript interfaces in `src/lib/ipc/types.ts`.
2. **Explicit Result Envelopes**:
   - All IPC endpoints must return structured responses:
     ```typescript
     ApiResponse<T> = { ok: boolean; data?: T; error?: ApiError };
     ```
   - Errors must include an identifiable error code and an informative message.
3. **Never Silently Swallow Errors**:
   - Failures in process execution, file I/O, or toolchain communication must be propagated to the UI and surfaced transparently through the status bar, diagnostic panel, or user dialogs.

---

## 3. Asynchronous Lifecycle & Resource Cleanup

1. **Idempotent Resource Teardown**:
   - PTY terminal sessions, file watchers, and Delve DAP sessions must implement deterministic cleanup routines. When a window is closed or a session is disposed, underlying OS child processes and file descriptors must be terminated.
2. **Clean Component Unmounting**:
   - React hooks and event listeners must return cleanup callbacks that unsubscribe from IPC events, cancel pending animation frames, and abort active timers.
3. **Guard Against Stale Async Responses**:
   - When switching files or workspaces, discard in-flight LSP or DAP responses belonging to the previous context to avoid state corruption.

---

## 4. State Management & Single Source of Truth

1. **Disk as Source of Truth**:
   - The filesystem remains the ultimate source of truth for code. The editor tracks dirty in-memory buffers and synchronizes with disk via atomic writes.
2. **No Duplicated State**:
   - Avoid caching identical data across multiple React states or backend stores. If state can be derived, compute it reactively.
3. **Deterministic Version Synchronization**:
   - `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` must maintain synchronized version declarations. Enforce version equality via `npm run version:check`.

---

## 5. Security & Platform Portability

1. **Strict Path Validation**:
   - Filesystem commands must canonicalize paths and verify that targets reside within the authorized active workspace root. Never allow arbitrary directory traversal (`../`).
2. **No Hard-Coded Paths**:
   - Never hardcode user directories, machine-specific paths (e.g. `C:\Users\...`), or OS-specific separators (`\` or `/`). Use relative paths and path manipulation libraries (`node:path`, `std::path::Path`).
3. **No Direct String Shell Execution**:
   - Never invoke shell interpreters (`sh -c` or `cmd /c`) with concatenated strings. Pass discrete argument vectors directly to process spawners.
4. **Preserve Cross-Platform Portability**:
   - Code must build and execute cleanly on Windows, macOS, and Linux. Platform-specific code must be guarded with `#[cfg(...)]` in Rust or runtime checks in TypeScript.

---

## 6. Testing & Documentation Requirements

1. **No Untested Features or Bug Fixes**:
   - Every new feature, UI flow, and bug fix must be accompanied by automated Vitest or Cargo tests.
2. **Documentation Must Track Implementation**:
   - When code changes alter user workflows, configuration keys, or build procedures, relevant documentation in `docs/` must be updated in the same pull request.
3. **No Ephemeral AI Artifacts**:
   - Working memory, scratchpads, prompt files, intermediate logs, and AI task decomposition notes must never be committed to Git.
