import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StatusBar from "./StatusBar";

function renderStatusBar(
  runtimeAvailability: "available" | "unavailable" | "degraded"
) {
  return render(
    <StatusBar
      workspacePath="C:/repo"
      activeFilePath="main.go"
      mode="quick-insight"
      runtimeAvailability={runtimeAvailability}
      isSummaryOpen={false}
      isBottomPanelOpen={false}
      isCommandPaletteOpen={false}
      onToggleSummary={vi.fn()}
      onToggleBottomPanel={vi.fn()}
      onToggleCommandPalette={vi.fn()}
    />
  );
}

describe("StatusBar", () => {
  it("shows runtime unavailable without rendering error UI copy", () => {
    renderStatusBar("unavailable");

    expect(screen.getByText(/Runtime: Static/i)).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).toBeNull();
  });

  it("shows runtime available when runtime is healthy", () => {
    renderStatusBar("available");

    expect(screen.getByText(/Runtime: Active/i)).toBeInTheDocument();
  });

  it("shows degraded runtime status when deep-trace sampling is unhealthy", () => {
    renderStatusBar("degraded");

    expect(screen.getByText(/Runtime: Degraded/i)).toBeInTheDocument();
    expect(screen.queryByText(/error/i)).toBeNull();
  });
});
