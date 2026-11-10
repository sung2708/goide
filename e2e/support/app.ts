import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const binary = process.platform === "win32" ? "Goro.exe" : "Goro";

/** The `npm run e2e:build` binary, or GORO_E2E_APP when set. */
export const appPath = process.env.GORO_E2E_APP ?? resolve(here, "../../src-tauri/target/debug", binary);
