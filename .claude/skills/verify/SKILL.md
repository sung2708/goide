---
name: verify
description: Run Goro's quality gates for the current change and report pass/fail/skipped honestly. Use before saying a task is done, before committing, or when asked to check/test the change.
---

# Verify the current change

1. Find what changed: `git status --porcelain` and `git diff --stat develop...HEAD`.
2. Run the focused tests first for fast feedback:
   - Frontend: `npx vitest run <changed or related *.test.ts(x)>`
   - Rust: `cargo test --manifest-path src-tauri/Cargo.toml --locked <module> -- --test-threads=1`
   - Release scripts (`scripts/*.mjs`): `node --test scripts/<name>.node-test.mjs`
3. Run the full gates:
   - Always: `npm run verify`
   - If anything under `src-tauri/` changed: `npm run verify:rust`
     (Windows: `scripts\cargo_clippy_msvc.cmd --locked --all-targets` and
     `scripts\cargo_test_msvc.cmd --locked -- --test-threads=1`)
   - If `.github/workflows/release.yml` changed: actionlint as in CI.
4. When a check fails: read the output, fix the cause (never loosen a test, raise a
   timeout or add `skip` to make it pass), and rerun that check, then the full gate.
5. If the change has a user-visible workflow, confirm docs in `docs/` were updated and
   any new doc is listed in `scripts/validate-docs.mjs`.

## Report

End with a table, one row per check: command, result (passed / failed / skipped /
could not run) and the key output line (e.g. "838 tests, 135 files"). State what was
NOT covered: ignored gopls/Delve fixtures, other OS targets, installer and manual
native UI acceptance. Never call a focused run a full suite.
