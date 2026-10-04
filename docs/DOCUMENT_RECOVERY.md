# Document copies and draft recovery

This is development implementation and automated evidence, not installed-app
crash or power-loss acceptance. Published alpha installers are unchanged.

## Save a copy

**Save Copy of Active Document…** (`Ctrl+Shift+S`, Command on macOS) exports the
captured editor text through a native Save dialog. The command is available for
read-only, externally deleted and conflicted documents. It does not rename the
open document, mark it clean, or overwrite its original file. Pick a new filename:
existing targets are rejected, even if the platform dialog permits replacement.

The backend accepts text within 4 MiB. It writes and syncs a unique temporary file
in the selected directory, then commits complete bytes with a non-replacing hard
link. Cancellation writes nothing. Unsupported hard-link filesystems and denied
writes report an error and leave editor text intact. A cleanup failure explicitly
reports that the copy was saved but its temporary file could not be removed.

## Recovery journal

For a normal app exit, **Save and close** saves through the existing guarded
workflow; **Cancel** keeps the current workspace and buffers open. **Don't Save
and close** never writes source files. After native process cleanup succeeds, it
clears the current workspace's recovery records and startup pointer, discards its
editor/conflict drafts, and closes. The next launch starts at Welcome; recent
workspaces and other workspaces' recovery records remain available. A failed
cleanup does not discard drafts. A storage failure prevents closing and offers
retry. A discard choice survives cleanup retries instead of switching to Save.

The titlebar **Project** control remains available with an existing workspace or
open editor: Open Project, New Go Project and Close Project. Workspace changes
retain their existing Save / Don't Save / Cancel guard. Startup restoration is
otherwise unchanged; saving and closing can reopen the previous workspace.

When a saved workspace is reopened, tabs retain their stored order but background
files are not activated in sequence. Only the saved active tab is shown once its
contents and view have loaded. If that file is unavailable, restoration reports
the missing file and selects an accessible fallback at the end. A session saved
without an active editor stays inactive. User edits, workspace changes and unmount
still cancel pending restore results instead of replacing the user's state.

Desktop builds keep dirty documents in `goro.drafts.v1` in the WebView's local
storage. A successful storage write is a recovery checkpoint; edits within the
200 ms idle window may not have reached it. Caret and viewport updates do not
serialize document contents or trigger storage writes. Journaling is bounded to
100 files and 2,000,000 bytes of UTF-8 JSON across all workspaces, including original
disk baselines. Oversized journals, quota failures and inaccessible storage are
reported; they do not silently evict valuable drafts or stop ordinary editing.

Source and baselines are plain text on this device. There is no upload, automatic
expiration or remote synchronization. Turn off **Files → Keep unsaved drafts
locally for crash recovery** to stop new checkpoints. Existing copies remain until
explicitly discarded; changing this preference does not delete them.

Opening a workspace with stored drafts presents **Restore drafts** and **Review
stored drafts…**. Its startup records cannot be replaced by clean tab restoration.
Recovery stays paused for that workspace until the records are reviewed. Restore
only changes editor buffers, preserving the original baseline so a later Save
still detects external changes or deleted files. A dirty open destination rejects
the entire recovery before any buffer changes. Read-only buffers remain read-only.

**Review Stored Drafts** in the command palette also works without an open
workspace. It lists the original roots, file paths and checkpoint times. Export a
copy when a workspace was moved or deleted. Discarding a workspace's stored copies
requires confirmation and leaves live editor buffers unchanged. Saved or explicitly
closed/discarded buffers leave the journal at their next checkpoint.

Unreadable or malformed journals are preserved and automatic recovery pauses.
The manager offers export of the original JSON and an explicit confirmed reset;
reset restarts journaling. Removing app data or clearing WebView storage removes
these copies. View metadata remains separate in workspace history.

## Acceptance requirements

Tests cover restart reconstruction, protected startup records, original baselines,
dirty destination rejection, quota failure, corrupt storage/reset, privacy opt-out,
200 ms scheduling, caret-only updates, moved-workspace discovery and confirmed
discard. Native tests verify complete export bytes, original-file preservation,
existing-target rejection, limits and temporary-file cleanup.

Before stable acceptance, repeat with installed Windows/macOS/Linux apps: kill
the process after a visible checkpoint, reopen and review multiple dirty tabs;
change/delete files externally before recovery; force storage/disk failures; test
native picker cancellation, unsupported filesystems, read-only exports, shutdown
with active tools and upgrade/uninstall. Unit tests using localStorage do not
establish OS persistence or protection of the final keystroke after a crash.
