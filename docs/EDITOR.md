# Editor architecture and behavior

This describes the Monaco implementation on develop. It is not an announcement
of a published installer or completion of the release acceptance matrix.

## Ownership

`DocumentSession` owns document text, baseline, dirty/read-only state and save
transactions. `CodeEditor` mounts one Monaco editor. `features/editor/MonacoModels`
owns file models, undo stacks and view state; switching tabs switches models.
Closed tabs and replaced workspaces dispose models. Do not recreate the editor
for callback or theme changes, or call `setValue` on every React render.
Reviewed edits and external reloads enter undoable model operations. Save
acknowledges only the written snapshot; later edits remain dirty.

File URIs preserve Windows drives, UNC roots, spaces and Unicode. All editor/LSP
columns and offsets use UTF-16, not UTF-8 bytes. Models preserve LF/CRLF.
The file BOM remains in `DocumentSession` and is restored for change/save
callbacks; the visible Monaco model excludes it. Business cursor offsets include
the BOM, while provider positions use the exact visible source sent to gopls.

## Language and execution

Local snippets and gopls completion are separate Monaco providers. Automatic
suggestions have no artificial editor delay. The adapter preserves replacement
ranges, additional import edits, sorting/filtering, preselection and commit
characters. Completion, hover and signature results are rejected after a model
version change, tab switch, cancellation or disposal. Native requests use the
existing UUID cancellation bridge. Completion and diagnostics synchronize exact
open Go buffers without saving them to disk.

Monaco uses Invoke for both automatic suggestions and Ctrl+Space. Package-member
previews must therefore work for Invoke too. Gopls lists are marked incomplete
so further prefix typing requests fresh results. The completion hook cancels on
workspace/file ownership changes; Monaco cancellation tokens own edit cancellation.
Do not cancel a just-typed request merely because React commits that same text.
Model changes also cancel captured queries for older versions immediately, while
retaining any query already started for the current version by another listener.
Function-declaration snippets do not wait for a native query. Exact nonempty
completion results may be reused for 500 ms only for the same model version,
cursor and callback; a cache hit does not extend that lifetime. Empty/stale results
are not cached. Typing inside snippet placeholders keeps quick suggestions enabled.
Name placeholders on lines with an existing parameter list do not offer snippets
that would insert a second function body.

Autosave (after delay or focus change) writes the exact draft without format or
organize-import preparation. Explicit Save/Save All retains those preferences.
If gopls rejects incomplete Go with a recognized parser error, explicit Save
persists the original draft unchanged; diagnostics report syntax problems.
Operational tooling errors and stale edit plans still block prepared saves.

Diagnostics debounce edits by 180 ms. File opening/switching is requested by the
shell to avoid duplicate initial pulls. Save does not wait for diagnostics.
Unsupported gopls pull diagnostics report unavailable instead of repeatedly
restarting the server. Markers have separate language, race and test owners.

Formatting, organize imports, rename, code-action review, definition/references,
Run/Test/Debug, dirty guards and filesystem writes remain Goro workflows.
Entry-action buttons only execute against the analyzed snapshot. Go tool
preflight caches positive readiness for at most 30 seconds and rechecks missing
requirements. Tool settings or workspace changes invalidate the cache identity.

## Search, Markdown and Vim

The existing Find UI uses the bounded search worker for both literal and regex
queries. Invalid patterns retain previous highlights only for the unchanged
document and disable replacements. Ordinary edits rescan without moving the
caret. Replace uses an isolated undo group and refuses read-only/stale/limited
results. Workspace replacement retains its explicit review and baseline checks.

Markdown preview widgets leave the source model intact. Hovered and selected
rows show source syntax. Rendering is sanitized, with external resources and
navigation disabled. Rendering is limited to visible rows and parsed blocks are
cached by model version. Complex multi-row layouts and tall embedded media need
further visual acceptance; this is not a separate browser preview engine.

Vim is optional in Settings, with mode status, initial Insert mode, escape
sequence timeout and per-context mappings. Use `lhs rhs context`, one mapping per
line; supported adapter contexts are `normal`, `insert` and `visual`. A separate
`operatorPending` mapping context is not supported by this adapter and is rejected
as an invalid preference; ordinary Vim operator/motion commands remain available.
Mappings use the Vim adapter's `map` API so special keys such as `<Esc>` and
multi-key targets work; mappings can refer to other mappings. The escape timeout
controls how quickly a sequence such as `jk` must be typed. `:w` delegates to the
same save callback as the editor shortcut.
Monaco and Vim share one editor instance. Workbench shortcuts keep their existing
ownership and must not execute a save or run twice.

## Themes and runtime

Go syntax errors also come from the existing local parser worker, with a 60 ms
typing debounce (120 ms for files larger than 256 KiB). Results apply only to the
exact active source snapshot and appear on their source rows. Native gopls
diagnostics retain type-checking coverage; race and test markers stay independent.

Operational failures appear in the status bar and the Application errors section
of Problems. Open the status error button for full details or dismiss the error
from Problems. Debug launch failures use this dock instead of a blocking dialog.
New windows start centered at 1200 × 720, resizable and not maximized.

All stored theme IDs and palettes remain intact. `kott` is displayed as Goro Dark
and `light` as Goro Light. Monaco resolves existing CSS color tokens; do not add
a replacement palette. Workbench controls use short hover/press/focus feedback;
floating dialogs/menus use existing glass tokens. Reduced-motion preferences
disable animation. The code surface remains opaque and scrollable.

Monaco ESM and its editor worker are bundled locally. No CDN loader or
`unsafe-eval` exception is required. CodeMirror production dependencies and
adapters are removed. See [Testing](TESTING.md) and [release readiness](RELEASE_READINESS.md)
for required native, platform, IME and performance acceptance.
