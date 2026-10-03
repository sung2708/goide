import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const script = resolve("scripts/validate-release-ref.mjs");
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "goro-release-ref-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-b", "main"); git("config", "user.name", "Release fixture"); git("config", "user.email", "fixture@example.invalid");
    git("commit", "--allow-empty", "-m", "main candidate");
    git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"));
    const check = (event, ref) => spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", env: { ...process.env, RELEASE_EVENT: event, RELEASE_REF: ref, RELEASE_TAG: "v0.2.0-alpha.1" } });
    run({ git, check });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test("a matching annotated tag on main is accepted", () => fixture(({git,check}) => {
  git("tag", "-a", "v0.2.0-alpha.1", "-m", "candidate");
  const result=check("push","refs/tags/v0.2.0-alpha.1"); assert.equal(result.status,0,result.stderr);
}));
test("manual candidates run on main only", () => fixture(({check}) => {
  assert.equal(check("workflow_dispatch","refs/heads/main").status,0);
  assert.equal(check("workflow_dispatch","refs/heads/develop").status,1);
}));
test("a tag only on develop is rejected", () => fixture(({git,check}) => {
  git("switch","-c","develop"); git("commit","--allow-empty","-m","unmerged work"); git("tag","v0.2.0-alpha.1");
  assert.equal(check("push","refs/tags/v0.2.0-alpha.1").status,1);
}));
test("dispatch cannot rebuild an existing version from different source", () => fixture(({git,check}) => {
  git("tag","v0.2.0-alpha.1"); git("commit","--allow-empty","-m","later change"); git("update-ref","refs/remotes/origin/main",git("rev-parse","HEAD"));
  const result=check("workflow_dispatch","refs/heads/main"); assert.equal(result.status,1); assert.match(result.stderr,/exact candidate/);
}));
test("a mismatched ref or absent push tag is rejected", () => fixture(({check}) => {
  assert.equal(check("push","refs/tags/v0.2.0-alpha.2").status,1);
  assert.equal(check("push","refs/tags/v0.2.0-alpha.1").status,1);
}));
