# Goro Navigation and Search

This subsystem is local and deterministic. It shares the document model and existing workspace write/transaction boundaries. Its P0 acceptance gate remains open; it does not authorize a release or tag.

## Existing functionality preserved

Explorer, tabs, saves, external-file review, gopls transformations, diagnostics, Go execution/tests, debugging, terminal, Source Control, Git Graph, settings, session restoration and theme tokens retain their existing owners. Native manual regression acceptance is separate from automated checks.

## Quick Open

Ctrl/Cmd+P opens the shared Quick Pick. Basenames are prominent and directories secondary; exact/prefix, boundary/camel and fuzzy matches rank before secondary path matches. Matching characters use original UTF-16 offsets. Bounded recent files are local per workspace and invalidated against a complete refreshed index. Filesystem revisions invalidate the cached index. A single cancellable native call indexes filenames without reading source contents. Quick Open and Search share an ignore-aware walker: nested .gitignore/.ignore rules, negation, generated-tree exclusions and no-follow-link traversal. Canonical path checks reject files escaping the workspace. Budgets are 20,000 files, 40,000 visited entries, depth 64, five seconds and 4 MiB of path text; incomplete indexing and unreadable paths are visible. Closing the picker, replacing the index or switching workspace cancels native work by request identity and rejects late results.

Worker ranking prepares the index once, keeps one in-flight query and the newest pending query, and rejects obsolete results. Workers retire with index replacement; a five-second failure/deadline exposes a bounded 2,000-file fallback. Results are capped at 200. Native UI latency/memory acceptance remains unfinished.

## Find in File

Ctrl/Cmd+F, F3 and Shift+F3 use the editor's registry-backed find handlers. Literal matching uses CodeMirror. Regex runs in an owned Web Worker with a one-second deadline, 4 MiB document/replacement-expansion limits, 4,096-character patterns, 64 KiB replacement text and 2,000 matches. Query/document changes cancel the worker; stale responses cannot act on a new document. Invalid regex retains prior valid highlights where the document is unchanged, with replacement disabled. Match coordinates use UTF-16; whole-word regex respects Unicode letters, numbers, marks and underscore. Closing Find clears its decorations and restores editor focus. Ordinary document edits rescan without selecting text under the user's cursor.

## Replace in File

Ctrl/Cmd+H opens the same find/replace surface. Replace acts only on the current exact selection and immutable scanned document; stale ranges and read-only documents cannot mutate content. Literal replacement preserves dollars and backslashes. Regex uses numeric/named captures ($1, ${name}, $0 for the entire match) and $$ for a literal dollar. Capture expansion uses complete document context, including lookbehind. Replace All applies one isolated history transaction; reaching the result budget disables bulk replacement. Zero-width iteration advances by Unicode code point.

## Workspace Search

Ctrl/Cmd+Shift+F opens native cancellable search. Query whitespace is significant. Regex uses Rust's bounded non-backtracking engine. Basename globs such as *.go apply to nested files; slash patterns are relative workspace paths. Gitignore and generated-tree exclusions, binary/unsupported text checks, file/time/byte/result budgets and no-follow-link traversal remain native responsibilities. Results return exact UTF-16 ranges; previews highlight those ranges rather than interpreting a regex on the UI thread. Typing does not open files or steal focus. Selected results guard query generation, root/file identity and the current editor line preview before exact-column navigation. The editor highlights the returned range, and transient marks are cleared when Search is left or its query changes.

Budgets: five seconds, 20,000 scanned files, 64 MiB input, 1 MiB per file, 200 result files and 2,000 matched ranges. Matching lines beyond 8,192 bytes are omitted explicitly. Results are grouped by matching line and ordered by path/line. Search is disk-based; dirty-buffer overlays and streamed partial results remain unfinished. An unreadable file currently fails the search rather than producing a partial error report.

## Workspace Replace

Ctrl/Cmd+Shift+H opens workspace replacement. Search result ranges restrict the exact replacement scope, including result truncation within a line. Preview reads complete before/after text and never writes disk. Matching dirty editor files block preview/replacement; no automatic save is performed to prepare it. The existing document transaction prevents editor/filesystem races during review. Review includes file counts, occurrences, full before/after and file exclusion; an empty selection cannot apply.

Each selected file is written atomically against its complete expected disk baseline. Existing native scope, encoding, read-only and permission checks remain authoritative. CRLF, EOF and UTF-8 BOM survive text replacement. Failure stops the remaining batch and reports how many files were saved; previously saved files are not falsely rolled back. There is no advertised workspace-wide Undo. Budgets are 100 files, 256 KiB input per file, 512 KiB output per file and 4 MiB preview. Regex captures use Rust replacement syntax ($1, ${name}, $$); regex dialect differences from in-file JavaScript are intentional and must remain visible in future UX work.

## Command Registry

