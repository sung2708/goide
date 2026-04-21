import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import BranchPicker from "./BranchPicker";

describe("BranchPicker", () => {
  it("renders current, local, and remote branches distinctly", () => {
    render(
      <BranchPicker
        open
        currentBranch="develop"
        branches={[
          { name: "develop", kind: "current", isCurrent: true, upstream: "origin/develop", isRemoteTrackingCandidate: false },
          { name: "main", kind: "local", isCurrent: false, upstream: "origin/main", isRemoteTrackingCandidate: false },
          { name: "release/next", kind: "remote", isCurrent: false, upstream: null, isRemoteTrackingCandidate: true },
        ]}
        query=""
        onQueryChange={() => {}}
        onSelectBranch={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.getByText("develop")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("release/next")).toBeInTheDocument();
  });

  it("filters branch entries by query", () => {
    render(
      <BranchPicker
        open
        currentBranch="develop"
        branches={[
          { name: "develop", kind: "current", isCurrent: true, upstream: "origin/develop", isRemoteTrackingCandidate: false },
          { name: "feature/search", kind: "local", isCurrent: false, upstream: null, isRemoteTrackingCandidate: false },
        ]}
        query="search"
        onQueryChange={() => {}}
        onSelectBranch={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.getByText("feature/search")).toBeInTheDocument();
    expect(screen.queryByText("develop")).toBeNull();
  });
});
