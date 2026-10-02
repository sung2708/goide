#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tag: null,
    platform: null,
    arch: null,
    bundleDir: null,
    outputDir: resolve(ROOT_DIR, "dist-release"),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--tag" && args[i + 1]) options.tag = args[++i];
    else if (args[i] === "--platform" && args[i + 1]) options.platform = args[++i];
    else if (args[i] === "--arch" && args[i + 1]) options.arch = args[++i];
    else if (args[i] === "--bundle-dir" && args[i + 1]) options.bundleDir = args[++i];
    else if (args[i] === "--output-dir" && args[i + 1]) options.outputDir = args[++i];
  }

  return options;
}

function normalizePlatform(p) {
  if (!p) return null;
  const lower = p.toLowerCase();
  if (lower.includes("win")) return "windows";
  if (lower.includes("mac") || lower.includes("darwin")) return "macos";
  if (lower.includes("linux")) return "linux";
  return lower;
}

function normalizeArch(a) {
  if (!a) return null;
  const lower = a.toLowerCase();
  if (lower === "x64" || lower === "x86_64" || lower === "amd64") return "x86_64";
  if (lower === "arm64" || lower === "aarch64") return "aarch64";
  return lower;
}

function computeSha256(filePath) {
  const buffer = readFileSync(filePath);
  return createHash("sha256").update(buffer).digest("hex").toLowerCase();
}

function findFilesRecursive(dir, matchFn) {
  if (!existsSync(dir)) return [];
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesRecursive(fullPath, matchFn));
    } else if (entry.isFile() && matchFn(entry.name, fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function findBundleDirs(explicitBundleDir) {
  const candidates = [];
  if (explicitBundleDir && existsSync(explicitBundleDir)) {
    candidates.push(explicitBundleDir);
  }

  const defaultBundle = resolve(ROOT_DIR, "src-tauri", "target", "release", "bundle");
  if (existsSync(defaultBundle)) {
    candidates.push(defaultBundle);
  }

  // Also check target-specific bundle folders: src-tauri/target/*/release/bundle
  const targetRoot = resolve(ROOT_DIR, "src-tauri", "target");
  if (existsSync(targetRoot)) {
    for (const d of readdirSync(targetRoot, { withFileTypes: true })) {
      if (d.isDirectory() && d.name !== "release" && d.name !== "debug") {
        const candidate = join(targetRoot, d.name, "release", "bundle");
        if (existsSync(candidate) && !candidates.includes(candidate)) {
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates;
}

function main() {
  const options = parseArgs();

  if (!options.tag) {
    console.error("[ERROR] Missing required --tag argument (e.g. --tag v0.2.0-alpha.1)");
    process.exit(1);
  }

  const tag = options.tag.startsWith("v") ? options.tag : `v${options.tag}`;
  const platform = normalizePlatform(options.platform);
  const arch = normalizeArch(options.arch);

  if (!["windows", "macos", "linux"].includes(platform)) {
    console.error(
      `[ERROR] Invalid platform: "${options.platform}". Must be one of: windows, macos, linux.`
    );
    process.exit(1);
  }

  if (!["x86_64", "aarch64"].includes(arch)) {
    console.error(`[ERROR] Invalid arch: "${options.arch}". Must be one of: x86_64, aarch64.`);
    process.exit(1);
  }

  console.log(`Packaging release artifacts for:`);
  console.log(` - Tag:      ${tag}`);
  console.log(` - Platform: ${platform}`);
  console.log(` - Arch:     ${arch}`);
  console.log(` - Output:   ${options.outputDir}`);

  // Clean and recreate output directory to prevent stale artifacts
  if (existsSync(options.outputDir)) {
    rmSync(options.outputDir, { recursive: true, force: true });
  }
  mkdirSync(options.outputDir, { recursive: true });

  const bundleDirs = findBundleDirs(options.bundleDir);
  console.log(`Searching for bundle outputs in:`, bundleDirs);

  const matchedArtifacts = [];

  for (const bDir of bundleDirs) {
    if (platform === "windows") {
      // 1. NSIS setup executable: goide-v{VERSION}-windows-{ARCH}-setup.exe
      const nsisFiles = findFilesRecursive(bDir, (name) => name.endsWith(".exe") && !name.endsWith(".exe.sig"));
      for (const nsis of nsisFiles) {
        matchedArtifacts.push({
          source: nsis,
          targetName: `goide-${tag}-windows-${arch}-setup.exe`,
        });
      }

      // 2. MSI installer: goide-v{VERSION}-windows-{ARCH}.msi
      const msiFiles = findFilesRecursive(bDir, (name) => name.endsWith(".msi"));
      for (const msi of msiFiles) {
        matchedArtifacts.push({
          source: msi,
          targetName: `goide-${tag}-windows-${arch}.msi`,
        });
      }
    } else if (platform === "macos") {
      // 3. DMG: goide-v{VERSION}-macos-{ARCH}.dmg
      const dmgFiles = findFilesRecursive(bDir, (name) => name.endsWith(".dmg"));
      for (const dmg of dmgFiles) {
        matchedArtifacts.push({
          source: dmg,
          targetName: `goide-${tag}-macos-${arch}.dmg`,
        });
      }
    } else if (platform === "linux") {
      // 4. AppImage: goide-v{VERSION}-linux-{ARCH}.AppImage
      const appImageFiles = findFilesRecursive(bDir, (name) => name.endsWith(".AppImage"));
      for (const appImg of appImageFiles) {
        matchedArtifacts.push({
          source: appImg,
          targetName: `goide-${tag}-linux-${arch}.AppImage`,
        });
      }

      // 5. Debian package: goide-v{VERSION}-linux-{ARCH}.deb
      const debFiles = findFilesRecursive(bDir, (name) => name.endsWith(".deb"));
      for (const deb of debFiles) {
        matchedArtifacts.push({
          source: deb,
          targetName: `goide-${tag}-linux-${arch}.deb`,
        });
      }
    }
  }

  // De-duplicate in case multiple directories had the same artifact
  const uniqueArtifacts = new Map();
  for (const item of matchedArtifacts) {
    if (!uniqueArtifacts.has(item.targetName)) {
      uniqueArtifacts.set(item.targetName, item);
    }
  }

  if (uniqueArtifacts.size === 0) {
    console.error(
      `[ERROR] No valid Tauri distribution artifacts found in bundle directories for ${platform} ${arch}.`
    );
    console.error(`Checked directories:`, bundleDirs);
    process.exit(1);
  }

  const checksumEntries = [];

  for (const [targetName, { source }] of uniqueArtifacts.entries()) {
    const destination = join(options.outputDir, targetName);
    copyFileSync(source, destination);

    const hash = computeSha256(destination);
    const checksumLine = `${hash}  ${targetName}`;
    checksumEntries.push(checksumLine);

    // Write individual checksum file for intermediate workflow artifact downloads
    writeFileSync(`${destination}.sha256`, `${checksumLine}\n`, "utf8");

    console.log(`[OK] Packaged: ${targetName}`);
    console.log(`     Source:   ${source}`);
    console.log(`     SHA-256:  ${hash}`);
  }

  console.log(`\n[SUCCESS] Successfully packaged ${uniqueArtifacts.size} artifact(s) into ${options.outputDir}`);
}

main();
