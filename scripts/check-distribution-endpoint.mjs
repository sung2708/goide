// Read-only, unauthenticated acceptance check after Pages/CDN provisioning or propagation.
import { publicBase, accepts } from "./release-metadata.mjs";
import { validateDate, releaseChannel, artifactMatrix } from "./release-contract.mjs";
try {
  const args = process.argv.slice(2);
  const option = flag => { const index = args.indexOf(flag); if (index < 0 || !args[index + 1]) throw new Error(`Missing ${flag}`); return args[index + 1]; };
  const base = publicBase(option("--base-url"));
  const origin = new URL(option("--website-origin"));
  if (origin.protocol !== "https:" || origin.origin !== option("--website-origin")) throw new Error("Website origin must be an HTTPS origin without path");
  const channel = option("--channel");
  if (!["stable", "beta", "alpha"].includes(channel)) throw new Error("Unknown channel");
  const responses = await Promise.all(["release.json", "latest.json"].map(async name => {
    const response = await fetch(new URL(`${channel}/${name}`, base), { headers: { Origin: origin.origin, "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Public ${name} unavailable (${response.status})`);
    const cors = response.headers.get("access-control-allow-origin");
    if (cors !== "*" && cors !== origin.origin) throw new Error(`Public ${name} lacks website CORS`);
    if (response.headers.get("access-control-allow-credentials") === "true") throw new Error("Public metadata must not enable credentialed CORS");
    const cache = response.headers.get("cache-control") ?? "";
    const lifetime = cache.match(/(?:^|,)\s*(?:s-maxage|max-age)=(\d+)/g)?.map(value=>Number(value.split("=")[1])) ?? [];
    if (!/no-store|no-cache/.test(cache) && (!lifetime.length || Math.max(...lifetime) > 600)) throw new Error(`Public ${name} cache lifetime must be at most 600 seconds`);
    const bytes = await response.text();
    if (Buffer.byteLength(bytes) > 256 * 1024) throw new Error("Public metadata exceeds size policy");
    return JSON.parse(bytes);
  }));
  const [release, updater] = responses;
  if (release.schemaVersion !== 1 || release.product !== "Goro" || !accepts(channel, release.version) || release.channel !== releaseChannel(release.version) || release.tag !== `v${release.version}` || release.version !== updater.version || release.publishedAt !== updater.pub_date || release.releaseNotes !== updater.notes) throw new Error("Public website/updater release mismatch");
  validateDate(release.publishedAt);
  if (!Array.isArray(release.downloads) || release.downloads.length !== artifactMatrix.length) throw new Error("Public artifact matrix is incomplete");
  for (const entry of artifactMatrix) {
    const download = release.downloads.find(item=>item.filename === `goro-v${release.version}-${entry.suffix}`);
    if (!download || download.platformKey !== entry.platformKey || !/^[0-9a-f]{64}$/.test(download.sha256) || !Number.isSafeInteger(download.size) || download.size <= 0) throw new Error("Public artifact fields invalid");
    const url = new URL(download.url);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Public download URL must be credential-free HTTPS");
    for (const key of entry.updaterKeys) if (updater.platforms?.[key]?.url !== download.url || !updater.platforms[key].signature) throw new Error("Public updater target missing or inconsistent");
  }
  const expectedKeys = artifactMatrix.flatMap(entry=>entry.updaterKeys).sort();
  if (JSON.stringify(Object.keys(updater.platforms).sort()) !== JSON.stringify(expectedKeys)) throw new Error("Public updater includes unsupported targets");
  console.log(`PASS: ${channel} ${release.version}, public CORS, bounded cache and matching contracts. Binary integrity is separately verified by the publisher.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
