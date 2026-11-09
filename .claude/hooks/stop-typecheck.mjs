// Stop hook: if TypeScript under src/ changed, typecheck before Claude ends its turn.
// Exit code 2 sends Claude back to fix the errors. Skips when nothing relevant changed.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  if (input.stop_hook_active) process.exit(0); // already retried once; avoid loops
} catch {
  // no input: continue
}

let changed = "";
try {
  changed = execFileSync("git", ["status", "--porcelain", "--", "src", "tsconfig.json"], { encoding: "utf8" });
} catch {
  process.exit(0);
}
if (!/\.(tsx?|json)$/m.test(changed)) process.exit(0);

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npx, ["tsc", "--noEmit"], { encoding: "utf8", shell: process.platform === "win32" });
if (result.status !== 0) {
  console.error("TypeScript errors in changed code (npm run typecheck):\n" + (result.stdout + result.stderr).slice(-4000));
  process.exit(2);
}
process.exit(0);
