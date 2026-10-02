## Description

<!-- Briefly describe the problem solved or the feature introduced. -->

## Type of Change

- [ ] `feat`: New feature
- [ ] `fix`: Bug fix
- [ ] `perf`: Performance improvement
- [ ] `refactor`: Code refactoring without behavioral change
- [ ] `docs`: Documentation updates
- [ ] `test`: New or updated tests
- [ ] `build` / `ci`: Build scripts, dependencies, or CI workflow changes
- [ ] `chore`: Housekeeping tasks

## Breaking Change

- [ ] Yes (please document the breaking change and migration path below)
- [ ] No

<!-- If yes, explain: BREAKING CHANGE: ... -->

## Testing Performed

- [ ] Frontend Vitest suite passed (`npm test`)
- [ ] Frontend build succeeded (`npm run build`)
- [ ] TypeScript checks passed (`npm run typecheck`)
- [ ] Version synchronization check passed (`node scripts/version-manager.mjs check`)
- [ ] Rust formatting / clippy passed (where applicable)

## Verification Checklist

- [ ] Commits adhere to [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] No temporary AI/agent scratchpads or planning files are committed
- [ ] Documentation has been updated to reflect code changes
- [ ] Security boundaries (Tauri IPC, process invocation, path normalization) are respected
