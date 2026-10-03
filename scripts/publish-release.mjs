// CI only. The credential never enters application configuration or public metadata.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import semver from "semver";
import { accepts, publicBase, releaseChannel } from "./release-metadata.mjs";
import { validateContracts, validateDate } from "./release-contract.mjs";
const repository = process.env.GORO_RELEASE_REPOSITORY;
const token = process.env.GORO_RELEASE_TOKEN;
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
async function request(path, options = {}, expected = [200, 201]) {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, { ...options, redirect: "error", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...options.headers }, signal: AbortSignal.timeout(60000) });
  if (!expected.includes(response.status)) throw new Error(`Release API request failed (${response.status}). Latest metadata remains unchanged.`);
  if (response.status === 404) return null;
  return response.json();
}
const body = value => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
try {
  for (const flag of ["--assets-dir", "--metadata-dir", "--notes"]) if (!args.includes(flag)) throw new Error(`Missing ${flag}`);
  if (!repository || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository) || !token) throw new Error("Public repository and CI publisher credential must be configured");
  const base = publicBase(process.env.GORO_RELEASE_BASE_URL);
  if (!base.pathname.endsWith("/channels/")) throw new Error("Distribution base must end in /channels/ for the Pages contract");
  const repo = await request("");
  if (repo.private || repo.visibility !== "public") throw new Error("Distribution repository must already be public; no visibility changes are performed");
  const directory = resolve(option("--assets-dir"));
  const metadata = resolve(option("--metadata-dir"));
  const latest = JSON.parse(readFileSync(resolve(metadata, "release.json")));
  const updater = JSON.parse(readFileSync(resolve(metadata, "latest.json")));
  validateContracts({ release: latest, updater, assetsDir: directory, repository });
  const notes = readFileSync(option("--notes"), "utf8");
  if (notes !== latest.releaseNotes) throw new Error("Release notes differ from verified metadata");
  if (!semver.valid(latest.version) || updater.version !== latest.version || latest.tag !== `v${latest.version}` || latest.channel !== releaseChannel(latest.version)) throw new Error("Metadata version mismatch");
  if (await request(`releases/tags/${encodeURIComponent(latest.tag)}`, {}, [200, 404])) throw new Error("Version already exists; never replace published release assets");
  // Read the channel tree before creating a release; absence is an explicit setup failure.
  const reference = await request("git/ref/heads/gh-pages");
  const commit = await request(`git/commits/${reference.object.sha}`);
  const tree = await request(`git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated) throw new Error("Distribution tree is too large");
  if (tree.tree.some(entry => entry.path.startsWith(`versions/${latest.version}/`))) throw new Error("Version metadata already exists; immutable versions cannot be replaced");
  const release = await request("releases", body({ tag_name: latest.tag, name: `Goro ${latest.tag}`, body: notes, draft: true, prerelease: latest.channel !== "stable" }));
  const uploadUrl = release.upload_url.replace(/\{.*$/, "");
  const uploadOrigin = new URL(uploadUrl);
  if (uploadOrigin.protocol !== "https:" || uploadOrigin.hostname !== "uploads.github.com" || uploadOrigin.username || uploadOrigin.password || uploadOrigin.search || uploadOrigin.hash) throw new Error("Unsafe GitHub asset upload endpoint");
  const filenames = readdirSync(directory).filter(name => !name.endsWith(".sha256"));
  const publishedFiles = [];
  for (const filename of filenames) {
    const bytes = readFileSync(resolve(directory, filename));
    const uploaded = await fetch(`${uploadUrl}?name=${encodeURIComponent(filename)}`, { method: "POST", redirect: "error", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: bytes, signal: AbortSignal.timeout(600000) });
    if (!uploaded.ok) throw new Error("Artifact upload failed; draft retained and latest metadata unchanged");
    const asset = await uploaded.json();
    const expected = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (asset.state !== "uploaded" || asset.size !== bytes.length || asset.digest !== expected) throw new Error("Uploaded artifact integrity acknowledgement failed");
    publishedFiles.push({ url: `https://github.com/${repository}/releases/download/${latest.tag}/${encodeURIComponent(filename)}`, size: bytes.length, sha256: expected.slice(7) });
  }
  const published = await request(`releases/${release.id}`, { ...body({ draft: false }), method: "PATCH" });
  validateDate(published.published_at);
  latest.publishedAt = published.published_at;
  updater.pub_date = published.published_at;
  // Public unauthenticated availability is mandatory before advertising any latest pointer.
  for (const download of publishedFiles) {
    const response = await fetch(download.url, { signal: AbortSignal.timeout(600000) });
    if (!response.ok) throw new Error("Public artifact unavailable; latest metadata unchanged");
    const digest = createHash("sha256"); let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > download.size) throw new Error("Public artifact size mismatch"); digest.update(chunk); }
    if (size !== download.size || digest.digest("hex") !== download.sha256) throw new Error("Public artifact checksum mismatch; latest metadata unchanged");
  }
  const entries = [];
  validateContracts({ release: latest, updater, assetsDir: directory, repository });
  for (const channel of ["stable", "beta", "alpha"]) {
    if (!accepts(channel, latest.version)) continue;
    const existing = tree.tree.find(entry => entry.path === `channels/${channel}/release.json`) ?? tree.tree.find(entry => entry.path === `channels/${channel}/latest.json`);
    if (existing) {
      const blob = await request(`git/blobs/${existing.sha}`);
      const previous = JSON.parse(Buffer.from(blob.content, "base64").toString());
      if (!accepts(channel, previous.version)) throw new Error("Existing channel metadata is invalid");
      if (!semver.gt(latest.version, previous.version)) continue;
    }
    for (const [filename, value] of [["release.json", latest], ["latest.json", updater], ["updater.json", updater]]) entries.push({ path: `channels/${channel}/${filename}`, mode: "100644", type: "blob", content: JSON.stringify(value, null, 2) + "\n" });
  }
  // Immutable version metadata and all eligible channel pointers share one atomic commit.
  for (const [filename, value] of [["release.json", latest], ["latest.json", updater], ["updater.json", updater]]) entries.push({ path: `versions/${latest.version}/${filename}`, mode: "100644", type: "blob", content: JSON.stringify(value, null, 2) + "\n" });
  const newTree = await request("git/trees", body({ base_tree: commit.tree.sha, tree: entries }));
  const newCommit = await request("git/commits", body({ message: `Publish Goro ${latest.tag} metadata`, tree: newTree.sha, parents: [reference.object.sha] }));
  await request("git/refs/heads/gh-pages", { ...body({ sha: newCommit.sha, force: false }), method: "PATCH" });
  console.log(`Public release ${latest.tag} verified; version metadata and eligible channel pointers committed. Pages propagation must be checked before announcing.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
