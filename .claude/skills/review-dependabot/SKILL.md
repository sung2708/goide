---
name: review-dependabot
description: Triage open Dependabot branches/PRs for Goro — decide merge, test or close for each, with risk notes. Use when asked about dependency updates or Dependabot PRs.
---

# Review Dependabot updates

1. List them: `git fetch --prune` then `git branch -r --list 'origin/dependabot/*'`
   (or open PRs via `gh` if available).
2. For each, read the one commit (`git show --stat <branch>`) and classify:
   - **patch/minor, dev-only** (types, testing-library, tailwind) → low risk.
   - **major** (e.g. TypeScript, Vite plugin, zip, actions/*@N) → read the upstream
     changelog/breaking changes before anything else.
   - **runtime Rust crates** (tokio, sha2, zip, libc) → check `cargo tree -d` for
     duplicates and the MSRV in docs/DEVELOPMENT.md.
3. To test one: create `fix/deps-<name>` from `develop`, cherry-pick or merge the
   Dependabot commit, run the `/verify` skill (plus `npm run verify:rust` for Cargo,
   `npm audit --audit-level=high` for npm).
4. New dependencies must have permissive licences (MIT/Apache-2.0/BSD/CC0).
5. Do not delete remote branches or close PRs yourself. Output a table: update,
   risk, test result, recommendation (merge / needs work / close + `@dependabot ignore`),
   and the commands the user should run.
