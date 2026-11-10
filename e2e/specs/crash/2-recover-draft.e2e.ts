import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { crashState, openFile } from "../../support/workspace.js";

// Part 2 of 2: the relaunched app must offer the draft and restore it only into
// the editor. Disk stays unchanged until the user saves.
describe("draft recovery: relaunch after the crash", () => {
  const { root, original } = crashState.load();
  const disk = () => readFileSync(join(root, "main.go"), "utf8");

  after(() => {
    rmSync(root, { recursive: true, force: true });
    crashState.clear();
  });

  it("offers the unsaved draft and leaves disk unchanged", async () => {
    const banner = $('[aria-label="Draft recovery"]');
    await banner.waitForDisplayed({ timeout: 30_000 });
    await expect(banner).toHaveText(expect.stringContaining("1 unsaved draft"));
    expect(disk()).toBe(original);
  });

  it("restores the draft into the editor without touching disk", async () => {
    await $('[aria-label="Draft recovery"]').$("button=Restore drafts").click();
    await openFile("main.go");
    await browser.waitUntil(async () => (await $(".monaco-editor .view-lines").getText()).includes("E2E-DRAFT"), {
      timeoutMsg: "restored editor does not contain the draft",
    });
    await expect($('[title="Unsaved changes"]')).toBeDisplayed();
    expect(disk()).toBe(original);
  });
});
