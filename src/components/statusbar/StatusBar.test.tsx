import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StatusBar from "./StatusBar";

function renderStatusBar(
  diagnosticsAvailability: "available" | "unavailable" | "idle" = "available"
) {
  return render(
    <StatusBar
      workspacePath="C:/workspace"
      activeFilePath="main.go"
      mode="quick-insight"
      runtimeAvailability="available"
      diagnosticsAvailability={diagnosticsAvailability}
      saveStatus="idle"
      runStatus="idle"
      isSummaryOpen={false}
      isBottomPanelOpen={false}
      isCommandPaletteOpen={false}
      onToggleSummary={vi.fn()}
      onToggleBottomPanel={vi.fn()}
      onToggleCommandPalette={vi.fn()}
    />
  );
}

describe("StatusBar diagnostics availability", () => {
  it("shows diagnostics healthy label when tooling is available", () => {
    renderStatusBar("available");

    expect(screen.getByText("Diag OK")).toBeInTheDocument();
  });

  it("shows actionable setup label when tooling is unavailable", () => {
    renderStatusBar("unavailable");

    expect(screen.getByText("Diag Setup")).toBeInTheDocument();
    expect(
      screen.getByTitle(/gopls is unavailable\. install gopls/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show commands palette/i })).toBeEnabled();
  });

  it("shows neutral diagnostics label before any diagnostics check runs", () => {
    renderStatusBar("idle");

    expect(screen.getByText("Diag --")).toBeInTheDocument();
    expect(
      screen.getByTitle(/diagnostics have not been checked/i)
    ).toBeInTheDocument();
  });
});
