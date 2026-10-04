import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { UpdateNotice, UpdatePanel } from "./UpdatePanel";
import type { UpdateState } from "./UpdateService";
const mocks = vi.hoisted(() => ({ state: {} as UpdateState, channel: "default", check: vi.fn(), install: vi.fn(), download: vi.fn() }));
vi.mock("./service", () => ({ updateService: { subscribe: () => () => undefined, snapshot: () => mocks.state, initialize: async () => undefined, check: mocks.check, download: mocks.download, cancel: vi.fn(), requestInstall: mocks.install } }));
vi.mock("../settings/useSettings", () => ({ useSettings: () => ({ values: { "updates.channel": mocks.channel } }) }));
beforeEach(() => { mocks.channel = "default"; mocks.check.mockReset(); mocks.install.mockReset(); mocks.download.mockReset(); mocks.state = { revision: 1, currentVersion: "1.0.0", channel: "stable", configured: true, phase: "updateAvailable", release: { version: "1.1.0", notes: "<img src=x onerror=alert(1)>", publishedAt: null }, received: 100, total: null, lastChecked: null, error: null }; });
it("renders release notes as plain text and manual check uses the shared service", () => {
  const { container } = render(<UpdatePanel />); expect(container.querySelector("pre img")).toBeNull(); expect(container.querySelector("[onerror]")).toBeNull(); expect(container.querySelector("img")).toHaveAttribute("src", "/brand/icon.svg"); expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Check for Updates" })); expect(mocks.check).toHaveBeenCalledWith(undefined);
});
it("reports actual progress without inventing a total or completion", () => {
  mocks.state.phase = "downloading"; render(<UpdatePanel />); const progress = screen.getByRole("progressbar");
  expect(progress).not.toHaveAttribute("value"); expect(screen.getByText(/total unknown/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Install and Restart" })).toBeNull();
});
it("passive notices retain editor focus and require explicit safe-install consent", () => {
  mocks.state.phase = "downloaded"; render(<><input aria-label="Editor" /><UpdateNotice /></>); const editor=screen.getByRole("textbox"); editor.focus(); expect(editor).toHaveFocus();
  expect(mocks.install).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Install and Restart" })); expect(mocks.install).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Dismiss update notification" })); expect(screen.queryByRole("status")).toBeNull();
});
it("channel changes hide stale download/install controls, including restoring build default", () => {
  mocks.state.channel="alpha"; mocks.state.phase="downloaded"; render(<><UpdatePanel /><UpdateNotice /></>);
  expect(screen.queryByRole("button", {name:"Install and Restart"})).toBeNull(); expect(screen.getByText(/Channel changed/)).toBeInTheDocument();
});
