import { crashApp, crashState, createGoWorkspace, openFile, openWorkspace, typeAtEndOfEditor } from "../../support/workspace.js";

// Part 1 of 2 (P0 draft recovery): leave an unsaved edit, then kill the app.
// Part 2 (2-recover-draft) runs next on the same WebView profile.
describe("draft recovery: crash with an unsaved edit", () => {
  it("kills the app while main.go has an unsaved draft", async () => {
    const original = 'package main\n\nfunc main() {\n\tprintln("hello")\n}\n';
    const workspace = createGoWorkspace({ "main.go": original });
    crashState.save({ root: workspace.root, original });
    await openWorkspace(workspace.root, { "files.autoSave": "off" });
    await openFile("main.go");
    await typeAtEndOfEditor("// E2E-DRAFT");
    await $('[title="Unsaved changes"]').waitForDisplayed();
    // DOCUMENT_RECOVERY.md: a checkpoint is written after a 200 ms idle window.
    await browser.pause(1500);
    await crashApp();
  });
});
