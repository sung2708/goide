# Develop validation and release promotion

Maintainer policy, 2026-10-04: validate the complete candidate on develop before
automatically promoting it to main and releasing from main. The immediate release
hold was lifted by the maintainer on 2026-10-04, with an explicit request to merge
develop into main and publish. Current preparation is experimental
`0.5.0-alpha.2`, following the published alpha.1; neither is a beta/stable acceptance claim. Required source checks still
must pass for the exact candidate; native acceptance limitations stay explicit.

## Required gates and order

1. Prepare complete functionality, documentation, version synchronization and
   reviewed release notes on develop. `0.5.0` is the requested complete milestone,
   not a version bump that can substitute for unfinished functionality or QA.
   Close or explicitly resolve every applicable gate in
   [release readiness](RELEASE_READINESS.md).
2. Run frontend, release contracts, security checks and native tests on Windows
   x64, Linux x64, macOS ARM64 and macOS Intel x64 for the **same candidate SHA**.
   Run required ignored real-tool fixtures explicitly; a skipped, cancelled,
   pending or failed required job cannot satisfy the gate. Record installer,
   recovery, shutdown and editor-performance acceptance for the declared matrix.
3. Only after every required gate succeeds, promote that exact develop commit to
   main automatically. Recheck that develop has not advanced and main has not
   diverged. If either changes, stop and validate the new candidate. Do not merge
   an unchecked branch tip or silently resolve conflicts in a release job.
4. Build and verify candidate distributables from main without publication,
   including exact version, architecture, checksums, updater signatures and
   shipped notices. If the main commit differs from the validated candidate,
   validate it again before proceeding. Main CI success is required too.
5. When release hold is lifted and all gates pass, create the immutable version
   tag on that exact main commit. Publish verified GitHub Release assets and
   version-specific metadata. Publish channel/latest metadata **last**, only
   after artifact URLs and the signed update payload have been verified.
6. Verify public downloads, Pages/CORS metadata and the updater/web consumer
   contract. Synchronize any main-only preparation or fixes back into develop.

The website changelog describes published main releases, never unshipped develop
work. Current-source feature descriptions must be labelled separately until their
installer is published. Failed publication must leave the preceding latest
metadata usable; retries must reuse the same candidate identity without moving
an existing tag or rebuilding under a different source commit unnoticed.

## Automation status and controls

This is the required automation contract. It is **not yet an implemented automatic
promotion workflow**. CI currently validates branch pushes; release.yml accepts
main dispatches or main-reachable tags. It does not automatically merge develop
into main after CI. Do not claim this document enables that behavior.

An implementation must default to a release hold, require the exact completed
develop CI SHA plus all other required checks/acceptance, serialize promotions,
respect branch/environment protections, and retain the source SHA through every
build/publication step. A plain CI completion event alone is insufficient. Source
tests must remain read-only; signing/distribution privileges belong only to the
guarded main release path. Fork/PR workflows cannot invoke privileged promotion.
Enabling promotion and enabling publication must be separate controls so a release
hold prevents tags/releases/metadata without disabling development CI.

Never enable this workflow during an active release hold. Manual maintenance is
subject to the same gates; it is not a shortcut around a failed develop pipeline.
