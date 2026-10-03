import assert from "node:assert/strict";
import test from "node:test";
import semver from "semver";
import { accepts, releaseChannel, publicBase, generateMetadata } from "./release-metadata.mjs";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
test("numeric version ordering and channel policy match the native updater", () => {
  for (const [older, newer] of [["0.1.9", "0.2.0"], ["0.2.0-beta.1", "0.2.0-beta.2"], ["0.2.0-rc.1", "0.2.0"], ["0.99.0", "1.0.0"]]) assert.ok(semver.gt(newer, older));
  for (const [version, expected] of [["1.0.0", [true,true,true]], ["1.0.0-rc.1", [false,true,true]], ["1.0.0-beta.1", [false,true,true]], ["1.0.0-alpha.1", [false,false,true]], ["1.0.0-preview.1", [false,false,false]]]) assert.deepEqual(["stable", "beta", "alpha"].map(channel => accepts(channel, version)), expected);
  assert.equal(releaseChannel("1.0.0-rc.1"), "beta"); assert.throws(() => releaseChannel("01.0.0")); assert.throws(() => releaseChannel("1.0.0-preview.1"));
});
test("public endpoints reject plaintext, credentials, fragments and query tokens", () => {
  for (const url of ["http://public.example/", "https://token@public.example/", "https://public.example/?secret=x", "https://public.example/#secret", "https://public.example/channels"]) assert.throws(() => publicBase(url));
  assert.equal(publicBase("https://public.example/channels/").protocol, "https:");
});
test("metadata generation fails closed without a real verifier, invalid date or repository", () => {
  const options = { version: "1.0.0", repository: "owner/public", publishedAt: "2026-10-03T00:00:00Z", notes: "Notes" };
  assert.throws(() => generateMetadata(options), /verifier/);
  assert.throws(() => generateMetadata({ ...options, publishedAt: "yesterday" }), /RFC3339/);
  assert.throws(() => generateMetadata({ ...options, repository: "https://private/token" }), /repository/);
});
test("real Tauri signatures bind artifacts and version; both public contracts share the same verified release", { timeout: 120000 }, () => {
  const verifier = resolve(`tools/update-verifier/target/release/goro-update-verifier${process.platform === "win32" ? ".exe" : ""}`);
  // Build the small, official Minisign verifier deterministically, with no desktop dependencies.
  if (!existsSync(verifier)) { const built = spawnSync("cargo", ["build", "--locked", "--release", "--manifest-path", "tools/update-verifier/Cargo.toml"], { encoding: "utf8", timeout: 120000 }); assert.equal(built.status, 0, built.stderr); }
  const fixture = mkdtempSync(join(tmpdir(), "goro-update-fixture-"));
  const cli = resolve("node_modules/@tauri-apps/cli/tauri.js");
  const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  const sign = (file, appVersion = version) => {
    const result = spawnSync(process.execPath, [cli, "signer", "sign", "--private-key-path", join(fixture, "test.key"), "--password", "", "--app-version", appVersion, file], { encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, "Ephemeral fixture signing failed");
  };
  try {
    const generated = spawnSync(process.execPath, [cli, "signer", "generate", "--ci", "--password", "", "--write-keys", join(fixture, "test.key")], { encoding: "utf8", timeout: 30000 });
    assert.equal(generated.status, 0, "Ephemeral fixture key generation failed");
    const publicKey = readFileSync(join(fixture, "test.key.pub"), "utf8").trim();
    const configResult = spawnSync(process.execPath, [resolve("scripts/update-build-config.mjs")], { cwd: fixture, encoding: "utf8", env: { ...process.env, GORO_UPDATER_PUBLIC_KEY: publicKey, GORO_SIGNING_PUBLIC_KEY: publicKey, TAURI_SIGNING_PRIVATE_KEY: "test-secret-must-never-be-serialized" } });
    assert.equal(configResult.status, 0, configResult.stderr);
    const configText = readFileSync(join(fixture, ".tmp/goro-updater-build.json"), "utf8"); const config = JSON.parse(configText);
    assert.equal(config.plugins.updater.pubkey, publicKey); assert.equal(config.plugins.updater.requireSignedVersion, true); assert.equal(config.plugins.updater.allowDowngrades, false); assert.equal(config.bundle.createUpdaterArtifacts, true);
    assert.ok(!configText.includes("test-secret-must-never-be-serialized"));
    const names = ["windows-x86_64-setup.exe", "windows-x86_64.msi", "macos-aarch64-updater.tar.gz", "macos-x86_64-updater.tar.gz", "linux-x86_64.AppImage"];
    const assets = join(fixture, "assets");
    mkdirSync(assets);
    for (const name of names) { const path = join(assets, `goro-v${version}-${name}`); writeFileSync(path, `signed fixture bytes: ${name}`); sign(path); }
    for (const name of ["macos-aarch64.dmg", "macos-x86_64.dmg", "linux-x86_64.deb"]) writeFileSync(join(assets, `goro-v${version}-${name}`), `human download fixture: ${name}`);
    sign(join(assets, `goro-v${version}-macos-aarch64.dmg`));
    sign(join(assets, `goro-v${version}-linux-x86_64.deb`));
    const options = { version, repository: "fixture/public-distribution", assetsDir: assets, publishedAt: "2026-10-03T00:00:00Z", notes: "<script>plain text only</script>", verifier, publicKey };
    const result = generateMetadata(options);
    assert.equal(result.updater.version, result.release.version);
    assert.equal(result.release.tag, `v${version}`);
    assert.equal(result.release.channel, releaseChannel(version));
    assert.equal(Object.keys(result.updater.platforms).length, 7);
    assert.ok(result.updater.platforms["darwin-aarch64"].url.endsWith("-updater.tar.gz"));
    assert.equal(result.updater.platforms["linux-x86_64-deb"], undefined);
    for (const entry of Object.values(result.updater.platforms)) { assert.ok(entry.signature.length > 100); assert.ok(entry.url.startsWith(`https://github.com/fixture/public-distribution/releases/download/v${version}/`)); }
    assert.equal(result.release.downloads.length, 8); assert.equal(result.checksums.trim().split("\n").length, 8);
    // Exercise the actual CLI entry point and filenames, including its canonical source checks.
    const notesPath = join(fixture, "notes.md"); writeFileSync(notesPath, options.notes);
    const metadata = join(fixture, "metadata");
    const generatedMetadata = spawnSync(process.execPath, [resolve("scripts/release-metadata.mjs"), "--tag", `v${version}`, "--repository", options.repository, "--assets-dir", assets, "--output-dir", metadata, "--notes", notesPath, "--verifier", verifier, "--published-at", options.publishedAt], { encoding: "utf8", env: { ...process.env, GORO_UPDATER_PUBLIC_KEY: publicKey, GORO_SIGNING_PUBLIC_KEY: publicKey } });
    assert.equal(generatedMetadata.status, 0, generatedMetadata.stderr);
    assert.deepEqual(JSON.parse(readFileSync(join(metadata, "release.json"), "utf8")), result.release);
    assert.deepEqual(JSON.parse(readFileSync(join(metadata, "latest.json"), "utf8")), result.updater);
    assert.equal(readFileSync(join(metadata, "latest.json"), "utf8"), readFileSync(join(metadata, "updater.json"), "utf8"));
    assert.equal(readFileSync(join(assets, "SHA256SUMS.txt"), "utf8"), result.checksums);
    const path = join(assets, `goro-v${version}-${names[0]}`);
    writeFileSync(path, "tampered bytes");
    assert.throws(() => generateMetadata(options), /Signature verification failed/);
    sign(path, semver.inc(version, "patch"));
    assert.throws(() => generateMetadata(options), /Signature verification failed/);
    sign(path);
    assert.throws(() => generateMetadata({ ...options, publicKey: Buffer.from("not a public key").toString("base64") }), /Signature verification failed/);
    writeFileSync(`${path}.sig`, "malformed signature");
    assert.throws(() => generateMetadata(options), /Signature verification failed/);
  } finally {
    const target = resolve(fixture);
    if (dirname(target) === resolve(tmpdir()) && basename(target).startsWith("goro-update-fixture-")) rmSync(target, { recursive: true, force: true });
  }
});
