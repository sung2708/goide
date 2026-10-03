// Deterministic local metadata fixtures only; these are not installers or release signatures.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { artifactMatrix, assetInventory, releaseChannel } from "./release-contract.mjs";
export function contractFixture(assetsDir, version = "1.1.0", repository = "fixture/public") {
  for (const entry of artifactMatrix) {
    const path = join(assetsDir, `goro-v${version}-${entry.suffix}`);
    writeFileSync(path, "artifact");
    if (entry.updaterKeys.length) writeFileSync(`${path}.sig`, "signature");
  }
  const inventory = assetInventory(assetsDir, version, repository);
  const publishedAt = "2026-10-03T00:00:00Z";
  const release = { schemaVersion: 1, product: "Goro", version, tag: `v${version}`, channel: releaseChannel(version), publishedAt, releaseNotes: "notes", releaseUrl: `https://github.com/${repository}/releases/tag/v${version}`, checksumUrl: `https://github.com/${repository}/releases/download/v${version}/SHA256SUMS.txt`, downloads: inventory.map(({ filename, platformKey, format, url, sha256, size }) => ({ filename, platformKey, platform: platformKey.split("-")[0], architecture: platformKey.split("-")[1], format, url, sha256, size })) };
  const updater = { version, pub_date: publishedAt, notes: "notes", platforms: Object.fromEntries(inventory.flatMap(entry => entry.updaterKeys.map(key => [key, { url: entry.url, signature: "signature" }]))) };
  const checksums = inventory.map(entry => `${entry.sha256}  ${entry.filename}`).sort().join("\n") + "\n";
  writeFileSync(join(assetsDir, "SHA256SUMS.txt"), checksums);
  return { release, updater, checksums };
}
