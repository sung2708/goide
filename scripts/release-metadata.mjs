import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import semver from "semver";
export const accepts = (channel, version) => {
  const parsed = semver.parse(version);
  if (!parsed) return false;
  const pre = parsed.prerelease[0];
  return pre === undefined || (channel !== "stable" && ["beta", "rc"].includes(pre)) || (channel === "alpha" && pre === "alpha");
};
export const releaseChannel = version => { if (!semver.valid(version)) throw new Error("Invalid SemVer"); const pre = semver.prerelease(version)?.[0]; if (pre === undefined) return "stable"; if (["beta", "rc"].includes(pre)) return "beta"; if (pre === "alpha") return "alpha"; throw new Error("Unsupported prerelease channel"); };
export function publicBase(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/")) throw new Error("Public base must be credential-free HTTPS ending in /");
  return url;
}
export function generateMetadata({ version, repository, assetsDir, publishedAt, notes, verifier, publicKey }) {
  releaseChannel(version);
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error("Invalid public release repository");
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(publishedAt) || !Number.isFinite(Date.parse(publishedAt))) throw new Error("Publication date must be RFC3339 UTC");
  if (typeof notes !== "string" || Buffer.byteLength(notes) > 65536) throw new Error("Release notes exceed 64 KiB");
  if (!verifier || !existsSync(verifier) || !publicKey) throw new Error("Real signature verifier and public key are required");
  const prefix = `goro-v${version}-`;
  const required = ["windows-x86_64-setup.exe", "windows-x86_64.msi", "macos-aarch64-updater.tar.gz", "macos-x86_64-updater.tar.gz", "linux-x86_64.AppImage"];
  const humanInstallers = ["macos-aarch64.dmg", "macos-x86_64.dmg", "linux-x86_64.deb"];
  const platforms = {};
  const downloads = [];
  const sums = [];
  const files = readdirSync(assetsDir).filter(name => !name.endsWith(".sha256") && !name.endsWith(".sig") && name !== "SHA256SUMS.txt").sort();
  for (const suffix of [...required, ...humanInstallers]) if (!files.includes(prefix + suffix)) throw new Error(`Missing release artifact: ${suffix}`);
  for (const name of files) {
    const suffix = name.slice(prefix.length);
    if (!name.startsWith(prefix) || !/^(windows|macos|linux)-(x86_64|aarch64)(-setup|-updater)?\.(exe|msi|dmg|AppImage|deb|tar\.gz)$/.test(suffix) || basename(name) !== name) throw new Error("Unexpected or stale artifact");
    const path = resolve(assetsDir, name);
    const bytes = readFileSync(path);
    if (!bytes.length || bytes.length > 256 * 1048576) throw new Error("Artifact size outside updater policy");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    sums.push(`${sha256}  ${name}`);
    const url = `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(name)}`;
    downloads.push({ filename: name, platform: suffix.split("-")[0], architecture: suffix.includes("aarch64") ? "aarch64" : "x86_64", format: name.endsWith("tar.gz") ? "app.tar.gz" : name.split(".").at(-1), url, sha256, size: bytes.length });
    const signaturePath = `${path}.sig`;
    if (required.includes(suffix) || existsSync(signaturePath)) {
      const signature = readFileSync(signaturePath, "utf8").trim();
      if (!signature || signature.length > 4096) throw new Error("Missing or oversized signature");
      const checked = spawnSync(verifier, [path, signaturePath, version], { env: { ...process.env, GORO_UPDATER_PUBLIC_KEY: publicKey }, stdio: "pipe" });
      if (checked.status !== 0) throw new Error(`Signature verification failed: ${name}`);
      const entry = { url, signature };
      if (suffix === "windows-x86_64-setup.exe") { platforms["windows-x86_64"] = entry; platforms["windows-x86_64-nsis"] = entry; }
      if (suffix === "windows-x86_64.msi") platforms["windows-x86_64-msi"] = entry;
      if (suffix.startsWith("macos-") && suffix.endsWith("-updater.tar.gz")) platforms[`darwin-${suffix.split("-")[1]}`] = entry;
      if (suffix === "linux-x86_64.AppImage") { platforms["linux-x86_64"] = entry; platforms["linux-x86_64-appimage"] = entry; }
    }
  }
  const updater = { version, notes, pub_date: publishedAt, platforms };
  const latest = { schemaVersion: 1, product: "Goro", version, tag: `v${version}`, channel: releaseChannel(version), publishedAt, releaseNotes: notes, releaseUrl: `https://github.com/${repository}/releases/tag/v${version}`, checksumUrl: `https://github.com/${repository}/releases/download/v${version}/SHA256SUMS.txt`, downloads };
  return { updater, latest, checksums: sums.join("\n") + "\n" };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2); const option = flag => args[args.indexOf(flag) + 1];
    for (const flag of ["--tag", "--repository", "--assets-dir", "--output-dir", "--notes", "--verifier", "--published-at"]) if (!args.includes(flag)) throw new Error(`Missing ${flag}`);
    const tag = option("--tag");
    const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;
    if (tag !== `v${version}`) throw new Error("Tag and canonical app version disagree");
    const result = generateMetadata({ version, repository: option("--repository"), assetsDir: resolve(option("--assets-dir")), publishedAt: option("--published-at"), notes: readFileSync(option("--notes"), "utf8"), verifier: resolve(option("--verifier")), publicKey: process.env.GORO_SIGNING_PUBLIC_KEY || process.env.GORO_UPDATER_PUBLIC_KEY });
    const output = resolve(option("--output-dir")); mkdirSync(output, { recursive: true });
    for (const name of ["updater", "latest"]) writeFileSync(resolve(output, `${name}.json`), JSON.stringify(result[name], null, 2) + "\n");
    writeFileSync(resolve(option("--assets-dir"), "SHA256SUMS.txt"), result.checksums);
    console.log(`Verified release metadata generated for ${tag}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
