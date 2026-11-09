import { createGoWorkspace, explorerItem, openWorkspace, typeAtEndOfEditor } from "../support/workspace.js";

// P0 document safety: closing a dirty tab must ask, and each answer must do
// exactly what it says to the file on disk.
describe("closing a tab with unsaved changes", () => {
  const original = 'package main\n\nfunc main() {\n\tprintln("hello")\n}\n';
  let workspace: ReturnType<typeof createGoWorkspace>;

  before(async () => {
    workspace = createGoWorkspace({ "main.go": original });
    // Auto Save would resolve the dirty state before the close prompt is reached.
    await openWorkspace(workspace.root, { "files.autoSave": "off" });
  });

  after(() => workspace.dispose());

  async function editMainGo(marker: string) {
    const tab = $('[aria-label="Open documents"] [title$="main.go"]');
    if (!(await tab.isExisting())) {
      await (await explorerItem("main.go")).click();
    }
    await typeAtEndOfEditor(`// ${marker}`);
    await $('[title="Unsaved changes"]').waitForDisplayed();
  }

  async function closeMainGo() {
    await $('button[aria-label$="main.go"][aria-label^="Close "]').click();
    const dialog = $('[aria-label="Unsaved document changes"]');
    await dialog.waitForDisplayed();
    return dialog;
  }

  it("Cancel keeps the tab open with its edits and leaves disk untouched", async () => {
    await editMainGo("E2E-CANCEL");
    const dialog = await closeMainGo();
    await dialog.$("button=Cancel").click();
    await dialog.waitForDisplayed({ reverse: true });
    await expect($('[aria-label="Open documents"] [title$="main.go"]')).toExist();
    await expect($('[title="Unsaved changes"]')).toBeDisplayed();
    expect(workspace.read("main.go")).toBe(original);
  });

  it("Don't Save closes the tab and leaves disk untouched", async () => {
    const dialog = await closeMainGo();
    await dialog.$("button=Don't Save").click();
    await $('[aria-label="Open documents"] [title$="main.go"]').waitForExist({ reverse: true });
    expect(workspace.read("main.go")).toBe(original);
  });

  it("Save writes the edit to disk before closing", async () => {
    await editMainGo("E2E-SAVE");
    const dialog = await closeMainGo();
    await dialog.$("button=Save").click();
    await $('[aria-label="Open documents"] [title$="main.go"]').waitForExist({ reverse: true });
    await browser.waitUntil(() => workspace.read("main.go").includes("// E2E-SAVE"), {
      timeoutMsg: `main.go was not saved with the edit: ${JSON.stringify(workspace.read("main.go"))}`,
    });
  });
});
