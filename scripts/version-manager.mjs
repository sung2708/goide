#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { toMsiVersion } from "./windows-installer-version.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");

const PACKAGE_JSON_PATH = resolve(ROOT_DIR, "package.json");
const TAURI_CONF_PATH = resolve(ROOT_DIR, "src-tauri", "tauri.conf.json");
const CARGO_TOML_PATH = resolve(ROOT_DIR, "src-tauri", "Cargo.toml");

const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function readVersions() {
  const pkgRaw = readFileSync(PACKAGE_JSON_PATH, "utf8");
  const pkg = JSON.parse(pkgRaw);
  const pkgVersion = pkg.version;

  const tauriRaw = readFileSync(TAURI_CONF_PATH, "utf8");
  const tauri = JSON.parse(tauriRaw);
  const tauriVersion = tauri.version;

  const cargoRaw = readFileSync(CARGO_TOML_PATH, "utf8");
  const cargoMatch = cargoRaw.match(/\[package\][\s\S]*?version\s*=\s*"([^"]+)"/);
  const cargoVersion = cargoMatch ? cargoMatch[1] : null;

  return {
    pkgVersion,
    tauriVersion,
    cargoVersion,
    msiVersion: tauri.bundle?.windows?.wix?.version,
    pkgRaw,
    tauriRaw,
    cargoRaw,
  };
}

function normalizeTag(tag) {
  if (!tag) return null;
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

function validateSemver(ver) {
  return SEMVER_REGEX.test(ver);
}

const args = process.argv.slice(2);
const command = args[0] || "check";

switch (command) {
  case "check": {
    const { pkgVersion, tauriVersion, cargoVersion, msiVersion } = readVersions();
    let hasError = false;

    console.log("Checking project version sources...");
    console.log(` - package.json:         ${pkgVersion}`);
    console.log(` - tauri.conf.json:      ${tauriVersion}`);
    console.log(` - src-tauri/Cargo.toml: ${cargoVersion}`);
    console.log(` - Windows MSI:          ${msiVersion}`);

    if (!pkgVersion || !validateSemver(pkgVersion)) {
      console.error(`[ERROR] package.json version "${pkgVersion}" is not valid SemVer.`);
      hasError = true;
    }

    if (pkgVersion !== tauriVersion) {
      console.error(
        `[ERROR] Version mismatch: package.json (${pkgVersion}) != tauri.conf.json (${tauriVersion})`
      );
      hasError = true;
    }

    if (pkgVersion !== cargoVersion) {
      console.error(
        `[ERROR] Version mismatch: package.json (${pkgVersion}) != Cargo.toml (${cargoVersion})`
      );
      hasError = true;
    }

    if (pkgVersion && validateSemver(pkgVersion)) {
      try {
        const expected = toMsiVersion(pkgVersion);
        if (msiVersion !== expected) {
          console.error(`[ERROR] MSI version mismatch: expected ${expected}, got ${msiVersion}. Run version:set.`);
          hasError = true;
        }
      } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        hasError = true;
      }
    }

    const tagFlagIndex = args.indexOf("--tag");
    if (tagFlagIndex !== -1 && args[tagFlagIndex + 1]) {
      const rawTag = args[tagFlagIndex + 1];
      const tagVersion = normalizeTag(rawTag);
      console.log(` - git tag:              ${rawTag} (normalized: ${tagVersion})`);

      if (!validateSemver(tagVersion)) {
        console.error(`[ERROR] Tag "${rawTag}" does not represent valid SemVer.`);
        hasError = true;
      }

      if (tagVersion !== pkgVersion) {
        console.error(
          `[ERROR] Tag version mismatch: git tag is "${rawTag}" (${tagVersion}), but repository version is "${pkgVersion}".`
        );
        hasError = true;
      }
    }

    if (hasError) {
      console.error("\nVersion check FAILED. Please resolve version drift before continuing.");
      process.exit(1);
    }

    console.log(`\n[OK] All version sources are synchronized at ${pkgVersion}.`);
    break;
  }

  case "get": {
    const { pkgVersion, tauriVersion, cargoVersion } = readVersions();
    if (pkgVersion !== tauriVersion || pkgVersion !== cargoVersion) {
      console.error(
        `[ERROR] Version drift detected! (pkg: ${pkgVersion}, tauri: ${tauriVersion}, cargo: ${cargoVersion})`
      );
      process.exit(1);
    }
    console.log(pkgVersion);
    break;
  }

  case "set": {
    let targetVersion = args[1];
    if (!targetVersion) {
      console.error("Usage: node scripts/version-manager.mjs set <version>");
      process.exit(1);
    }
    if (targetVersion.startsWith("v")) {
      targetVersion = targetVersion.slice(1);
    }

    if (!validateSemver(targetVersion)) {
      console.error(`[ERROR] "${targetVersion}" is not a valid Semantic Version.`);
      process.exit(1);
    }

    const { pkgRaw, tauriRaw, cargoRaw } = readVersions();
    let msiVersion;
    try {
      msiVersion = toMsiVersion(targetVersion);
    } catch (error) {
      console.error(`[ERROR] ${error.message}`);
      process.exit(1);
    }

    // 1. Update package.json
    const pkg = JSON.parse(pkgRaw);
    pkg.version = targetVersion;
    writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + "\n", "utf8");

    // 2. Update tauri.conf.json
    const tauri = JSON.parse(tauriRaw);
    tauri.version = targetVersion;
    tauri.bundle ??= {};
    tauri.bundle.windows ??= {};
    tauri.bundle.windows.wix ??= {};
    tauri.bundle.windows.wix.version = msiVersion;
    writeFileSync(TAURI_CONF_PATH, JSON.stringify(tauri, null, 2) + "\n", "utf8");

    // 3. Update Cargo.toml [package] version
    const updatedCargo = cargoRaw.replace(
      /(\[package\][\s\S]*?version\s*=\s*)"[^"]+"/,
      `$1"${targetVersion}"`
    );
    writeFileSync(CARGO_TOML_PATH, updatedCargo, "utf8");

    console.log(`[OK] Successfully synchronized all files to version ${targetVersion}`);
    break;
  }

  default:
    console.error(`Unknown command: "${command}". Available commands: check, get, set.`);
    process.exit(1);
}
