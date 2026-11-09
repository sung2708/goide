// Builds the WebdriverIO test binary: debug profile, `e2e` Cargo feature,
// tauri.e2e.conf.json overlay and the frontend automation bridge. Never ship it.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  process.execPath,
  [
    resolve(root, "scripts/tauri-wrapper.mjs"),
    "build",
    "--debug",
    "--no-bundle",
    "--features",
    "e2e",
    "--config",
    "src-tauri/tauri.e2e.conf.json",
  ],
  { cwd: root, stdio: "inherit", env: { ...process.env, VITE_GORO_E2E: "1" } },
);
process.exit(result.status ?? 1);
