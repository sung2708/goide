import { publicBase } from "./release-metadata.mjs";
try {
  publicBase(process.env.GORO_RELEASE_BASE_URL);
  if (!process.env.GORO_RELEASE_BASE_URL.endsWith("/channels/")) throw new Error("Release base must end with /channels/");
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(process.env.GORO_RELEASE_REPOSITORY ?? "")) throw new Error("Set the public distribution repository variable");
  if (process.env.GITHUB_REPOSITORY?.toLowerCase() === process.env.GORO_RELEASE_REPOSITORY.toLowerCase()) throw new Error("Use a separate public distribution repository, not the source repository");
  const key = process.env.GORO_UPDATER_PUBLIC_KEY;
  if (!key || !Buffer.from(key, "base64").toString().startsWith("untrusted comment:")) throw new Error("Set the Tauri updater public verification key");
  const signingKey = process.env.GORO_SIGNING_PUBLIC_KEY || key;
  if (!Buffer.from(signingKey, "base64").toString().startsWith("untrusted comment:")) throw new Error("The signing verification public key is invalid");
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) throw new Error("Signing secret is missing; unsigned updater artifacts cannot be released");
  console.log("Secure update configuration is present; artifact verification will validate the key cryptographically.");
} catch (error) { console.error(error.message); process.exitCode = 1; }
