import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { validateContracts, validateDate, accepts, releaseChannel } from "./release-contract.mjs";
import { contractFixture } from "./release-contract-fixture.mjs";
function fixture(run, version) {
  const directory = mkdtempSync(join(tmpdir(), "goro-contract-test-"));
  try { const contracts = contractFixture(directory, version); run({ ...contracts, assetsDir: directory, repository: "fixture/public" }); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}
for (const [version, channel] of [["0.2.0", "stable"], ["0.2.0-alpha.1", "alpha"], ["0.2.0-beta.1", "beta"], ["0.2.0-rc.1", "beta"], ["0.2.0-alpha.2+build.3", "alpha"]]) {
  test(`complete ${channel} ${version} metadata matches actual files`, () => fixture(options => {
    assert.equal(validateContracts(options).length, 8);
    assert.equal(options.release.channel, channel);
    assert.equal(new Set(options.release.downloads.map(item=>item.platformKey)).size, 4);
  }, version));
}
test("missing artifact, signature and checksum fail validation", () => {
  for (const kind of ["artifact", "signature", "checksum"]) fixture(options => {
    const entry = options.release.downloads[0];
    const name = kind === "checksum" ? "SHA256SUMS.txt" : entry.filename + (kind === "signature" ? ".sig" : "");
    unlinkSync(join(options.assetsDir, name));
    assert.throws(()=>validateContracts(options));
  });
});
test("standalone validators check actual checksum/metadata bytes and preserve full SemVer",()=>fixture(options=>{
  // Metadata must be outside assets, so the exact payload inventory stays closed.
  const metadata=mkdtempSync(join(tmpdir(),"goro-validator-test-"));
  try {
    writeFileSync(join(metadata,"release.json"),JSON.stringify(options.release));
    writeFileSync(join(metadata,"latest.json"),JSON.stringify(options.updater));
    const result=spawnSync(process.execPath,["scripts/validate-release-metadata.mjs","--metadata-dir",metadata,"--assets-dir",options.assetsDir,"--repository",options.repository,"--tag",options.release.tag],{encoding:"utf8"});
    assert.equal(result.status,0,result.stderr);
    const assets=spawnSync(process.execPath,["scripts/validate-release-assets.mjs","--assets-dir",options.assetsDir,"--tag",options.release.tag],{encoding:"utf8"});
    assert.equal(assets.status,0,assets.stderr);
    options.release.downloads[0].sha256="0".repeat(64);
    writeFileSync(join(metadata,"release.json"),JSON.stringify(options.release));
    const corrupted=spawnSync(process.execPath,["scripts/validate-release-metadata.mjs","--metadata-dir",metadata,"--assets-dir",options.assetsDir,"--repository",options.repository,"--tag",options.release.tag],{encoding:"utf8"});
    assert.equal(corrupted.status,1);
  } finally {rmSync(metadata,{recursive:true,force:true});}
},"0.2.0-alpha.2+build.3"));
test("malformed metadata cannot describe a different URL, platform, digest, size, version or date", () => {
  const mutations = [
    options=>{options.release.schemaVersion=2;}, options=>{options.release.version="01.2.0";},
    options=>{options.release.channel="alpha";}, options=>{options.updater.version="2.0.0";},
    options=>{options.updater.notes="other notes";}, options=>{options.release.publishedAt="2026-02-30T00:00:00Z";},
    options=>{options.release.downloads[0].sha256="0".repeat(64);}, options=>{options.release.downloads[0].size++;},
    options=>{options.release.downloads[0].url="http://private.example/installer";},
    options=>{options.release.downloads[0].platformKey="windows-aarch64";},
    options=>{options.release.downloads.push(options.release.downloads[0]);},
    options=>{options.updater.platforms["windows-x86_64"].signature="different";},
    options=>{options.updater.platforms["linux-aarch64"]={url:"https://example.test/",signature:"test"};},
  ];
  for (const mutate of mutations) fixture(options=>{ mutate(options); assert.throws(()=>validateContracts(options)); });
});
test("unsupported or stale binaries and duplicate checksum entries are rejected", () => {
  fixture(options=>{writeFileSync(join(options.assetsDir,"goro-v1.1.0-windows-aarch64-setup.exe"),"unexpected");assert.throws(()=>validateContracts(options),/unsupported/);});
  fixture(options=>{const path=join(options.assetsDir,"SHA256SUMS.txt");writeFileSync(path,readFileSync(path,"utf8")+options.checksums.split("\n")[0]+"\n");assert.throws(()=>validateContracts(options),/checksum/);});
});
test("canonical SemVer and calendar dates are strict; unknown feeds cannot accept stable", () => {
  for (const version of ["v1.0.0", "1.0", "01.0.0", "1.0.0-alpha.01", "1.0.0-preview.1"]) assert.throws(()=>releaseChannel(version));
  assert.equal(accepts("unknown", "1.0.0"), false);
  assert.throws(()=>validateDate("2026-02-30T00:00:00Z"));
});
test("privileged workflow pins actions, gates trusted refs, and keeps source token read-only", () => {
  const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  const uses = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map(match=>match[1]);
  assert.ok(uses.every(action=>/@[a-f0-9]{40}$/.test(action)));
  assert.match(workflow,/contents: read/);
  assert.match(workflow,/git merge-base --is-ancestor HEAD origin\/develop/);
  assert.match(workflow,/environment: release-signing/);
  assert.match(workflow,/environment: release-distribution/);
  assert.ok(!workflow.includes("pull_request_target:"));
});
