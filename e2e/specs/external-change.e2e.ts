import { createGoWorkspace, editorText, openFile, openWorkspace, typeAtEndOfEditor } from "../support/workspace.js";

// P0 document safety: a file changed by another program must reload when the
// tab is clean, and must never be silently overwritten when the tab is dirty.
describe("a file changed outside Goro", () => {
  const original = 'package main\n\nfunc main() {\n\tprintln("hello")\n}\n';
  const banner = () => $('[aria-label="External file conflict"]');
  let workspace: ReturnType<typeof createGoWorkspace>;

  before(async () => {
    workspace = createGoWorkspace({ "main.go": original });
    await openWorkspace(workspace.root, { "files.autoSave": "off" });
    await openFile("main.go");
  });

  after(() => workspace.dispose());

  it("reloads a clean tab without asking", async () => {
    workspace.write("main.go", `${original}// E2E-EXTERNAL-CLEAN\n`);
    await browser.waitUntil(async () => (await editorText()).includes("E2E-EXTERNAL-CLEAN"), {
      timeoutMsg: "clean tab did not show the external change",
    });
    await expect(banner()).not.toExist();
    await expect($('[title="Unsaved changes"]')).not.toExist();
  });

  it("keeps editor edits and the disk version apart when a dirty tab changes on disk", async () => {
    await typeAtEndOfEditor("// E2E-MINE");
    await $('[title="Unsaved changes"]').waitForDisplayed();
    workspace.write("main.go", `${original}// E2E-THEIRS\n`);
    await banner().waitForDisplayed();
    await expect(banner().$('[role="alert"]')).toHaveText(expect.stringContaining("changed outside Goro"));
    // Give any accidental save a chance to happen before asserting it did not.
    await browser.pause(1500);
    expect(workspace.read("main.go")).toBe(`${original}// E2E-THEIRS\n`);
    expect(await editorText()).toContain("E2E-MINE");
  });

  it("overwrites the reviewed disk version only when the user keeps the editor text", async () => {
    await banner().$("button*=Keep editor").click();
    await browser.waitUntil(() => workspace.read("main.go").includes("// E2E-MINE"), {
      timeoutMsg: `editor text was not written: ${JSON.stringify(workspace.read("main.go"))}`,
    });
    expect(workspace.read("main.go")).not.toContain("E2E-THEIRS");
    await banner().waitForExist({ reverse: true });
  });

  it("discards editor edits only when the user reloads the disk version", async () => {
    await typeAtEndOfEditor("// E2E-DISCARD");
    await $('[title="Unsaved changes"]').waitForDisplayed();
    const theirs = `${original}// E2E-THEIRS-AGAIN\n`;
    workspace.write("main.go", theirs);
    await banner().waitForDisplayed();
    await banner().$("button*=Reload disk").click();
    await banner().waitForExist({ reverse: true });
    await browser.waitUntil(async () => (await editorText()).includes("E2E-THEIRS-AGAIN"));
    expect(await editorText()).not.toContain("E2E-DISCARD");
    await expect($('[title="Unsaved changes"]')).not.toExist();
    expect(workspace.read("main.go")).toBe(theirs);
  });
});
