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
