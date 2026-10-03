import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateContracts } from "./release-contract.mjs";
try {
  const args = process.argv.slice(2);
  const option = flag => { const index = args.indexOf(flag); if (index < 0 || !args[index + 1]) throw new Error(`Missing ${flag}`); return args[index + 1]; };
  const metadata = resolve(option("--metadata-dir"));
  const release = JSON.parse(readFileSync(resolve(metadata, "release.json"), "utf8"));
  const updater = JSON.parse(readFileSync(resolve(metadata, "latest.json"), "utf8"));
  if (option("--tag") !== release.tag) throw new Error("Tag and metadata disagree");
  validateContracts({ release, updater, assetsDir: resolve(option("--assets-dir")), repository: option("--repository") });
  console.log(`Release and updater metadata validated for ${release.tag}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
