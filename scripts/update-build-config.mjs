// Public build configuration only: signing secrets are never serialized here.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
try {
  const key = (process.env.GORO_SIGNING_PUBLIC_KEY || process.env.GORO_UPDATER_PUBLIC_KEY || "").trim();
  if (!key || !Buffer.from(key, "base64").toString().startsWith("untrusted comment:")) throw new Error("A real Tauri signing public key is required");
  const config = JSON.parse(readFileSync(new URL("../src-tauri/tauri.updater.conf.json", import.meta.url)));
  config.plugins = { updater: { pubkey: key, requireSignedVersion: true, allowDowngrades: false } };
  mkdirSync(resolve(".tmp"), { recursive: true });
  writeFileSync(resolve(".tmp/goro-updater-build.json"), JSON.stringify(config, null, 2) + "\n");
  console.log("Public updater/signing configuration generated in .tmp/goro-updater-build.json");
} catch (error) { console.error(error.message); process.exitCode = 1; }
