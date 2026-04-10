import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import EditorShell from "./EditorShell";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

describe("EditorShell panels", () => {
  it("keeps optional panels hidden by default and toggles them on demand", async () => {
    const user = userEvent.setup();

    render(<EditorShell />);

    expect(screen.queryByTestId("summary-panel")).toBeNull();
    expect(screen.queryByTestId("bottom-panel")).toBeNull();

    const summaryBtn = screen.getByRole("button", { name: /summary/i });
    const bottomBtn = screen.getByRole("button", { name: /bottom/i });

    expect(summaryBtn).toHaveAttribute("aria-expanded", "false");
    expect(bottomBtn).toHaveAttribute("aria-expanded", "false");

    await user.click(summaryBtn);
    expect(summaryBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("summary-panel")).toBeInTheDocument();

    await user.click(bottomBtn);
    expect(bottomBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(summaryBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("summary-panel")).toBeNull();

    await user.click(screen.getByRole("button", { name: /hide/i }));
    expect(bottomBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("bottom-panel")).toBeNull();
  });
});
