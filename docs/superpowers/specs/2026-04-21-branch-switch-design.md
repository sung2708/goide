# Branch Switch Design

Date: 2026-04-21
Project: GoIDE
Status: Draft approved in conversation, written for user review

## Context

GoIDE currently surfaces Git repository state, but it does not let the user switch branches directly inside the IDE. In practice, this creates friction when a repository is cloned on the default branch (often `main`) while the user’s actual work is on another branch like `develop`. The goal of this feature is to let users switch branches inside the IDE safely and predictably, including switching to remote-only branches, while protecting in-progress work through explicit handling of uncommitted changes.

The user has already clarified the intended scope:
- branch switching should be available from both the status bar and the Git panel
- the IDE should support both local branches and remote branches that are not yet checked out locally
- if there are uncommitted changes, the user should be prompted to choose one of: Commit, Stash, Discard, or Cancel
- after a successful branch switch, the IDE should reload the entire workspace state to avoid stale editor, file-tree, or diagnostics state

This is intentionally a focused branch-switch feature, not a general-purpose Git client.

## Goals

1. Let users discover the current branch quickly.
2. Let users switch to an existing local branch from inside the IDE.
3. Let users switch to a remote branch that has not yet been checked out locally.
4. Handle dirty working trees safely through explicit user choice.
5. Reload the workspace cleanly after a branch change.
6. Keep the first version simple enough to ship without turning the Git panel into a full source-control system.

## Non-goals

This first version should not include:
- branch rename or branch deletion
- merge, rebase, cherry-pick, reset, or stash management UI
- force checkout shortcuts that bypass user confirmation
- multi-repository support
- background polling of branch changes from outside the app

## Chosen approach

The chosen approach is the “safe, full-featured first version”:
- entry points in both the status bar and Git panel
- support for local and remote branches
- explicit modal flow for uncommitted changes
- full workspace reload after successful switch

This balances usability and safety while keeping the implementation bounded.

## User experience

### Entry points

#### Status bar
The current branch becomes a clickable control in the status bar. Clicking it opens a branch picker.

This is the fast path for users who switch branches often.

#### Git panel
The Git panel gains a branch section showing:
- current branch
- a “Switch branch” action
- the same picker flow as the status bar entry point

This is the discoverable path for users exploring Git features in the IDE.

## Branch picker behavior

The picker should show:
- current branch
- local branches
- remote branches that can be checked out

It should support search/filter because repositories can have many branches.

The picker should visually distinguish:
- current branch
- local branches
- remote-only branches

For remote-only branches, the UI should make it clear that selecting one will create a local tracking branch automatically.

## Dirty working tree flow

If the workspace has uncommitted changes when the user selects a target branch, the IDE shows a modal with four choices:

1. **Commit changes**
2. **Stash changes**
3. **Discard changes**
4. **Cancel**

### Commit option
If the user chooses commit:
- require a commit message input
- disable confirmation when the message is empty
- perform a normal commit before switching

### Stash option
If the user chooses stash:
- stash current changes
- then switch branch

### Discard option
If the user chooses discard:
- show destructive wording clearly
- discard current changes
- then switch branch

### Cancel option
If the user chooses cancel:
- do nothing
- keep current branch and current workspace state unchanged

## Behavior after successful branch switch

After a successful switch, the frontend should perform a full workspace reload. This is a key product decision and should not be watered down in the first version.

The reload must:
- refresh the file explorer tree
- refresh Git branch/status snapshot
- clear editor state derived from the previous branch when needed
- reload the active file if it still exists on the new branch
- clear the active editor view if the previous file no longer exists
- reset stale diagnostics, selections, runtime state, and other branch-dependent UI state

## Backend design

The backend should remain responsible for Git correctness. The frontend should not try to infer branch semantics locally.

### New branch data model

A new branch-oriented DTO layer should be introduced.

#### WorkspaceGitBranch
Recommended fields:
- `name`
- `kind`: `current | local | remote`
- `isCurrent`
- `upstream` (optional)
- `isRemoteTrackingCandidate`

#### WorkspaceBranchSnapshot
Recommended fields:
- `currentBranch`
- `branches`
- `hasUncommittedChanges`
- `changedFilesSummary`
- `isDetachedHead` (recommended)
- `detachedHeadRef` or short SHA (optional but useful)

### Backend commands

#### `get_workspace_branches`
Returns:
- current branch or detached state
- local branches
- remote branches that are relevant for switching
- whether the working tree has uncommitted changes
- lightweight changed file summary for the dirty-state prompt

#### `switch_workspace_branch`
Input:
- `workspaceRoot`
- `targetBranch`
- `preSwitchAction`: `none | commit | stash | discard`
- `commitMessage` (optional, required only for `commit`)

