# Goro task boundaries

Keep each change within the user's explicitly requested scope. Do not add unrelated
features, redesigns, branding, dependency upgrades, version bumps, website changes,
branch merges or releases while fixing another issue. If investigation finds an
unrelated defect, report it separately; do not silently bundle its fix into the task.
The user's later explicit instructions can expand the scope.

Implement and verify on `develop` first. Report exactly which checks passed,
failed, were skipped or could not be run. Never present a focused test as a full
suite or installer acceptance. Do not promote a failing or unchecked candidate
to `main`; follow docs/RELEASE_PROMOTION.md for exact-candidate release gates.

Releases are currently on hold. No version/tag/publication/metadata update until
the user explicitly resumes releases. When resumed, releases originate from main
only after the required develop and main gates pass.
