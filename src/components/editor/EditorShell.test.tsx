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

    await user.click(screen.getByRole("button", { name: /summary/i }));
    expect(screen.getByTestId("summary-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /bottom/i }));
    expect(screen.getByTestId("bottom-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByTestId("summary-panel")).toBeNull();

    await user.click(screen.getByRole("button", { name: /hide/i }));
    expect(screen.queryByTestId("bottom-panel")).toBeNull();
  });
});
