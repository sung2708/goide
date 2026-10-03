import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { accepts, releaseChannel, validateDate, assetInventory, validateContracts } from "./release-contract.mjs";
export { accepts, releaseChannel };
export function publicBase(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/")) throw new Error("Public base must be credential-free HTTPS ending in /");
  return url;
}
export function generateMetadata({ version, repository, assetsDir, publishedAt, notes, verifier, publicKey }) {
  releaseChannel(version);
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error("Invalid public release repository");
  validateDate(publishedAt);
  if (typeof notes !== "string" || Buffer.byteLength(notes) > 65536) throw new Error("Release notes exceed 64 KiB");
  if (!verifier || !existsSync(verifier) || !publicKey) throw new Error("Real signature verifier and public key are required");
  const platforms = {};
  const downloads = [];
  const sums = [];
  for (const entry of assetInventory(assetsDir, version, repository)) {
    const { filename: name, url, sha256, size, format, platformKey } = entry;
    const path = resolve(assetsDir, name);
    sums.push(`${sha256}  ${name}`);
    const [platform, architecture] = platformKey.split("-");
    downloads.push({ filename: name, platformKey, platform, architecture, format, url, sha256, size });
    const signaturePath = `${path}.sig`;
    if (entry.updaterKeys.length || existsSync(signaturePath)) {
      const signature = readFileSync(signaturePath, "utf8").trim();
      if (!signature || signature.length > 4096) throw new Error("Missing or oversized signature");
      const checked = spawnSync(verifier, [path, signaturePath, version], { env: { ...process.env, GORO_UPDATER_PUBLIC_KEY: publicKey }, stdio: "pipe" });
      if (checked.status !== 0) throw new Error(`Signature verification failed: ${name}`);
      for (const key of entry.updaterKeys) platforms[key] = { url, signature };
    }
  }
  const updater = { version, notes, pub_date: publishedAt, platforms };
  const release = { schemaVersion: 1, product: "Goro", version, tag: `v${version}`, channel: releaseChannel(version), publishedAt, releaseNotes: notes, releaseUrl: `https://github.com/${repository}/releases/tag/v${version}`, checksumUrl: `https://github.com/${repository}/releases/download/v${version}/SHA256SUMS.txt`, downloads };
  validateContracts({ release, updater, assetsDir, repository, requireChecksums: false });
  return { updater, release, checksums: sums.sort().join("\n") + "\n" };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2); const option = flag => args[args.indexOf(flag) + 1];
    for (const flag of ["--tag", "--repository", "--assets-dir", "--output-dir", "--notes", "--verifier", "--published-at"]) if (!args.includes(flag)) throw new Error(`Missing ${flag}`);
    const tag = option("--tag");
    const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
    if (tag !== `v${version}`) throw new Error("Tag and canonical app version disagree");
    const versions = spawnSync(process.execPath, [fileURLToPath(new URL("./version-manager.mjs", import.meta.url)), "check", "--tag", tag], { stdio: "pipe" });
    if (versions.status !== 0) throw new Error("Application version sources disagree; metadata generation refused");
    const result = generateMetadata({ version, repository: option("--repository"), assetsDir: resolve(option("--assets-dir")), publishedAt: option("--published-at"), notes: readFileSync(option("--notes"), "utf8"), verifier: resolve(option("--verifier")), publicKey: process.env.GORO_SIGNING_PUBLIC_KEY || process.env.GORO_UPDATER_PUBLIC_KEY });
    const output = resolve(option("--output-dir")); mkdirSync(output, { recursive: true });
    for (const [name, value] of [["release.json", result.release], ["latest.json", result.updater], ["updater.json", result.updater]]) writeFileSync(resolve(output, name), JSON.stringify(value, null, 2) + "\n");
    writeFileSync(resolve(option("--assets-dir"), "SHA256SUMS.txt"), result.checksums);
    console.log(`Verified release metadata generated for ${tag}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
