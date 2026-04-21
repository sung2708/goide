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
  default: () => <div />,
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
});
