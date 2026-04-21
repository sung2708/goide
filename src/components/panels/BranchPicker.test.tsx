import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import BranchPicker from "./BranchPicker";

const branches = [
  { name: "develop", kind: "current", isCurrent: true, upstream: "origin/develop", isRemoteTrackingCandidate: false },
  { name: "main", kind: "local", isCurrent: false, upstream: "origin/main", isRemoteTrackingCandidate: false },
  { name: "release/next", kind: "remote", isCurrent: false, upstream: null, isRemoteTrackingCandidate: true },
] as const;

describe("BranchPicker", () => {
  it("renders current, local, and remote branches distinctly", () => {
    render(
      <BranchPicker
        open
        currentBranch="develop"
        branches={[...branches]}
        query=""
        onQueryChange={() => {}}
        onSelectBranch={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.getByText("develop")).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("release/next")).toBeInTheDocument();
    expect(screen.getByText("current")).toBeInTheDocument();
    expect(screen.getByText("local")).toBeInTheDocument();
    expect(screen.getByText("remote")).toBeInTheDocument();
  });

  it("calls onQueryChange when typing in the filter input", () => {
    const onQueryChange = vi.fn();

    render(
      <BranchPicker
        open
        currentBranch="develop"
        branches={[...branches]}
        query=""
        onQueryChange={onQueryChange}
        onSelectBranch={() => {}}
        onClose={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText("Filter branches"), { target: { value: "rel" } });

    expect(onQueryChange).toHaveBeenCalledWith("rel");
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

  it("calls onClose when Close is clicked", () => {
    const onClose = vi.fn();

    render(
      <BranchPicker
        open
        currentBranch="develop"
        branches={[...branches]}
        query=""
        onQueryChange={() => {}}
        onSelectBranch={() => {}}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
