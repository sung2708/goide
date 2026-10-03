import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");

const docs = [
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "docs/README.md",
  "docs/PRODUCT.md",
  "docs/BRAND.md",
  "docs/ARCHITECTURE.md",
  "docs/DEVELOPMENT.md",
  "docs/BUILDING.md",
  "docs/TESTING.md",
  "docs/ENGINEERING_RULES.md",
  "docs/ROADMAP.md",
  "docs/VERSIONING.md",
  "docs/RELEASE.md",
  "docs/UPDATES.md",
  "docs/RELEASE_READINESS.md",
  "docs/NAVIGATION_SEARCH.md",
  "docs/TROUBLESHOOTING.md",
];

let errors = 0;
let checkedLinks = 0;

for (const doc of docs) {
  const full = resolve(ROOT_DIR, doc);
  if (!existsSync(full)) {
    console.error(`[FAIL] Document missing: ${doc}`);
    errors++;
    continue;
  }

  const content = readFileSync(full, "utf8");
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    const rawTarget = match[2].trim();
    const target = rawTarget.split("#")[0];

    if (
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:") ||
      !target
    ) {
      continue;
    }

    checkedLinks++;
    const targetPath = resolve(dirname(full), target);
    if (!existsSync(targetPath)) {
      console.error(`[FAIL] Broken link in ${doc} -> "${rawTarget}" (resolved: ${targetPath})`);
      errors++;
    }
  }
}

if (errors === 0) {
  console.log(`[PASS] All ${checkedLinks} relative Markdown links validated successfully across ${docs.length} documents!`);
  process.exit(0);
} else {
  console.error(`[FAIL] Found ${errors} broken link(s).`);
  process.exit(1);
}