Unique command IDs are validated. Shortcuts and palette execution share current handlers, disabled reasons and error handling. Re-entry of a pending command is ignored. Explicit global picker shortcuts work from text inputs; other shortcuts do not steal typing/composition/terminal input. Registry migration of all real Git and toolbar actions remains unfinished.

## Command Palette

Ctrl/Cmd+Shift+P fuzzy-ranks title, category and secondary command ID. Actual matched title characters are underlined. Prefix/exact title matches outrank secondary ID matches. Bounded local session history records successful command IDs only, up to 30; neither query nor source text is stored. Disabled actions retain their explanation and cannot execute. Shortcut labels derive from registry bindings.

## Quick Pick infrastructure

Quick Open and Command Palette share compact combobox/listbox semantics, Up/Down, Page Up/Down, Ctrl/Cmd+Home/End, Enter, Escape, active-item scrolling, disabled explanations and optional descriptions/icons/details. IME cannot select a result or dismiss a composing picker. Focus restoration avoids a detached element or newly opened modal. Branch, theme and symbol migration remains pending.

## Go to Line

Ctrl/Cmd+G accepts a positive line or line:column. Oversized values clamp against the current document; invalid or unsafe integers cannot navigate. Workspace/file changes close the picker. Document-operation gating and existing editor jump/focus handling are reused.

## Symbol Navigation

Existing document-symbol navigation is preserved. Dedicated gopls Document/Workspace Symbol pickers and Ctrl/Cmd+Shift+O are not complete.

## Navigation History

Recent files/workspace/tab restoration exists. Source-jump Back/Forward history is not complete and must not be confused with document Undo.

## Tests added

Ranking covers title/ID order, noncontiguous matches, camel boundaries, Unicode case expansion, UTF-16 offsets and bounded recent commands. Picker tests cover registry execution, disabled actions, composition and page navigation. Worker tests cover query coalescing, stale responses, termination, deadline and cancellation. A real CodeMirror EditorState/history test verifies literal Unicode replacement and one-step Undo. Workspace checks cover whitespace, dirty authority, stale baselines, per-file exclusion, CRLF/BOM, capture replacement and unlisted-range preservation.

## Performance

A synthetic 20,000-file ranking harness separates preparation from warm queries. Measurements are machine/load dependent and describe the ranking function, not end-to-end picker/editor latency. Initial cold measurements were 651–1,032 ms; preparing reusable index data reduced measured queries to 149–294 ms in the recorded local run. Native large-workspace index startup, rendering latency, memory and editor typing/scroll latency have NOT RUN acceptance.

## Accessibility

Combobox/listbox ownership, active-descendant selection, screen-reader counts, keyboard paging, disabled explanations and non-color-only match underlining are implemented. Native screen-reader/manual acceptance is NOT RUN.

## Security / Privacy

Queries/replacements remain local; no cloud index, embedding service, shell interpolation or query telemetry was added. Worker messages contain only local runtime data. Native writes retain canonical workspace scope and expected-content validation. Bulk-replace tests use isolated temporary workspaces. Unsupported encodings must never be reinterpreted during replacement.

## Windows Validation

Automated native search/replacement fixtures cover space/Unicode paths, UTF-16, literal replacements, captures, CRLF/BOM, stale previews and exact selected ranges. Broader MSVC integration checks preserve existing Git/process/document tests. Native desktop walkthrough, installer and manual performance acceptance are NOT RUN.

## macOS Validation

Local native execution is unavailable. The preceding navigation checkpoint a73233a passes hosted macOS verification in CI run 37127665455, along with Windows/Linux/frontend. The native-index revision requires its own hosted verification.

## Linux Validation

Local native execution is unavailable; hosted CI must validate this source revision. Previous source revisions passing Linux do not constitute validation of these changes.

## Remaining P0

Complete central action migration; complete-match keyboard iteration and native navigation/focus acceptance; full workspace overlay/stale-result and partial-failure acceptance; replacement per-file outcomes/recovery UX; complete end-to-end large-workspace/desktop acceptance; hosted platform matrix for the current revision. P0 is not complete.

## Remaining P1

Dedicated gopls symbols; source-jump Back/Forward history; bounded search history; per-file replacement actions; match exclusions; Open to Side; shared text-diff preview; branch/theme/symbol Quick Pick migration. Recent commands/files and file exclusion are implemented but do not close all P1 work.

## Remaining P2

Advanced query syntax/scopes, result persistence and richer replacement preview remain deferred until P0 is reliable.

## Known Issues

In-file regex is JavaScript; workspace regex is Rust (unsupported constructs fail visibly). Workspace results are grouped by line; the per-line replace action targets its first returned range. Search is disk-based and does not display unsaved overlays. Workspace replacement has no global Undo and stops at the first write failure.

## Validation

Automated checks are reported in TESTING.md with their scope. Manual acceptance and unexecuted platform checks are NOT RUN or BLOCKED BY ENVIRONMENT, never PASS. No release/version/tag operation is part of this implementation.
