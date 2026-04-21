import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";

const openMock = vi.fn();
const getWorkspaceGitSnapshotMock = vi.fn();
const getWorkspaceBranchesMock = vi.fn();
const switchWorkspaceBranchMock = vi.fn();

const defaultGitSnapshot = {
  branch: "develop",
  changedFiles: [],
  commits: [],
};

const defaultBranchSnapshot = {
  currentBranch: "develop",
  isDetachedHead: false,
  detachedHeadRef: null,
  hasUncommittedChanges: false,
  changedFilesSummary: [],
  branches: [
    {
      name: "main",
      kind: "local" as const,
      isCurrent: false,
      upstream: "origin/main",
      isRemoteTrackingCandidate: false,
    },
  ],
};

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => openMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (
    _eventName: string,
    _callback: unknown
  ) => {
    return () => {};
  },
}));

vi.mock("../../lib/ipc/client", async () => {
  const actual = await vi.importActual("../../lib/ipc/client");
  return {
    ...actual,
    getWorkspaceGitSnapshot: (...args: unknown[]) =>
      getWorkspaceGitSnapshotMock(...args),
    getWorkspaceBranches: (...args: unknown[]) =>
      getWorkspaceBranchesMock(...args),
    switchWorkspaceBranch: (...args: unknown[]) =>
      switchWorkspaceBranchMock(...args),
    readWorkspaceFile: vi.fn().mockResolvedValue({ ok: true, data: "" }),
    getRuntimeAvailability: vi.fn().mockResolvedValue({
      ok: true,
      data: { runtimeAvailability: "unavailable" },
    }),
  };
});

vi.mock("../../features/concurrency/useLensSignals", () => ({
  useLensSignals: () => ({
    detectedConstructs: [],
    counterpartMappings: [],
    isAnalyzing: false,
    analysisError: null,
  }),
}));

vi.mock("../sidebar/Explorer", () => ({
  default: ({ explorerRevision }: { explorerRevision?: number }) => (
    <div data-testid="mock-explorer" data-explorer-revision={explorerRevision ?? 0} />
  ),
}));

vi.mock("./CodeEditor", () => ({
  default: () => <div data-testid="mock-code-editor" />,
}));

