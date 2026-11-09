# Goro (goide) — Claude Code guide

@AGENTS.md

Goro is a desktop Go IDE: React 19 + TypeScript + Monaco in `src/`, Rust + Tauri v2
in `src-tauri/`. Architecture: docs/ARCHITECTURE.md. Rules: docs/ENGINEERING_RULES.md.

## Commands

- Install: `npm ci`
- Dev app: `npm run tauri -- dev` (Windows MSVC: `npm run tauri:dev:msvc`)
- **Full frontend gate: `npm run verify`** (version, docs links, typecheck, Vitest, build)
- **Rust gate: `npm run verify:rust`** (fmt, clippy `-D warnings`, tests single-threaded).
  On Windows use `scripts\cargo_clippy_msvc.cmd` / `scripts\cargo_test_msvc.cmd`.
- One test file: `npx vitest run src/path/File.test.tsx`
- One Rust test: `cargo test --manifest-path src-tauri/Cargo.toml --locked <name> -- --test-threads=1`
- Script contract tests: `node --test scripts/*.node-test.mjs`

## Conventions

- Every IPC command touches four places: `src-tauri/src/ui_bridge/*_commands.rs`,
  `ui_bridge/types.rs` (Serde DTO), `generate_handler!` in `src-tauri/src/lib.rs`,
  and `src/lib/ipc/types.ts` + `client.ts`. Use the `/add-ipc-command` skill.
- IPC always returns `ApiResponse<T>` with an error code; never swallow errors.
- Spawn processes with argument vectors, never `sh -c` / `cmd /c` strings.
- Tests: `waitFor` / fake timers, never sleeps; mock `@tauri-apps/api/core` with `vi.mock`.
- Commits: Conventional Commits (`feat(editor): ...`).

## Gotchas

- `EditorShell.tsx` (~3k lines) and `ui_bridge/commands.rs` (~4k lines) are already far
  over the 500-line rule. Do not grow them: put new logic in a new hook/module.
- Rust tests share native registries: always `--test-threads=1`.
- gopls/Delve fixtures are `#[ignore]`d; they only run with `--include-ignored` and real
  tools installed. A green default run does not mean they ran.
- New docs must be added to the list in `scripts/validate-docs.mjs`.
- `.local/working-docs/` (gitignored) is the place for plans, notes and QA logs.
