#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tag: null,
    assetsDir: resolve(ROOT_DIR, "release-assets"),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tag" && args[i + 1]) options.tag = args[++i];
    else if (args[i] === "--assets-dir" && args[i + 1]) options.assetsDir = args[++i];
  }

  return options;
}

const CANONICAL_ARTIFACT_REGEX =
  /^goro-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?-(windows|macos|linux)-(x86_64|aarch64)(?:-[a-z0-9]+)?\.(exe|msi|dmg|AppImage|deb|tar\.gz|zip)$/;

const FORBIDDEN_GENERIC_PATTERNS = [
  /^setup\.exe$/i,
  /^installer\.exe$/i,
  /^app\.exe$/i,
  /^bundle\.zip$/i,
  /^goro\.exe$/i,
  /^goro\.dmg$/i,
  /^goro\.AppImage$/i,
  /^goro\.deb$/i,
];

function computeSha256(filePath) {
  const buffer = readFileSync(filePath);
  return createHash("sha256").update(buffer).digest("hex").toLowerCase();
}

function main() {
  const options = parseArgs();

  if (!options.tag) {
    console.error("[ERROR] Missing required --tag argument (e.g. --tag v0.2.0-alpha.1)");
    process.exit(1);
  }

  const tag = options.tag.startsWith("v") ? options.tag : `v${options.tag}`;
  const assetsDir = resolve(options.assetsDir);

  console.log(`Validating release assets for release ${tag} in: ${assetsDir}`);

  if (!existsSync(assetsDir)) {
    console.error(`[ERROR] Assets directory does not exist: ${assetsDir}`);
    process.exit(1);
  }

  const files = readdirSync(assetsDir).filter((name) => {
    const full = resolve(assetsDir, name);
    return statSync(full).isFile() && !name.endsWith(".sha256");
  });

  if (files.length === 0) {
    console.error(`[ERROR] No release artifacts found in ${assetsDir}.`);
    process.exit(1);
  }

  let errors = 0;

  // 1. Verify SHA256SUMS.txt exists
  const checksumManifestPath = resolve(assetsDir, "SHA256SUMS.txt");
  if (!existsSync(checksumManifestPath)) {
    console.error("[ERROR] Missing SHA256SUMS.txt in release assets.");
    errors++;
  }

  let manifestContent = "";
  const manifestMap = new Map();

  if (existsSync(checksumManifestPath)) {
    manifestContent = readFileSync(checksumManifestPath, "utf8");
    const lines = manifestContent.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const hash = parts[0].toLowerCase();
        const filename = parts.slice(1).join(" ").trim();
        manifestMap.set(filename, hash);
      }
    }
  }

  const binaryFiles = files.filter((f) => f !== "SHA256SUMS.txt");

  if (binaryFiles.length === 0) {
    console.error("[ERROR] No distributable binary artifacts found alongside checksum manifest.");
    errors++;
  }

  for (const file of binaryFiles) {
    console.log(`Checking asset: ${file}`);

    // Rule 1: No generic / ambiguous names
    for (const pattern of FORBIDDEN_GENERIC_PATTERNS) {
      if (pattern.test(file)) {
        console.error(`[ERROR] Asset has forbidden generic name: "${file}"`);
        errors++;
      }
    }

    // Rule 2: Must match canonical naming pattern
    if (!CANONICAL_ARTIFACT_REGEX.test(file)) {
      console.error(
        `[ERROR] Asset filename "${file}" does not match canonical pattern: goro-v{VERSION}-{PLATFORM}-{ARCH}[-{PACKAGE}].{EXT}`
      );
      errors++;
    }

    // Rule 3: Must contain exact tag
    if (!file.includes(tag)) {
      console.error(
        `[ERROR] Asset filename "${file}" does not contain expected release tag "${tag}".`
      );
      errors++;
    }

    // Rule 4: Preserves prerelease identifiers
    if (tag.includes("-")) {
      const prereleasePart = tag.split("-").slice(1).join("-");
      if (!file.includes(prereleasePart)) {
        console.error(
          `[ERROR] Asset filename "${file}" dropped prerelease identifier "${prereleasePart}".`
        );
        errors++;
      }
    }

    // Rule 5: Platform & architecture normalization check
    const match = file.match(/-(windows|macos|linux)-(x86_64|aarch64)/);
    if (!match) {
      console.error(
        `[ERROR] Asset "${file}" lacks normalized platform (windows|macos|linux) or architecture (x86_64|aarch64).`
      );
      errors++;
    }

    // Rule 6: Checksum verification
    const fullPath = resolve(assetsDir, file);
    const actualHash = computeSha256(fullPath);

    if (!manifestMap.has(file)) {
      console.error(`[ERROR] Asset "${file}" is not listed in SHA256SUMS.txt manifest.`);
      errors++;
    } else {
      const manifestHash = manifestMap.get(file);
      if (actualHash !== manifestHash) {
        console.error(
          `[ERROR] Hash mismatch for "${file}": manifest says ${manifestHash}, but actual computed hash is ${actualHash}`
        );
        errors++;
      } else {
        console.log(`  -> SHA-256 match confirmed: ${actualHash}`);
      }
    }
  }

  // Rule 7: Check for orphan entries in SHA256SUMS.txt
  for (const [manifestFilename] of manifestMap.entries()) {
    if (!binaryFiles.includes(manifestFilename)) {
      console.error(
        `[ERROR] SHA256SUMS.txt lists missing or non-existent asset: "${manifestFilename}"`
      );
      errors++;
    }
  }

  if (errors > 0) {
    console.error(`\n[FAIL] Release asset validation FAILED with ${errors} error(s).`);
    process.exit(1);
  }

  console.log(`\n[PASS] All ${binaryFiles.length} release asset(s) and SHA256SUMS.txt validated successfully!`);
}

main();