describe("EditorShell branch switching", () => {
  beforeEach(() => {
    getWorkspaceGitSnapshotMock.mockResolvedValue({
      ok: true,
      data: defaultGitSnapshot,
    });
    getWorkspaceBranchesMock.mockResolvedValue({
      ok: true,
      data: defaultBranchSnapshot,
    });
    switchWorkspaceBranchMock.mockResolvedValue({
      ok: true,
      data: {
        ...defaultBranchSnapshot,
        currentBranch: "main",
        branches: [
          {
            name: "develop",
            kind: "local" as const,
            isCurrent: false,
            upstream: "origin/develop",
            isRemoteTrackingCandidate: false,
          },
        ],
      },
    });
  });

  it("reloads workspace state after successful branch switch", async () => {
    const user = userEvent.setup();

    // Set up mock to return workspace path when the open dialog is triggered
    openMock.mockResolvedValue("C:/workspace");

    getWorkspaceBranchesMock.mockResolvedValue({
      ok: true,
      data: {
        currentBranch: "develop",
        isDetachedHead: false,
        detachedHeadRef: null,
        hasUncommittedChanges: false,
        changedFilesSummary: [],
        branches: [
          {
            name: "main",
            kind: "local" as const,
            isCurrent: false,
            upstream: "origin/main",
            isRemoteTrackingCandidate: false,
          },
        ],
      },
    });
    switchWorkspaceBranchMock.mockResolvedValue({
      ok: true,
      data: {
        currentBranch: "main",
        isDetachedHead: false,
        detachedHeadRef: null,
        hasUncommittedChanges: false,
        changedFilesSummary: [],
        branches: [
          {
            name: "develop",
            kind: "local" as const,
            isCurrent: false,
            upstream: "origin/develop",
            isRemoteTrackingCandidate: false,
          },
        ],
      },
    });

    render(<EditorShell />);

    // Open workspace so workspacePath is set and branch fetch fires
    await user.click(screen.getByRole("button", { name: /open workspace folder/i }));

    // Wait for the branch snapshot to load and the trigger to appear in StatusBar
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /switch branch/i })
      ).toBeInTheDocument();
    });

    // Open the branch picker
    await user.click(screen.getByRole("button", { name: /switch branch/i }));

    // Wait for the BranchPicker dialog to appear
    await screen.findByRole("dialog", { name: /branch picker/i });

    // Select the "main" branch (accessible name includes kind label, e.g. "main local")
    await user.click(await screen.findByRole("button", { name: /main/i }));

    await waitFor(() => {
      expect(switchWorkspaceBranchMock).toHaveBeenCalledWith({
        workspaceRoot: "C:/workspace",
        targetBranch: "main",
        remoteRef: null,
        preSwitchAction: "none",
      });
    });

    // The initial workspace load fetches branch state directly and via the git
    // polling refresh. Selecting a branch refreshes branch state again before
    // switching, then reloadWorkspaceState fetches both snapshots after a
    // successful switch.
    await waitFor(() => {
      expect(getWorkspaceGitSnapshotMock).toHaveBeenCalledTimes(2);
      expect(getWorkspaceBranchesMock).toHaveBeenCalledTimes(4);
    });
  });

  it("passes remoteRef when switching to a remote branch from a non-origin remote", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");

    // Simulate a repo with an "upstream" remote exposing a "feature" branch.
    getWorkspaceBranchesMock.mockResolvedValue({
      ok: true,
      data: {
        currentBranch: "main",
        isDetachedHead: false,
        detachedHeadRef: null,
        hasUncommittedChanges: false,
        changedFilesSummary: [],
        branches: [
          {
            name: "main",
            kind: "current" as const,
            isCurrent: true,
            upstream: "origin/main",
            isRemoteTrackingCandidate: true,
            remoteName: null,
            remoteRef: null,
          },
          {
            name: "feature",
            kind: "remote" as const,
            isCurrent: false,
            upstream: null,
            isRemoteTrackingCandidate: true,
            // Key: the DTO carries the full ref from a non-origin remote.
            remoteName: "upstream",
            remoteRef: "upstream/feature",
          },
        ],
      },
    });
    switchWorkspaceBranchMock.mockResolvedValue({
      ok: true,
      data: {
        currentBranch: "feature",
        isDetachedHead: false,
        detachedHeadRef: null,
        hasUncommittedChanges: false,
        changedFilesSummary: [],
        branches: [],
      },
    });

    render(<EditorShell />);
    await user.click(screen.getByRole("button", { name: /open workspace folder/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /switch branch/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /switch branch/i }));
    await screen.findByRole("dialog", { name: /branch picker/i });
    await user.click(await screen.findByRole("button", { name: /feature/i }));

    await waitFor(() => {
      expect(switchWorkspaceBranchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          targetBranch: "feature",
          // Must forward the remoteRef so the backend uses upstream/feature,
          // not the hardcoded origin/feature.
          remoteRef: "upstream/feature",
        })
      );
    });
  });

  it("does not call switchWorkspaceBranch when dirty dialog is cancelled", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");

    // Simulate a repo with uncommitted changes.
    getWorkspaceBranchesMock.mockResolvedValue({
      ok: true,
      data: {
        currentBranch: "main",
        isDetachedHead: false,
        detachedHeadRef: null,
        hasUncommittedChanges: true,
        changedFilesSummary: [{ path: "dirty.txt", status: "??" }],
        branches: [
          {
            name: "main",
            kind: "current" as const,
            isCurrent: true,
            upstream: "origin/main",
            isRemoteTrackingCandidate: true,
          },
          {
            name: "feature",
            kind: "local" as const,
            isCurrent: false,
            upstream: null,
            isRemoteTrackingCandidate: false,
          },
        ],
      },
    });

    render(<EditorShell />);
    await user.click(screen.getByRole("button", { name: /open workspace folder/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /switch branch/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /switch branch/i }));
    await screen.findByRole("dialog", { name: /branch picker/i });
    await user.click(await screen.findByRole("button", { name: /feature/i }));

    // The dirty-tree dialog should now be showing.
    await screen.findByRole("dialog", { name: /branch switch confirmation/i });

    // Cancel the dialog.
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    // switchWorkspaceBranch must NOT have been called.
    expect(switchWorkspaceBranchMock).not.toHaveBeenCalled();
  });

  it("increments explorerRevision passed to Explorer after a successful branch switch", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");

    getWorkspaceBranchesMock.mockResolvedValue({
      ok: true,
      data: {
        currentBranch: "develop",
        isDetachedHead: false,
        detachedHeadRef: null,
        hasUncommittedChanges: false,
        changedFilesSummary: [],
        branches: [
          {
            name: "develop",
            kind: "current" as const,
            isCurrent: true,
            upstream: "origin/develop",
            isRemoteTrackingCandidate: true,
          },
          {
            name: "main",
            kind: "local" as const,
            isCurrent: false,
            upstream: "origin/main",
            isRemoteTrackingCandidate: false,
          },
        ],
      },
    });
    switchWorkspaceBranchMock.mockResolvedValue({
      ok: true,
      data: {
        currentBranch: "main",
        isDetachedHead: false,
        detachedHeadRef: null,
        hasUncommittedChanges: false,
        changedFilesSummary: [],
        branches: [
          {
            name: "develop",
            kind: "local" as const,
            isCurrent: false,
            upstream: "origin/develop",
            isRemoteTrackingCandidate: false,
          },
        ],
      },
    });

    render(<EditorShell />);
    await user.click(screen.getByRole("button", { name: /open workspace folder/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /switch branch/i })).toBeInTheDocument();
    });

    const explorerBefore = Number(
      screen.getByTestId("mock-explorer").getAttribute("data-explorer-revision")
    );

    // Open picker and select main
    await user.click(screen.getByRole("button", { name: /switch branch/i }));
    await screen.findByRole("dialog", { name: /branch picker/i });
    await user.click(await screen.findByRole("button", { name: /main/i }));

    await waitFor(() => {
      expect(switchWorkspaceBranchMock).toHaveBeenCalled();
    });

    // After the switch completes, explorerRevision must have increased
    await waitFor(() => {
      const explorerAfter = Number(
        screen.getByTestId("mock-explorer").getAttribute("data-explorer-revision")
      );
      expect(explorerAfter).toBeGreaterThan(explorerBefore);
    });
  });

  it("does not render internal error prefix in branch switch error display", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/workspace");

    getWorkspaceBranchesMock.mockResolvedValue({
      ok: true,
      data: {
        currentBranch: "main",
        isDetachedHead: false,
        detachedHeadRef: null,
        hasUncommittedChanges: false,
        changedFilesSummary: [],
        branches: [
          {
            name: "main",
            kind: "current" as const,
            isCurrent: true,
            upstream: "origin/main",
            isRemoteTrackingCandidate: true,
          },
          {
            name: "feature",
            kind: "local" as const,
            isCurrent: false,
            upstream: null,
            isRemoteTrackingCandidate: false,
          },
        ],
      },
    });

    // The backend now returns sanitized messages; make sure the UI displays
    // only the human portion.
    switchWorkspaceBranchMock.mockResolvedValue({
      ok: false,
      error: {
        code: "git_branch_switch_failed",
        message: "git command failed: branch not found",
      },
    });

    render(<EditorShell />);
    await user.click(screen.getByRole("button", { name: /open workspace folder/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /switch branch/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /switch branch/i }));
    await screen.findByRole("dialog", { name: /branch picker/i });
    await user.click(await screen.findByRole("button", { name: /feature/i }));

    // The error message from the backend error.message should be displayed.
    await waitFor(() => {
      expect(screen.getByText("git command failed: branch not found")).toBeInTheDocument();
    });

    // The internal code prefix must not leak through as a standalone token.
    expect(screen.queryByText(/git_branch_switch_failed/)).toBeNull();
  });
});
