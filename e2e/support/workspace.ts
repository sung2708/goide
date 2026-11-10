import { mkdtempSync, mkdirSync, readFileSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A throwaway Go module on disk; never points at a real project. */
export function createGoWorkspace(files: Record<string, string> = {}) {
  // Long, canonical form: Windows runners hand out 8.3 short names (RUNNER~1)
  // and macOS tmpdir() sits behind the /var -> /private/var symlink.
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "goro-e2e-")));
  const all = {
    "go.mod": "module example.com/e2e\n\ngo 1.22\n",
    "main.go": 'package main\n\nfunc main() {\n\tprintln("hello")\n}\n',
    ...files,
  };
  for (const [path, contents] of Object.entries(all)) {
    const target = join(root, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, contents);
  }
  return {
    root,
    read: (path: string) => readFileSync(join(root, path), "utf8"),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

/**
 * Opens `root` through the real "Recent workspaces" path. The native folder
 * picker cannot be driven by WebDriver, and the app calls Tauri through
 * @tauri-apps/api directly, which WDIO command mocks do not intercept.
 */
export async function openWorkspace(root: string, settings: Record<string, unknown> = {}) {
  await browser.execute((workspaceRoot, values) => {
    const history = { version: 1, last: null, sessions: [{ root: workspaceRoot, files: [], active: null }] };
    localStorage.setItem("goide.workspaceHistory.v1", JSON.stringify(history));
    localStorage.setItem("goide.settings.v1", JSON.stringify({ version: 1, values }));
  }, root, settings);
  await browser.refresh();
  // Match the title in JS: Windows backslashes are escapes inside a CSS selector.
  const recent = await $$('[aria-label="Recent workspaces"] button[title]');
  let opened = false;
  for (const button of recent) {
    if ((await button.getAttribute("title")) === root) {
      await button.click();
      opened = true;
      break;
    }
  }
  if (!opened) throw new Error(`Recent workspaces has no entry for ${root}`);
  await $('[role="treeitem"]').waitForDisplayed();
  await browser.waitUntil(async () => (await $$('[role="treeitem"]').map((item) => item.getText())).some((text) => text.includes("main.go")), {
    timeoutMsg: "Explorer did not list main.go",
  });
}

/** The Explorer row for a workspace-relative file name. */
export async function explorerItem(name: string) {
  const items = await $$('[role="treeitem"]');
  for (const item of items) {
    if ((await item.getText()).includes(name)) return item;
  }
  throw new Error(`Explorer has no item ${name}`);
}

/**
 * Types at the end of the active Monaco editor.
 *
 * tauri-plugin-wdio-webdriver 1.5.1 sends lowercase letters with keyCode equal to
 * their char code (for example "r" = 114 = F3), so Monaco treats some of them as
 * function-key commands. Use upper case, digits and punctuation only.
 */
export async function typeAtEndOfEditor(text: string) {
  if (/[a-z]/.test(text)) throw new Error(`Use upper case in typed E2E text: ${text}`);
  const input = $(".monaco-editor textarea");
  await input.waitForExist();
  // Element handles cannot be passed to execute() with the embedded driver.
  await browser.execute(() => document.querySelector<HTMLTextAreaElement>(".monaco-editor textarea")?.focus());
  await browser.keys(["Control", "End"]);
  await browser.keys(["Control"]);
  // One key at a time: bursts race Monaco's suggest widget in WebKitGTK.
  for (const key of text) {
    await browser.keys(key);
  }
  await browser.keys("Escape");
}
