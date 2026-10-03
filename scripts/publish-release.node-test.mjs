import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { contractFixture } from "./release-contract-fixture.mjs";
const preload = `
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
const json = (value,status=200) => new Response(JSON.stringify(value),{status});
globalThis.fetch = async (url,options={}) => {
  const parsed = new URL(url); const path = parsed.pathname; const method = options.method ?? 'GET';
  appendFileSync(process.env.FIXTURE_LOG, JSON.stringify({path,method,body: typeof options.body === 'string' ? options.body : undefined,auth: Boolean(options.headers?.Authorization)})+'\\n');
  if (parsed.hostname === 'uploads.github.com') return json({state:'uploaded',size:options.body.length,digest:'sha256:'+createHash('sha256').update(options.body).digest('hex')});
  if (parsed.hostname === 'github.com') { if(process.env.FAIL_PUBLIC==='1') return new Response('',{status:503}); return new Response(path.endsWith('.sig') ? 'signature' : path.endsWith('SHA256SUMS.txt') ? process.env.FIXTURE_SUMS : 'artifact'); }
  if (parsed.hostname !== 'api.github.com') throw new Error('Unexpected test request');
  const prefix='/repos/fixture/public/'; const route=path.slice(prefix.length);
  if (!route) return json({private:process.env.PRIVATE_REPO==='1',visibility:process.env.PRIVATE_REPO==='1'?'private':'public'});
  if(route.startsWith('releases/tags/')) return json({},process.env.REUSED_VERSION==='1'?200:404);
  if(route==='git/ref/heads/gh-pages') return json({object:{sha:'original'}});
  if(route==='git/commits/original') return json({tree:{sha:'tree'}});
  if(route==='git/trees/tree') return json({tree:[{path:'channels/alpha/latest.json',sha:'alpha'},...(process.env.REUSED_METADATA==='1'?[{path:'versions/1.1.0/release.json',sha:'immutable'}]:[])],truncated:false});
  if(route==='git/blobs/alpha') return json({content:Buffer.from(JSON.stringify({version:'2.0.0-alpha.1'})).toString('base64')});
  if(route==='releases' && method==='POST') return json({id:1,upload_url:'https://uploads.github.com/repos/fixture/public/releases/1/assets{?name,label}'},201);
  if(route==='releases/1' && method==='PATCH') return json({draft:false,published_at:'2026-10-04T01:02:03Z'});
  if(route==='git/trees' && method==='POST') return json({sha:'newtree'},201);
  if(route==='git/commits' && method==='POST') return json({sha:'newcommit'},201);
  if(route==='git/refs/heads/gh-pages' && method==='PATCH') return json({},process.env.FAIL_CAS==='1'?409:200);
  throw new Error('Unexpected fixture route');
};
`;
function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "goro-publish-test-"));
  try {
    const assets = join(root, "assets"), metadata = join(root, "metadata"); mkdirSync(assets); mkdirSync(metadata);
    writeFileSync(join(root, "mock.mjs"), preload); writeFileSync(join(root, "notes.md"), "notes");
    const contracts = contractFixture(assets);
    if (overrides.BAD_METADATA) contracts.release.downloads[0].sha256 = "0".repeat(64);
    writeFileSync(join(metadata, "release.json"), JSON.stringify(contracts.release));
    writeFileSync(join(metadata, "latest.json"), JSON.stringify(contracts.updater));
    const log = join(root, "requests.jsonl");
    const result = spawnSync(process.execPath, ["--import", pathToFileURL(join(root, "mock.mjs")).href, "scripts/publish-release.mjs", "--assets-dir", assets, "--metadata-dir", metadata, "--notes", join(root, "notes.md")], {encoding:"utf8",env:{...process.env,GORO_RELEASE_REPOSITORY:"fixture/public",GORO_RELEASE_BASE_URL:"https://fixture.github.io/public/channels/",GORO_RELEASE_TOKEN:"test-only-token",FIXTURE_LOG:log,FIXTURE_SUMS:contracts.checksums,...overrides}});
    const requests = readFileSync(log,"utf8").trim().split("\n").map(line=>JSON.parse(line));
    return {result,requests};
  } finally { const target=resolve(root); if(dirname(target)===resolve(tmpdir())&&basename(target).startsWith("goro-publish-test-")) rmSync(target,{recursive:true,force:true}); }
}
test("publisher verifies every public asset before atomically advancing eligible pointers", () => {
  const {result,requests}=fixture(); assert.equal(result.status,0,result.stderr);
  const published=requests.findIndex(row=>row.method==="PATCH"&&row.path.endsWith("releases/1"));
  const publicRead=requests.findIndex(row=>row.path.includes("/releases/download/"));
  const metadata=requests.findIndex(row=>row.method==="POST"&&row.path.endsWith("git/trees"));
  assert.ok(published<publicRead&&publicRead<metadata);
  const tree=JSON.parse(requests[metadata].body).tree;
  assert.ok(tree.some(row=>row.path==="channels/stable/updater.json"));
  assert.ok(tree.some(row=>row.path==="channels/beta/latest.json"));
  const website = JSON.parse(tree.find(row=>row.path==="channels/stable/release.json").content);
  const updater = JSON.parse(tree.find(row=>row.path==="channels/stable/latest.json").content);
  assert.equal(website.publishedAt,"2026-10-04T01:02:03Z");
  assert.equal(updater.pub_date,website.publishedAt);
  assert.equal(updater.schemaVersion,undefined);
  assert.equal(website.version,updater.version);
  assert.ok(!tree.some(row=>row.path.startsWith("channels/alpha/")));
  assert.ok(!requests[metadata].body.includes("test-only-token"));
  assert.ok(requests.filter(row=>row.path.includes("/releases/download/")).every(row=>!row.auth));
  assert.equal(requests.at(-1).method,"PATCH");
  assert.equal(JSON.parse(requests.at(-1).body).force,false);
});
test("publisher rejects modified metadata before creating any release", () => {
  const failure=fixture({BAD_METADATA:"1"}); assert.equal(failure.result.status,1);
  assert.ok(!failure.requests.some(row=>row.method==="POST"));
});

test("an already public source repository can also host verified distribution", () => {
  const {result,requests}=fixture({GITHUB_REPOSITORY:"fixture/public"});
  assert.equal(result.status,0,result.stderr);
  assert.ok(requests.some(row=>row.method==="PATCH"&&row.path.endsWith("git/refs/heads/gh-pages")));
});
test("published versions and immutable version metadata are never reused", () => {
  for (const overrides of [{REUSED_VERSION:"1"},{REUSED_METADATA:"1"}]) {
    const failure=fixture(overrides); assert.equal(failure.result.status,1);
    assert.ok(!failure.requests.some(row=>row.method==="POST"));
  }
});
test("failed public verification never writes metadata; private targets never get releases", () => {
  const failure=fixture({FAIL_PUBLIC:"1"}); assert.equal(failure.result.status,1); assert.ok(!failure.requests.some(row=>row.method==="POST"&&row.path.endsWith("git/trees")));
  const privateRepo=fixture({PRIVATE_REPO:"1"}); assert.equal(privateRepo.result.status,1); assert.ok(!privateRepo.requests.some(row=>row.method==="POST"));
  const race=fixture({FAIL_CAS:"1"}); assert.equal(race.result.status,1); assert.ok(race.result.stderr.includes("409")); assert.ok(!race.result.stderr.includes("test-only-token"));
});
