# Goro task boundaries

These rules apply to every coding agent (Claude Code reads them through CLAUDE.md).

## Scope

Keep each change within the user's explicitly requested scope. Do not add unrelated
features, redesigns, branding, dependency upgrades, version bumps, website changes,
branch merges or releases while fixing another issue. If investigation finds an
unrelated defect, report it separately; do not silently bundle its fix into the task.
The user's later explicit instructions can expand the scope.

## Working notes

Keep AI working notes, prompt copies, brainstorming, intermediate plans and raw
QA logs in `.local/working-docs/` (gitignored). Track only maintained user,
contributor, architecture, security and release documentation. Preserve unresolved
release gates in docs/RELEASE_READINESS.md when moving evidence to local storage.
Shared agent configuration (`.claude/settings.json`, `.claude/skills/`,
`.claude/hooks/`) is tracked; personal settings and scratch are not.

## Branches and verification

Branch from `develop` (`feature/…`, `fix/…`, `docs/…`, `refactor/…`) and integrate
there first. Before reporting a task done, run `npm run verify` and, when
`src-tauri/` changed, `npm run verify:rust`. Report exactly which checks passed,
failed, were skipped or could not be run. Never present a focused test as a full
suite or installer acceptance.

Never push to `main`, push tags, force-push or delete remote branches unless the
user asks for that exact action in the current conversation.

## Releases

Releases originate from `main` only, after the exact develop candidate passes every
gate in [release promotion](docs/RELEASE_PROMOTION.md) (use the `/release-promote`
skill). The current version line is experimental `0.5.0-alpha.x`; do not call it
beta/stable or claim unverified native acceptance. Check
[release readiness](docs/RELEASE_READINESS.md) for the active hold; an explicit
release hold from the maintainer always takes precedence.
