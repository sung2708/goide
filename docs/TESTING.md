# Testing GoIDE

GoIDE maintains a comprehensive automated testing suite to prevent behavioral regressions across editor operations, runtime inspection, and IPC communication.

---

## 1. Test Architecture & Coverage

The test suite is structured across two primary domains:

| Domain | Framework | Scope | Current Coverage |
|:---|:---|:---|:---|
| **Frontend** | Vitest 3 + React Testing Library + jsdom | Components, hooks, IPC mocks, editor interactions, layout | See the current `npm test` summary for suite and test counts |
| **Backend** | Rust `cargo test` | Filesystem operations, causal correlation, DTO serialization | Core Rust unit & integration tests |

---

## 2. Running Frontend Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npx vitest
```

### Run a Specific Test Suite
```bash
# Run editor shell symbol tests
npx vitest run src/components/editor/EditorShell.symbols.test.tsx

# Run find widget tests
npx vitest run src/components/editor/FindWidget.test.tsx

# Run branch switch dialog tests
npx vitest run src/components/panels/BranchSwitchDialog.test.tsx
```

---

## 3. Frontend Test Structure & Test Suites

Key frontend test suites in `src/`:

### Editor & Workbench
- **`src/components/editor/EditorShell.document-safety.test.tsx`**: Guards dirty-buffer persistence before file/workspace transitions, failed reads and saves, edits during pending I/O, autosave scope and cancellation, concurrent file opening, and save completion after unmount.
- **`src/components/editor/useWorkspaceFsSync.test.tsx`**: Verifies listener/start ordering, late startup cleanup, serialized workspace switching, failed IPC envelopes, Windows canonical paths, callback updates, and backend subscription disposal.
- **`src/components/editor/EditorShell.test.tsx`**: Tests workbench layout, keyboard shortcuts (Ctrl+P, Ctrl+Shift+F), panel toggles, and shell-first ergonomics.
- **`src/components/editor/CodeEditor.test.tsx`**: Tests CodeMirror 6 mounting, wheel event handling, selection ranges, and gutter markers.
- **`src/components/editor/FindWidget.test.tsx`**: Tests search input, replace input, case matching, whole-word matching, regex toggles, and navigation shortcuts (Enter, Shift+Enter).
- **`src/components/editor/DocumentOutline.test.tsx`**: Tests symbol tree extraction, keyboard navigation, and jump actions.

### Concurrency & Overlays
- **`src/components/editor/EditorShell.inline-actions.test.tsx`**: Tests counterpart jumping, Deep Trace activation, blocked goroutine indicators, and runtime polling recovery.
- **`src/features/concurrency/counterpartMapping.test.ts`**: Tests channel send and receive pairing logic.
- **`src/components/overlays/TraceBubble.test.tsx`**: Tests bubble rendering, confidence badge styling, and viewport bounding.

### Panels & Dialogs
- **`src/components/panels/BranchSwitchDialog.test.tsx`**: Tests dirty-file state detection, discard/stash actions, and commit confirmation guards.
- **`src/components/panels/DebugFailureDialog.test.tsx`**: Tests Delve launch failure notifications, error message formatting, and recovery actions.
- **`src/components/panels/SearchPanel.test.tsx`**: Tests workspace-wide text search, match highlighting, Replace, and Replace All.

### IPC & Infrastructure
- **`src/lib/ipc/client.test.ts`**: Tests Tauri invoke envelope wrapping, error deserialization, and mock response handling.

---

## 4. Writing Tests & Best Practices

1. **Avoid Flaky Timeouts**: Never rely on arbitrary `setTimeout` delays in tests. Use `waitFor` from `@testing-library/react` or Vitest async timers.
2. **Mock IPC Deterministically**: Mock `@tauri-apps/api/core` invocations cleanly using `vi.mock` to ensure tests run in isolation without requiring a native desktop host.
3. **Assert User-Visible Behavior**: Prefer testing through user-facing elements (`getByRole`, `getByText`, `findByLabelText`) rather than querying internal implementation details.
4. **Test Error & Degradation Paths**: Always test how components handle failed toolchains, disconnected shells, or malformed Go files.
5. **Control Polling Time**: Use Vitest fake timers for timeout/backoff assertions, advance time inside React `act`, and restore real timers after each test. Avoid waiting for real polling intervals or increasing timeouts to mask contention.

The default suite runs at most two workers to bound the memory and CPU cost of concurrent jsdom workbenches. `npm test -- --maxWorkers=1` can further reduce contention on constrained machines without skipping tests.

Run `node --test scripts/windows-installer-version.node-test.mjs` for the installer-version tests. They use Node's test runner separately from Vitest and cover Alpha/Beta/RC metadata conversion, malformed core versions, and MSI numeric field limits. CI and release preparation run these checks before builds.

Rust filesystem regressions in `integration/fs.rs` cover workspace-root protection and normal entry mutations; Unix-only tests cover symlink referents and dangling destination links. `integration/fs_watch/tests.rs` exercises a real native watcher against temporary files, polling fallback, duplicate subscriptions, teardown, and snapshot reconciliation. Tests use uniquely named temporary workspaces and never perform destructive root checks against a user's project.

Windows regressions also exercise real directory junction mutations, watcher traversal, and drive-relative rename destination rejection. A scan-failure regression verifies retry without another native event. LSP tests cover URI encoding, Windows canonical/UNC paths, disconnected readers, response/request discrimination, oversized frames, and termination of a real child process and reader thread.

The gopls integration test is opt-in because it requires installed Go and gopls. With both tools available, run `cargo test --manifest-path src-tauri/Cargo.toml --locked -- --include-ignored` (on Windows, `scripts\cargo_test_msvc.cmd --locked -- --include-ignored`). It verifies completion in a workspace path containing spaces, reserved characters and Unicode, checks unsaved buffer edits without modifying disk contents, and kills the actual server to verify recovery on the next request. Explicitly opting in without gopls fails the test rather than reporting success. Default CI runs the portable Rust suite; passing hosted CI does not establish that this tool-dependent test ran.

Git regressions use unique temporary working and bare repositories, never this source checkout. They cover NUL names/renames, staged plus unstaged content, unborn/detached repositories, index-preserving unstage/discard, staged-only commits, hook rejection/redaction, real index conflicts, binary/large diffs, merge-parent history, pinned pagination, explicit remote publish/fetch/fast-forward, non-fast-forward rejection and cancellation of a running hook. Frontend regressions cover transaction failures, stale responses, independent groups, commit message retention, diff navigation, virtual graph rows, parent-specific details, external edits/deletion and guarded close/Explorer flows. Native OS quit and complete process-tree cleanup remain manual/platform gates.

Conflict regressions generate a real divergent merge, compare actual stage-1/2/3 blobs, save without resolving, reject stale disk/index baselines, separately stage and explicitly commit the merge. Native Search fixtures cover Unicode, regex, case/word matching, globs, ignore rules, result budgets and cancellation races; replacement fixtures verify CRLF/EOF, literal dollar text, stale previews and traversal rejection. A Windows job test starts an isolated parent/descendant pair, lets the parent exit, closes the owning job and checks that an unrelated process remains alive. These tests never assign the test runner or the GoIDE repository to a destructive-operation fixture.

Owned-child regressions use temporary Windows process fixtures to verify descendant cleanup after the parent exits, explicit stop/reaping, immutable run identity and preservation of an unrelated child. Output regressions include long unterminated Unicode lines, CRLF, trailing partial lines and delivery-budget truncation. Delve regressions cover noisy startup with a bounded readiness queue and oversized protocol headers/bodies. These checks supplement, rather than replace, native Run/Debug and app-close smoke tests on supported platforms.

Quick Open regressions cover fuzzy matching, exact filename ranking, recent-file ordering, generated-tree exclusions, partial/root failures, cancellation, cache reuse, filesystem invalidation and stale workspace responses. Conflict draft regressions cover newer edits during both explicit and shutdown saves, retry baselines, and Explorer folder mutations affecting a retained non-active result.

Command regressions verify exact Windows/macOS modifier matching, disabled actions, native error envelopes, current command availability, modal/composition isolation and listener cleanup. EditorShell tests open/search/execute the palette, exercise existing debug and symbol shortcuts, preserve Run state after a failed stop, and wait for backend-observed pause state after a DAP acknowledgement.

Multi-document regressions exercise independent dirty tab buffers, reread avoidance, Save All baseline isolation and partial failure, newer edits during saves, explicit close/discard/cancel, failed close-save retry, workspace choice safety, native read-only UI, and existing branch release-gate transitions. CodeMirror tests round-trip real history/selection and verify that external content invalidates stale editor state. Native filesystem fixtures check read-only metadata and refused writes, scoped paths, binary/non-UTF-8 rejection and oversized text limits. Native multi-document desktop smoke checks and persistent session recovery remain outstanding.

## Problems validation

Problems tests cover actual diagnostic coordinates/codes, compiler paths with Windows drives and spaces, outside-workspace/traversal rejection, race stack exclusion, severity filtering, keyboard navigation, and stale row removal. EditorShell integration verifies that located gopls errors appear in Problems and disappear immediately when their buffer changes. Existing diagnostics polling, autosave, BottomPanel, and editor navigation tests remain applicable. Workspace-wide LSP and structured test/race diagnostics are not claimed complete.

## gopls teardown hardening

The persistent gopls process now owns its process tree through a synchronous native owner. Teardown terminates descendants even when the root exits first, reaps the root, then joins its bounded protocol reader. Explicit application shutdown propagates teardown failures. LSP headers are bounded at 16 KiB before allocation, duplicate Content-Length headers are rejected, and bodies remain bounded at 16 MiB. Windows tests verify scoped descendant termination, an unrelated process surviving, and repeated stop calls; parser and session teardown tests pass. This is lifecycle hardening, not completion of the addendum's language features or platform release gates.

## Workspace language queries milestone

Go to Definition (F12), Find References (Shift+F12), and Show Symbol Information are available through the shared command palette. They query the owned persistent gopls session, synchronize all open Go buffers including unsaved text, and close retired overlays. Located results open a workspace file at its reported UTF-16 line/column. Symbol information is displayed as plain text, including protocol Markdown, without executing markup. Edits, tab/workspace changes, closing results, and unmounting reject late frontend responses.

Requests validate scoped Go files and positions, limit the synchronized set to 100 documents / 4 MiB, bound returned locations, and share a 45-second query deadline to accommodate cold package loading. Tooling errors are visible. Locations outside the workspace are counted explicitly and cannot be opened by this view yet. Automatic hover tooltips, signature help, rename, formatting/imports, code actions, navigation history, and native query cancellation remain unfinished; this milestone does not complete the language-feature P0 or release gates.

Validation includes real gopls definition/reference/hover queries over unsaved changes across two files without writing disk, protocol content/location parsing, Windows URI normalization, frontend stale-response/error handling, and EditorShell F12 navigation to the returned file/detailed position. The implementation follows the [LSP 3.17 language feature specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#languageFeatures).

## Reviewed Format Document milestone

Format Document (Shift+Alt+F, also in the command palette) requests actual gopls formatting edits for the current unsaved Go buffer. A review dialog shows complete before/after source. Cancel leaves the buffer unchanged; Apply marks the edited buffer dirty without writing disk or changing its saved baseline. A later Save/Save All retains optimistic conflict checks. The shared document edit operation validates an entire proposed set before publishing any change, refuses changed snapshots/read-only files/invalid or duplicate paths/pending saves, and retains baselines for already-open and newly opened documents.

Native edit conversion validates UTF-16 positions, Unicode scalar boundaries, range ordering and overlaps, and the existing size limits. Reviewed controlled values synchronize immediately before the editor wrapper can defer them behind a typing timer. CodeMirror changes retain cursor placement through whitespace-only formatting and support Undo; other changes conservatively retain a clamped line/column. Applying a format retires stale diagnostics and completion requests. Tests cover real gopls formatting without disk writes, CRLF/Unicode/range safety, review cancellation and stale results, multi-file atomicity and baseline retention, real CodeMirror cursor/Undo behavior, and EditorShell format-review-save integration. Format on Save, Organize Imports, Rename and Code Actions remain unfinished. This milestone does not complete the addendum or release gates.

## Reviewed Organize Imports milestone

Organize Imports is available in the shared command palette and requests the actual `source.organizeImports` gopls code action for the current unsaved Go buffer. The same complete before/after review, Cancel, Apply-to-Editor, dirty-state and saved-baseline rules used by Format Document apply. No handwritten import sorter or implicit disk write is used. Empty returned edits are described as no changes returned by gopls.

The persistent session tracks the versions it sends for each open document. Both WorkspaceEdit `changes` and versioned `documentChanges` are accepted for the requested file; stale versions, other files, overlaps and resource operations are rejected before applying. Disabled actions show their returned reason. Unresolved actions may be resolved through gopls; actions requiring unsupported command execution or multiple-choice selection report that limitation. Automatic import organization on Save and the broader Code Actions chooser remain unfinished.

Validation includes real gopls adding a missing fmt import and removing an unused os import from unsaved text without writing disk, version/path/resource-operation rejection, palette review/Cancel/Apply integration, and completion/server-teardown compatibility. See the official [gopls code transformation documentation](https://go.dev/gopls/features/transformation).

### Reviewed symbol rename checkpoint — 2026-10-03

F2 and Rename Symbol use gopls prepareRename/rename against current Go buffers. Preview captures affected closed Go files, synchronizes their immutable overlays, and requests the edit again before showing complete before/after text. Apply validates the whole document snapshot and changes all buffers in one publish; Save/Save All retain original disk baselines and external-change checks. Cancel, stale responses, invalid identifiers, read-only files, out-of-workspace edits, stale document versions and unsupported resource operations never apply partial edits.

Budgets: 100 source documents / 4 MiB, 8 MiB preview, 10,000 edits per file. Package/file renames and broader transformations are explicitly unsupported in this checkpoint. Edits resolve UTF-16 positions once and build each changed document linearly. This checkpoint does not complete the addendum or authorize a release/tag.

### All-open-document disk synchronization — 2026-10-03

Workspace watcher revisions and window focus now inspect inactive open tabs as well as the active document. Clean inactive buffers reload changed disk content; dirty or deleted buffers remain intact and appear in an accessible Review list. Selecting a conflict activates that document's existing disk/editor review. Failed reads retain conflict evidence and never masquerade as deletion. Reads are invalidated on workspace/tab transitions and unmount; edits, newer save baselines and pending Git/Explorer/save operations prevent stale reloads. Blocked operation transitions trigger a new scan. Checks are sequential and bounded by the 100 open-document cap and native file read limits.

This checkpoint adds detection for inactive tabs, not crash recovery or Save As. No release/tag is authorized by this checkpoint.

### Bounded one-shot tool ownership — 2026-10-03

The gopls check/symbols/completion CLI fallback and Go/gopls/Delve version probes now use an owned synchronous child tree. They drain stdout/stderr concurrently with a 2 MiB limit per stream, accept at most 4 MiB stdin, run for at most 45 seconds, and terminate descendants on success, timeout or app shutdown. Truncated output is reported as failure instead of complete diagnostics. Pipe workers participate in the shutdown registry; shutdown waits for them or returns an error and keeps the window open. gopls diagnostic/symbol targets must be scoped regular files and are passed as canonical absolute paths.

Windows checks cover execution deadline, retaining an unrelated process, and stopping descendants after the root exits. A real gopls CLI test preserves a located diagnostic in a Unicode/space path and rejects traversal. macOS/Linux execution and complete PTY ownership remain separate release-gate work. No release/tag is authorized.

### Native commit history search — 2026-10-03

Git Graph now offers message, author and commit-hash search backed by repository Git history, including commits not yet loaded in the graph. Message searches include full commit bodies; message/author patterns are literal and case-insensitive. Search pages pin ref tips and return 100 results, with a 2000-result UI cap and 10,000-result offset safety limit. Hash search requires a 7–64 hex-character ID, which Git resolves and verifies as a commit; ambiguous/missing objects surface errors. Search uses read-only commands, suppresses notes/signature/decorations, and preserves the graph's complete loaded topology. Selecting a result opens the existing commit details and parent-based diff workflow. Edits to search input, workspace switches, graph refresh and unmount invalidate stale results.

Real repository tests cover literal regexp metacharacters, full-body matches, author identity, hash validation, pagination and refs changing after the pinned search. This is not completion of stash, rebase, hunk staging or the release gate. No tag/release is authorized. Native matching follows [Git log documentation](https://git-scm.com/docs/git-log).

### File history checkpoint — 2026-10-03

Each Source Control status row offers History, which opens a native file-history search and existing commit details/parent diff workflow. File paths remain literal Git pathspecs, preserve significant spaces, and reject traversal/root aliases; they are not glob patterns. Git follows detectable renames and supports deleted files. Results retain the existing pinned scope, pagination, stale-response protection and safety limits. History actions never save, stage or change files. The searchable history list preserves the full graph layout instead of inventing edges among filtered commits.

Real repository tests cover renames, deletion, skipped-result pagination and a bracket-name glob collision. UI tests verify exact row-to-request routing without a mutation or save transaction. Broader Git actions, PTY teardown, native language cancellation and other addendum requirements remain unfinished; no release/tag is authorized.

### Failed and pending shell teardown — 2026-10-03

PTY root kill/wait failures now propagate instead of being discarded. A failed cleanup restores the session and surface mapping, retaining scrollback for retry. Potentially blocking stop/reap work runs outside the async runtime with an owned registry guard; an IPC timeout does not release that guard or permit a replacement shell to race with unfinished cleanup. App shutdown disposes each recorded session through this same path and keeps the window open on failure. Registration waits, shell-registry waits and stop/reap acknowledgement each have a 10-second response deadline; timing out leaves the lifecycle start gate closed while cleanup can be retried.

Native tests cover stop failure/retry with preserved output, pending reaping across timeout, and a timed-out shutdown rejecting new registrations. This checkpoint does not establish complete per-session descendant teardown or joining every PTY reader on all platforms; those remain release-gate work. No tag/release is authorized.

### Reviewed language cancellation checkpoint (2026-10-03)

Verified 25 frontend tests across language cancellation, queries, edit reviews and EditorShell diagnostics. Coverage includes captured workspace IDs, supersession, old completion not clearing a newer token, document changes, close/unmount and cancellation error reporting. Twelve native language tests passed with installed Go/gopls, including cancellation before registration, scope isolation, shared deadline, a pending protocol receive, a queued query blocked by the server mutex, actual unsaved-buffer queries and formatting. A deterministic cancelled receive kept the same real gopls PID usable for another query and left disk unchanged. Clippy with warnings denied passed. This is a focused checkpoint, not release certification or proof of automatic completion cancellation.

### Terminal ownership checkpoint (2026-10-03)

Windows real-PTY fixtures verify descendant termination after root exit on both explicit wait and owner drop, while an unrelated process remains alive. A real terminal disposal test exercises forced shutdown and an interactive shell natural exit, observes the root independently of EOF, closes the console and confirms its reader has finished before returning. Failure/retry tests retain mappings and scrollback; timeout tests retain ownership while either reaping or reader join is pending. The native shell group contains 18 passing tests. Cross-platform full-session descendant cleanup and pre-registration Windows startup descendants are not certified by these fixtures. Frontend degraded-exit events preserve the old identity and show cleanup failure; Retry completes disposal before requesting a replacement. Twenty-nine terminal/close frontend tests passed, including failure followed by successful cleanup.

### Completion cancellation checkpoint (2026-10-03)

Thirty-one frontend language/completion tests passed, including EditorShell command routing and completion DTO scope. Native tests verified that a completion waiting behind the gopls mutex cancels within the test's one-second bound without falling back to CLI, and that a running real CLI tool observes cancellation and stops promptly. The installed gopls completion fixture passed real fmt completions, unsaved strings completions and recovery after a server crash. Production build passed. This verifies completion cancellation, not every remaining language feature or release readiness. The complete native suite also passed: 187 tests, zero failures, seven opt-in tests ignored; installed-gopls completion was run separately and passed. Clippy with warnings denied and document link validation passed.

### Editor hover checkpoint (2026-10-03)

Sixty-six frontend tests passed across hover, CodeEditor and EditorShell language routing. Tests verify live active-buffer replacement alongside unsaved sibling tabs, UTF-16 positions, cancellation, stale responses, word anchoring, escaped markup, explicit display truncation and non-modal/non-mutating EditorShell routing. The native gopls hover path uses the previously verified real-language query implementation; this slice introduces no new native command. Type checking passed. Signature help and full desktop manual validation remain separate gates.

### Signature Help checkpoint (2026-10-03)

Three native signature tests passed including a real installed-gopls query that identified the second argument from an unsaved buffer and left disk unchanged. Parser tests cover active-parameter overrides/defaults, absent parameters, ambiguous labels, UTF-16 astral ranges, invalid/reversed ranges and text budgets. Clippy with warnings denied passed. Seventy-two frontend language/editor/command tests passed; an additional focused test confirms explicit signature invocation, a null gopls response dismissing help and no continued queries outside that context. Real CodeMirror tests exercise debouncing, extension reconfiguration, aborted old requests and Escape. Hook tests exercise stable callback identity, current unsaved overlays, stale snapshots, cancellation and genuine tooling failures. Production build passed. These are focused feature checks, not release certification.

## Reviewed Code Actions validation (2026-10-03)

Frontend checks cover captured overlays/diagnostics, actual action selection, unsupported reasons, cancellation on close/unmount/context changes, honest native errors, editor-only atomic application, and the `Mod+.` command through EditorShell followed by baseline-preserving Save. Native checks cover bounded real action descriptions, stale/ambiguous selections, UTF-16 diagnostic ranges, duplicate workspace edits/resource-operation rejection, and the edit-only lazy-resolution allowlist.

Explicit opt-in tests use installed Go/gopls to obtain Organize Imports and lazy Fill Struct actions, resolve/preview actual edits, and verify that the original disk files remain unchanged. Run `scripts/cargo_test_msvc.cmd integration::code_actions -- --include-ignored --test-threads=1` on Windows. These checks do not substitute for the unfinished release/platform acceptance matrix.

## Terminal workspace cleanup validation (2026-10-03)

Regression tests cover failed disposal retention and selective retry, pending creation followed by retired-child disposal, changing roots during serialized cleanup, failed setup without phantom sessions, visible errors after closing a workspace, blocking replacement sessions until acknowledgement, late setup after unmount, inactive successful exits, and preserving sessions/scrollback across file switches. Existing editor terminal and safe-close checks also pass. The lifecycle owner is tested independently of React, and the terminal output hook retains frame batching/cancellation coverage.

These frontend checks complement the previously tested native PTY stop/reap/reader-join workflow. They do not establish Unix descendant containment or close the full platform release matrix.

## Settings and save preparation validation (2026-10-03)

Regression checks cover validated defaults, legacy-theme migration, persistence and storage failures, corrupt/future-version profile protection, searchable controls, numeric editing, explicit Reset, Settings keyboard routing, Auto Save Off/focus mode, ordered imports/format, original-baseline writes, stale source cancellation, unmount/explicit cancellation, failed preparation and retained prepared drafts after disk failures. Terminal font preference changes preserve the live terminal instance. The production frontend build passes. Automated frontend coverage complements existing native edit/write checks; desktop manual acceptance and the complete release/platform matrix remain outstanding.

## Stash validation checkpoint (2026-10-03)

Twenty native Git tests and sixty-five affected frontend checks pass; Clippy with warnings denied, type checking, docs validation and the production build pass. Real Git repository tests exercise list metadata and actual patches with Unicode/space paths, staged versus working content restoration, untracked inclusion, ignored-file retention, unborn-HEAD rejection, Apply retention, successful Pop of an older entry, confirmed-drop backend selection checks, shifted-reference rejection and conflicted Pop with retained stash/unmerged status. Frontend regressions cover actual metadata/diff, confirmation cancellation, restore-index choices, retained failed-creation messages, busy cancellation, empty/limited lists, stale workspace responses, repeated command view requests and shared save/run guards. A failed file mutation invalidates repository/file state rather than treating failure as proof of no changes.

The previously passing full frontend suite contained 612 tests across 81 files; this slice adds focused Git/transition checks and a fresh production build. These checks do not certify the outstanding desktop/platform release matrix or concurrent external stash-ref operations.

## Toolchain information validation checkpoint (2026-10-03)

Explicit installed-Go/gopls/Delve probes verify actual absolute executable paths and version output, including the separate Delve Version line. The default native suite passed 199 tests with 11 tool-dependent checks ignored; three installed-tool checks and eight real-gopls query/edit/cancellation checks also pass separately. Thirty-four affected frontend tests, Clippy with warnings denied, type checking and production build pass. Native tests distinguish missing executables from launch failures. Frontend checks cover returned paths/status/errors, refresh after genuine rejection, obsolete responses and unmount, dialog pending/errors, status-bar and command-registry routing, and browser-native-required IPC. The production frontend build passes. Executable-resolution changes are also checked against native process, Git, watcher and filesystem regression coverage; the desktop/platform matrix and executable configuration remain outstanding.

## Executable preferences checkpoint (2026-10-03)

PASS: native path validation rejects relative paths, directories and NUL input; installed Go configuration selects the exact executable and supplies its directory to child tools. Real Go/gopls/Delve probes preserve concrete paths/version output and distinguish missing from failed executables. A real owned running child blocks profile replacement and is explicitly stopped/reaped by the test. Six selected native checks (including the installed-Go check) and Clippy with all targets pass.

PASS: affected frontend tests cover committing path drafts, persisted Debug/Git preferences, initial Source Control view, failed native configuration, serialized application, obsolete queued preferences, retry after failed IPC and tool-inspection request invalidation. TypeScript and production build pass.

NOT RUN: complete desktop/platform/tool-version matrix, interactive executable switching during debugger sessions, cross-window configuration contention and the full release acceptance suite. These results do not establish release readiness.

## Early terminal-exit regression (2026-10-03)

A full frontend run exposed a real ordering bug: shell exit could precede the setup acknowledgement, causing a dead shell to appear connected. The fix retains a bounded event ledger until the returned ID can be checked. PASS: 40 terminal view/ownership/ledger tests, including deterministic early exit and degraded cleanup on initial setup, early exit during retry, failed-cleanup retry, bounded event retention and existing workspace transitions. TypeScript and production build pass. Cross-platform desktop process-tree acceptance remains NOT RUN.

## Go project inspection checkpoint (2026-10-03)

PASS: three native checks, including an installed-Go fixture that detects a non-module directory, a single module and a two-module go.work without writing project/module/sum files. Scope checks reject parent/absolute/NUL contexts, recognize Go null-file sentinels and report external modules without parsing their contents. Clippy with all targets passes.

PASS: five project hook/dialog tests cover native cancellation on context changes/unmount, stale results, configuration errors, explicit retry and actual module/environment display. Command-navigation and IPC suites pass (18 tests), as do the diagnostics/terminal/project regression suites (58 tests). TypeScript and the production build pass. The terminal fixture now resets queued mock implementations, and the cold Problems-panel integration test waits for its lazy import explicitly.

The preceding full frontend rerun had six failures in diagnostics and terminal tests; those affected suites subsequently pass after the regression fixture/wait fixes. A fresh full-suite PASS is not claimed by this checkpoint. NOT RUN: complete desktop/platform matrix and full release acceptance. Tidy/download, structured tests, debugger inspection and other addendum/Git workflows remain unfinished.

## Git refresh integrity regression (2026-10-03)

PASS: 35 affected checks across workspace Git state, legacy IPC, branch switching and release-gate branch/document safety. Coverage includes rejected/partial refreshes with original error details, stale roots and superseded reloads, retry after failure, timer removal on disposal, native-only browser results and preserved native mutation arguments. Branch-switch verification checks the actual reloaded branch rather than requiring duplicate startup requests.

The preceding full frontend baseline passed 88 files and 639 tests. That baseline predates the subsequent module-command and Git-refresh changes; it does not certify the complete addendum or release gate. Complete desktop/platform acceptance remains NOT RUN.

## Explicit module command regression (2026-10-03)

PASS: six native project/module checks including a real installed-Go fixture for tidy/download and stale/outside workspace rejection; two native cleanup checks verify invalid identities never acknowledge cleanup and owned CLI termination clears the registration guard. The Go resource guard rejects module operations while Run/Debug owns resources. Cargo Clippy passes.

PASS: module hook/panel/IPC/document integration checks cover Save All failure, retained merge-result preservation failure, cancellation during preparation/execution, duplicate starts, stale roots, actual failed output and retained locks until native cleanup confirmation after IPC transport failure. TypeScript/production-build and full frontend results are tracked separately; these focused checks do not certify release acceptance. The shell integration tests allow time for the real lazy UI under concurrent native compilation.

NOT RUN: complete desktop/platform acceptance, external concurrent manifest replacement/hard-link races and the remaining addendum/Git feature matrix. These checkpoints do not authorize release tags.

Full frontend regression PASS: 94 files and 666 tests. TypeScript, production build (248 modules), version synchronization and documentation links also pass. This verifies the current regression suite, not the unrun desktop/platform release matrix.

## Structured Go test regression (2026-10-03)

PASS: native fixture checks actual scoped package execution from a parent without go.mod, exact selection, skipped/failed tests, two go.work modules and build failure output. Unit checks reject invalid test filters and pre-cancelled requests before launching Go. Additional checks cover missing test selections, empty package directories and cancellation after a running test binary writes its start marker.

PASS: parser/hook/dialog and IPC checks cover interleaved native events, old/new Go build failures, safe package-relative locations, malformed/unrelated output, bounded output disclosure, actual exit results, native-only execution, configuration failure/cancellation, stale workspace outcomes and held locks through failed transport cleanup. The editor test suite preserves dirty buffers and merge drafts after failed Save All and prevents editing/close until native cancellation completion. The adjacent module/debug regression suites pass (33 checks before the final preflight assertions); final hook/IPC checks pass (14 tests). TypeScript and the production build pass (251 modules).

The preceding full frontend baseline passed 94 files and 666 tests before this test-runner slice. Live streaming, CodeLens/Debug Test and complete platform acceptance remain NOT RUN. Existing cross-platform process ownership limitations and concurrent filesystem races are not certified by these focused checks; release remains gated.

Native test-runner fixture/unit rerun PASS (3 checks, including live binary cancellation and missing/empty selections). Cargo Clippy --all-targets also passes for this slice.

## Retained native cleanup regression (2026-10-03)

PASS: Windows checks retain handles through injected stop failures, retry cleanup idempotently, reap descendants after root exit and leave unrelated children alive. Bounded tool output tests cover deadline, scoped cancellation, descendant pipes and output limits. Process/Job suites pass (9 checks), including observed natural completion and rejecting obsolete owner identities. Native cleanup identity/gate checks pass (2 tests).

PASS: four frontend suites pass 20 tests for module/test cleanup, including structured cleanup-pending responses retaining document ownership until successful confirmation. TypeScript and production build pass (251 modules).

Linux/macOS execution is NOT RUN on this Windows host. Unix synchronous cleanup now uses checked process-group signals and probes, avoids re-sending numeric group signals during retained retries, and retains uncertain handles. This is not certification of every Unix identity, zombie, descendant or PTY case. The full release/platform gate remains incomplete.

Final ownership filter PASS: 15 native tests, with one installed-Go module fixture ignored by this filter (previously run separately). Coverage includes Git-hook cancellation, synchronous trees/retention, async Run jobs, PTY ownership/readers/reaping, tool configuration ownership and native module cleanup. Cargo Clippy --all-targets passes without the retired Windows fallback warning.


## Observed DAP regression (2026-10-03)

PASS: 15 native Delve checks, explicitly including the installed Go/Delve fixture. The fixture launches a real module, registers line 4, completes configuration, observes a stopped event and reads an actual frame at line 4 before disconnect/owned cleanup. Protocol checks cover configuration capability negotiation, fast breakpoint events preceding acknowledgements, mismatched-response stream poisoning, partial-frame deadlines and bounded framing.

PASS: 22 tests across EditorShell.debug and DebugFailureDialog, including waiting for observed pause state, start/stop guards and stop-error recovery. Native all-target Clippy passes without warnings.

These checks do not establish complete debugger inspection, failed-stop retention or Linux/macOS acceptance; the release gate remains closed.
