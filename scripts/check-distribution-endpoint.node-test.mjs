import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { contractFixture } from "./release-contract-fixture.mjs";
function check(mode) {
  const root = mkdtempSync(join(tmpdir(), "goro-endpoint-test-"));
  try {
    const assets = join(root,"assets"); mkdirSync(assets);
    const contracts = contractFixture(assets,"0.2.0-alpha.2");
    if (mode === "version") contracts.updater.version = "0.2.0-alpha.1";
    writeFileSync(join(root,"contracts.json"),JSON.stringify(contracts));
    writeFileSync(join(root,"mock.mjs"), `
import { readFileSync } from 'node:fs';
const contracts=JSON.parse(readFileSync(new URL('./contracts.json',import.meta.url)));
globalThis.fetch=async (url,options)=>{
 if(options.headers.Authorization || options.headers.Origin!=='https://website.example') throw new Error('Wrong public request headers');
 const name=new URL(url).pathname.split('/').at(-1);
 return new Response(JSON.stringify(name==='release.json'?contracts.release:contracts.updater),{status:200,headers:{'Access-Control-Allow-Origin':process.env.ENDPOINT_TEST_MODE==='cors'?'https://wrong.example':'*','Cache-Control':process.env.ENDPOINT_TEST_MODE==='cache'?'max-age=86400':'max-age=600'}});
};
`);
    return spawnSync(process.execPath,["--import",pathToFileURL(join(root,"mock.mjs")).href,resolve("scripts/check-distribution-endpoint.mjs"),"--base-url","https://fixture.github.io/public/channels/","--website-origin","https://website.example","--channel","alpha"],{encoding:"utf8",env:{...process.env,ENDPOINT_TEST_MODE:mode}});
  } finally { rmSync(root,{recursive:true,force:true}); }
}
test("public endpoint check verifies both contracts, anonymous CORS and bounded caching",()=>{
 const result=check("valid"); assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/PASS/);
});
test("endpoint check rejects CORS, indefinite cache and mismatched released versions",()=>{
 for(const mode of ["cors","cache","version"]) {const result=check(mode);assert.equal(result.status,1);}
});
