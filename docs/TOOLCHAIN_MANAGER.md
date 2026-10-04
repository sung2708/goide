# Managed Go toolchains

## Product contract and implementation plan

Goro must support both existing executables and an explicitly installed private Go,
gopls and Delve bundle. Downloading is optional, requires network access and never
changes the machine PATH, system Go or project dependencies. Existing executable
preferences remain available. Installing does not activate a bundle.

## Sources and versions

Initial candidate: Go 1.26.8, gopls v0.23.0, Delve v1.27.2. This is a pinned
candidate, not a claim of certification on every platform. Go archive SHA-256 and
byte sizes are copied from https://go.dev/dl/?mode=json on 2026-10-04.
Go comes from https://go.dev/dl/ (HTTPS redirect only to dl.google.com).
gopls and Delve are compiled with this Go using exact module versions,
proxy.golang.org and sum.golang.org. No `@latest`, project GOPROXY overrides,
GOFLAGS, automatic toolchain download, global GOBIN or shell script is used.
Their module dependencies require additional network transfer; the UI must not
present the Go archive size as the total install size.

## Safety and limits

Install under application data / toolchains. Create a UUID staging directory on
the same filesystem as the final bundle. Reject archive traversal, absolute paths,
links, duplicate files and excessive expanded data/entry counts. Check cancellation
between chunks and extracted files. Subprocesses use existing owned-tool cleanup.
Keep staging paths private and never accept arbitrary URLs/paths from IPC.
Only validated manifest IDs may be listed or removed. Removal cannot target the
configured bundle, a bundle used by a live tool, or a directory outside the store.
Close terminal sessions before removal: they may retain a previous tool environment.
Recovery on restart ignores unfinished staging folders; it never activates them.

Activation respects the existing Run/Debug/startup exclusion and stops old gopls.
Existing terminal sessions retain their launch environment; a newly started shell
receives the selected tool directories. Installing a new bundle never rewrites a
project's go.mod/go.sum. Project toolchain policy remains visible: managed setup
uses GOTOOLCHAIN=local; ordinary project execution retains its existing policy.

## Acceptance and release gate

- No-Go machine: setup -> create project -> completion -> Run/Test -> breakpoint.
- Existing/custom tool paths still work; install alone never changes them.
- Bad checksum, truncated archive, disk-full, interrupted download, cancellation
  during build and app shutdown leave the previous bundle usable.
- Restart lists completed bundles; persistence failure is visible.
- Cancellation is operation-bound; old cancellation cannot stop a newer install.
- Go/gopls/Delve version probes match the pinned versions. Debug permission and
  signing requirements on macOS must be checked on a real installed artifact.
- Windows x64, macOS x64/arm64 and Linux x64 each require their own evidence.
- Further catalogs/version choices, automatic background updates and an offline
  installer require separate audited catalog changes. No tool changes mid-session.

Source tests do not replace installer and native acceptance. Status and evidence
are recorded below as implementation progresses; this document does not authorize
a release.
