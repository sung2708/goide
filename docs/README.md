# Goro documentation

These are maintained guides and contracts for users, contributors and maintainers.
Source capabilities do not imply acceptance of a shipped installer.

## Using Goro

- [Product scope](PRODUCT.md)
- [Navigation and search](NAVIGATION_SEARCH.md)
- [Managed Go toolchains](TOOLCHAIN_MANAGER.md)
- [Document copies and recovery](DOCUMENT_RECOVERY.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Brand assets and licensing](BRAND.md)

## Contributing

- [Development and scope constraints](DEVELOPMENT.md)
- [Build instructions](BUILDING.md)
- [Testing](TESTING.md)
- [Architecture](ARCHITECTURE.md)
- [Engineering rules](ENGINEERING_RULES.md)
- [Roadmap and exit criteria](ROADMAP.md)
- [Repository instructions](../AGENTS.md)
- [Security policy](../SECURITY.md)

## Releasing and website integration

- [Version policy](VERSIONING.md)
- [Develop-to-main promotion gates](RELEASE_PROMOTION.md)
- [Release readiness](RELEASE_READINESS.md)
- [Release runbook](RELEASE.md)
- [Distribution setup](RELEASE_SETUP.md)
- [Secure updates](UPDATES.md)
- [Website/updater metadata contract](RELEASE_METADATA_REPORT.md)
- [Changelog](../CHANGELOG.md) and historical notes in [releases](releases)

## Documentation policy

Track durable behavior, user/contributor instructions, architecture, security and
release contracts. Keep AI prompts, brainstorming, intermediate implementation
plans, per-session QA reports and raw logs in `.local/working-docs/`, which is
ignored by Git. Keep unresolved release gates in RELEASE_READINESS.md rather than
hiding them with the local evidence. Never turn a scoped test result into a claim
of full-suite or installed-app acceptance.

The cleanup archive is local at `.local/working-docs/2026-10-04/docs/`. A local Git
bundle preserves history before cleanup. Published release notes and the
repository changelog are preserved unchanged; temporary reports are removed from
tracked history as requested by the maintainer.
