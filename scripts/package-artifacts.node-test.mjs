import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("release packaging selects Goro rather than legacy GoIDE or stale Goro bundles", () => {
  const fixture = mkdtempSync(join(tmpdir(), "goro-artifacts-test-"));
  const bundles = join(fixture, "bundles");
  const output = join(fixture, "output");
  mkdirSync(bundles);
  try {
    const version = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8")).version;
    writeFileSync(join(bundles, `GoIDE_${version}_x64-setup.exe`), "legacy icon");
    writeFileSync(join(bundles, "Goro_0.0.0_x64-setup.exe"), "stale icon");
    writeFileSync(join(bundles, `Goro_${version}_x64-setup.exe`), "current Goro icon");
    const result = spawnSync(process.execPath, [join(root, "scripts", "package-artifacts.mjs"),
      "--tag", `v${version}`, "--platform", "windows", "--arch", "x86_64",
      "--bundle-dir", bundles, "--output-dir", output], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(readFileSync(join(output, `goro-v${version}-windows-x86_64-setup.exe`), "utf8"), "current Goro icon");
  } finally {
    const target = resolve(fixture);
    if (dirname(target) === resolve(tmpdir()) && basename(target).startsWith("goro-artifacts-test-")) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});
