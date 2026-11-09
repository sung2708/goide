---
name: release-promote
description: Walk the develop → main → tag → release promotion checklist for Goro. Use only when the maintainer explicitly asks to prepare, promote or publish a release.
disable-model-invocation: true
---

# Release promotion

The source of truth is docs/RELEASE_PROMOTION.md, docs/RELEASE.md and
docs/RELEASE_READINESS.md. Read all three now; if they disagree with this list,
they win. Stop at the first failing or unknown gate and report it.

1. **Hold check** — read RELEASE_READINESS.md and the conversation. Any active
   release hold → stop.
2. **Candidate** — record the exact develop SHA (`git rev-parse origin/develop`).
   Confirm version sync (`npm run version:check`), CHANGELOG entry and
   `docs/releases/v<version>.md` exist and are listed in `scripts/validate-docs.mjs`.
3. **Gates on that SHA** — CI + security on all four targets, script contract tests,
   managed-toolchain workflow, required ignored fixtures. Pending/skipped/cancelled
   counts as not passed. Record run IDs in RELEASE_READINESS.md.
4. **Promotion** — only the user runs pushes to `main` and tags (the guard hook blocks
   them for agents). Give the exact commands, e.g. fast-forward main to the SHA,
   after re-checking develop has not moved and main has not diverged.
5. **Candidate packages** from main without publication; verify version, arch,
   checksums, updater signatures, notices.
6. **Tag + publish** on the same main SHA; channel/latest metadata **last**.
7. **Post-release** — verify public downloads and metadata; sync main back into develop.

Report each step as passed / failed / not run with evidence links.
