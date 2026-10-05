# Goro task boundaries

Keep AI working notes, prompt copies, brainstorming, intermediate plans and raw
QA logs in `.local/working-docs/` (gitignored). Track only maintained user,
contributor, architecture, security and release documentation. Preserve unresolved
release gates in docs/RELEASE_READINESS.md when moving evidence to local storage.

Keep each change within the user's explicitly requested scope. Do not add unrelated
features, redesigns, branding, dependency upgrades, version bumps, website changes,
branch merges or releases while fixing another issue. If investigation finds an
unrelated defect, report it separately; do not silently bundle its fix into the task.
The user's later explicit instructions can expand the scope.

Implement and verify on `develop` first. Report exactly which checks passed,
failed, were skipped or could not be run. Never present a focused test as a full
suite or installer acceptance. Do not promote a failing or unchecked candidate
to `main`; follow docs/RELEASE_PROMOTION.md for exact-candidate release gates.

The maintainer resumed releases on 2026-10-04 and authorized merging develop into
main for the next release. Releases originate from main only after the required
develop and main checks pass. Current preparation targets experimental
`0.5.0-alpha.1`; do not call it beta/stable or claim unverified native acceptance.
Any subsequent explicit release hold takes precedence.
