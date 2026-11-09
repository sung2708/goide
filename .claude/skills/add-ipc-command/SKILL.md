---
name: add-ipc-command
description: Add or change a Tauri IPC command end to end (Rust handler, Serde DTOs, registration, TypeScript types and client, tests). Use whenever the frontend needs a new backend capability.
---

# Add a Tauri IPC command

Read docs/ENGINEERING_RULES.md sections 2 and 5 first. Touch these places, in order:

1. **DTOs** — `src-tauri/src/ui_bridge/types.rs`: request/response structs with
   `#[derive(Serialize, Deserialize)]` and `#[serde(rename_all = "camelCase")]`, matching
   the style of neighbouring types.
2. **Handler** — put it in the domain file (`git_commands.rs`, `search_commands.rs`,
   `document_commands.rs`, …) or a new `*_commands.rs`. Do **not** add to the
   oversized `commands.rs`. Return `ApiResponse<T>`; map every failure to an error
   with a stable code and a useful message. Validate and canonicalize paths inside the
   active workspace root; spawn processes with argument vectors only.
3. **Register** — add it to `tauri::generate_handler![...]` in `src-tauri/src/lib.rs`
   (and the module in `ui_bridge/mod.rs` if new).
4. **TypeScript types** — mirror the DTOs in `src/lib/ipc/types.ts` (camelCase fields,
   optional where Rust uses `Option`).
5. **Client** — add a typed wrapper in `src/lib/ipc/client.ts` (or `git.ts` for Git)
   that calls `invoke` and returns `ApiResponse<T>`.
6. **Tests** — Rust unit/integration test for success and failure paths (use unique
   temp dirs, never this checkout); Vitest test in `src/lib/ipc/*.test.ts` that mocks
   `@tauri-apps/api/core` and checks the envelope and error handling; UI test for the
   caller if behaviour is user-visible.
7. If the command owns a long-lived resource (process, watcher, PTY, DAP), add an
   idempotent dispose command and a React cleanup path.
8. Run the `/verify` skill.
