import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import semver from "semver";

// This is the supported CI matrix, not every target Tauri could theoretically build.
export const artifactMatrix = [
  { suffix: "windows-x86_64-setup.exe", platformKey: "windows-x86_64", format: "exe", updaterKeys: ["windows-x86_64", "windows-x86_64-nsis"] },
  { suffix: "windows-x86_64.msi", platformKey: "windows-x86_64", format: "msi", updaterKeys: ["windows-x86_64-msi"] },
  { suffix: "macos-aarch64.dmg", platformKey: "macos-aarch64", format: "dmg", updaterKeys: [] },
  { suffix: "macos-aarch64-updater.tar.gz", platformKey: "macos-aarch64", format: "app.tar.gz", updaterKeys: ["darwin-aarch64"] },
  { suffix: "macos-x86_64.dmg", platformKey: "macos-x86_64", format: "dmg", updaterKeys: [] },
  { suffix: "macos-x86_64-updater.tar.gz", platformKey: "macos-x86_64", format: "app.tar.gz", updaterKeys: ["darwin-x86_64"] },
  { suffix: "linux-x86_64.AppImage", platformKey: "linux-x86_64", format: "AppImage", updaterKeys: ["linux-x86_64", "linux-x86_64-appimage"] },
  { suffix: "linux-x86_64.deb", platformKey: "linux-x86_64", format: "deb", updaterKeys: [] },
];
export function releaseChannel(version) {
  const parsed = typeof version === "string" ? semver.parse(version) : null;
  const canonical = parsed && `${parsed.version}${parsed.build.length ? `+${parsed.build.join(".")}` : ""}`;
  if (!parsed || canonical !== version) throw new Error("Invalid canonical SemVer");
  const pre = parsed.prerelease[0];
  if (pre === undefined) return "stable";
  if (["beta", "rc"].includes(pre)) return "beta";
  if (pre === "alpha") return "alpha";
  throw new Error("Unsupported prerelease channel");
}
export function accepts(channel, version) {
  if (!["stable", "beta", "alpha"].includes(channel)) return false;
  try { const classification = releaseChannel(version); return classification === "stable" || (channel !== "stable" && classification === "beta") || channel === "alpha"; } catch { return false; }
}
export function validateDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value.replace("Z", ".000Z")) throw new Error("Publication date must be a real RFC3339 UTC timestamp");
}
export function assetInventory(assetsDir, version, repository) {
  releaseChannel(version);
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error("Invalid public release repository");
  const prefix = `goro-v${version}-`;
  const expected = artifactMatrix.map(entry => prefix + entry.suffix);
  const files = readdirSync(assetsDir);
  for (const name of expected) if (!files.includes(name)) throw new Error(`Missing release artifact: ${name}`);
  for (const name of files) {
    const binary = name.endsWith(".sig") ? name.slice(0, -4) : name.endsWith(".sha256") ? name.slice(0, -7) : name;
    if (name !== "SHA256SUMS.txt" && !expected.includes(binary)) throw new Error("Unexpected, stale or unsupported artifact");
    if (!lstatSync(resolve(assetsDir, name)).isFile()) throw new Error("Artifact must be a regular file");
  }
  return artifactMatrix.map(entry => {
    const filename = prefix + entry.suffix;
    const bytes = readFileSync(resolve(assetsDir, filename));
    if (!bytes.length || bytes.length > 256 * 1048576) throw new Error("Artifact size outside updater policy");
    return { ...entry, filename, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(filename)}` };
  });
}
export function validateContracts({ release, updater, assetsDir, repository, requireChecksums = true }) {
  if (!release || release.schemaVersion !== 1 || release.product !== "Goro") throw new Error("Invalid release schemaVersion/product");
  const channel = releaseChannel(release.version);
  if (release.tag !== `v${release.version}` || release.channel !== channel || updater?.version !== release.version) throw new Error("Metadata version/channel mismatch");
  validateDate(release.publishedAt);
  if (updater.pub_date !== release.publishedAt || updater.notes !== release.releaseNotes || typeof release.releaseNotes !== "string" || Buffer.byteLength(release.releaseNotes) > 65536) throw new Error("Metadata date/notes mismatch");
  const root = `https://github.com/${repository}/releases/`;
  if (release.releaseUrl !== `${root}tag/${release.tag}` || release.checksumUrl !== `${root}download/${release.tag}/SHA256SUMS.txt`) throw new Error("Invalid public release URL");
  const inventory = assetInventory(assetsDir, release.version, repository);
  if (!Array.isArray(release.downloads) || release.downloads.length !== inventory.length) throw new Error("Invalid downloads array");
  const seen = new Set();
  for (const download of release.downloads) {
    const entry = inventory.find(item => item.filename === download.filename);
    if (!entry || seen.has(download.filename)) throw new Error("Unsupported or duplicate download");
    seen.add(download.filename);
    for (const field of ["platformKey", "format", "url", "sha256", "size"]) if (download[field] !== entry[field]) throw new Error(`Download ${field} does not match artifact`);
    const [platform, architecture] = entry.platformKey.split("-");
    if (download.platform !== platform || download.architecture !== architecture) throw new Error("Unsupported platform/architecture");
  }
  const expectedKeys = inventory.flatMap(entry => entry.updaterKeys).sort();
  if (!updater.platforms || JSON.stringify(Object.keys(updater.platforms).sort()) !== JSON.stringify(expectedKeys)) throw new Error("Invalid updater platform matrix");
  for (const entry of inventory) for (const key of entry.updaterKeys) {
    const target = updater.platforms[key];
    const signature = readFileSync(resolve(assetsDir, `${entry.filename}.sig`), "utf8").trim();
    if (!signature || signature.length > 4096 || target.url !== entry.url || target.signature !== signature) throw new Error("Updater signature/URL does not match artifact");
  }
  if (requireChecksums) {
    const lines = readFileSync(resolve(assetsDir, "SHA256SUMS.txt"), "utf8").trim().split(/\r?\n/);
    const expected = inventory.map(entry => `${entry.sha256}  ${entry.filename}`).sort();
    if (JSON.stringify(lines.sort()) !== JSON.stringify(expected)) throw new Error("Missing, duplicate or incorrect checksum entry");
  }
  return inventory;
}