Behavior:
- if the local branch exists: `git switch <branch>`
- if only the remote branch exists: create a tracking branch and switch to it
- if dirty state exists and action is `none`: fail with a structured response that tells the frontend a pre-switch decision is required
- if action is `commit`: commit, then switch
- if action is `stash`: stash, then switch
- if action is `discard`: discard tracked changes, then switch

The backend should return a success payload with enough information for the frontend to trigger the correct reload sequence, but it should not try to perform frontend state refresh itself.

## Frontend design

### State additions

The editor shell (or a dedicated Git controller) should add state for:
- branch picker visibility
- branch list snapshot
- branch filter query
- pending target branch
- dirty-state modal visibility
- chosen pre-switch action
- optional commit message input
- branch-switch loading state
- branch-switch error message

### Recommended component boundaries

1. **Status bar branch trigger**
   - shows current branch
   - opens branch picker

2. **Git panel branch section**
   - shows current branch
   - opens branch picker

3. **Branch picker component**
   - lists local and remote branches
   - supports filtering
   - emits selected branch

4. **Dirty state modal component**
   - renders action choices
   - optionally collects commit message
   - confirms or cancels

5. **Workspace reload coordinator**
   - existing editor shell logic should centralize how workspace, explorer, active file, diagnostics, and Git snapshot are refreshed after a switch

## Error handling

### Not a Git repository
If the workspace is not a Git repository:
- disable the branch switch entry points
- Git panel should explain that no repository was detected

### Remote branch no longer available
If the selected remote branch no longer exists or fetch data is stale:
- show a short, actionable error
- keep current branch unchanged

### Commit/stash/discard failure
If the pre-switch action fails:
- show the specific failure message
- do not proceed with branch switch
- do not reload workspace

### Switch failure after pre-switch action
If the pre-switch action succeeds but the switch itself fails:
- show an explicit error
- do not pretend the switch occurred
- keep the UI in a safe state and require explicit user retry

### Active file missing after switch
If the active file from the previous branch does not exist on the new branch:
- clear editor contents
- show a gentle empty-state message explaining the file is not present on the new branch

## Edge cases

1. **Large branch lists**
   - filtering is required

2. **Detached HEAD**
   - display detached state clearly rather than pretending a branch exists

3. **Local branch and remote branch share a name**
   - prefer switching to the existing local branch
   - only create a tracking branch when no local branch exists

4. **Dirty editor + dirty git state**
   - the branch switch flow should operate on persisted working tree state only after the user-selected pre-switch action is applied
   - full workspace reload after success avoids stale editor buffers from the old branch

5. **File tree shape changes dramatically after switch**
   - full workspace reload handles this cleanly and is preferred over partial patch-up logic

## Testing strategy

### Backend tests
Add tests for:
- listing branches in a normal repository
- detecting current branch
- detecting detached HEAD
- switching to an existing local branch
- switching to a remote-only branch and creating local tracking
- dirty-state detection
- commit/stash/discard pre-switch flows
- failure cases for missing branches and Git command errors

### Frontend tests
Add tests for:
- opening branch picker from status bar
- opening branch picker from Git panel
- rendering local and remote branches distinctly
- showing dirty-state modal when needed
- commit/stash/discard/cancel behavior
- successful switch triggering workspace reload flow
- active file cleared when it no longer exists on the new branch
- error banner/toast when switch fails

### Manual validation
Manual scenarios should include:
- clone repo on default branch, then switch to `develop`
- switch to a remote branch that has not been checked out locally
- switch with clean working tree
- switch with uncommitted changes and choose Commit
- switch with uncommitted changes and choose Stash
- switch with uncommitted changes and choose Discard
- switch to a branch where the previously open file no longer exists

## Why this design

This design keeps the first version strong where it matters:
- users can actually solve the “I cloned main but my work is on develop” problem
- the UI is discoverable and quick
- branch switching is safe when the working tree is dirty
- the IDE avoids stale cross-branch state by reloading fully after success

At the same time, it avoids turning the Git experience into a full-featured Git client before the basic branch-switch workflow is solid.

## Open questions resolved

The following decisions have already been made and are treated as final for this version:
- support both local and remote branches
- surface branch switching from both status bar and Git panel
- if there are uncommitted changes, offer Commit / Stash / Discard / Cancel
- after switch success, reload the whole workspace

## Implementation readiness check

This spec is focused enough for a single implementation plan. It does not contain placeholders, and the architecture, UI flow, and backend responsibilities align with the agreed scope. The design intentionally limits Git scope to branch switching and dirty-state handling, which should keep implementation complexity manageable.