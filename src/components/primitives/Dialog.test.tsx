import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Dialog from "./Dialog";
afterEach(cleanup);
it("keeps native Escape dismissal controlled by the owner while cleanup is pending", () => {
  const decide = vi.fn();
  render(<Dialog open onOpenChange={decide} ariaLabel="Owned operation">Pending cleanup</Dialog>);
  const dialog = screen.getByRole("dialog", { name: "Owned operation" });
  const event = new Event("cancel", { cancelable: true }); fireEvent(dialog, event);
  expect(event.defaultPrevented).toBe(true); expect(decide).toHaveBeenCalledWith(false); expect(dialog).toHaveAttribute("open");
});
