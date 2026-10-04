import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const brand = join(root, "public", "brand");
const scratch = mkdtempSync(join(tmpdir(), "goro-brand-"));
const cli = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");

function generate(source, output, sizes = []) {
  const result = spawnSync(process.execPath, [cli, "icon", source, "-o", output,
    ...sizes.flatMap(size => ["--png", String(size)])], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Icon export failed (${result.status})`);
}

function ico(sizes) {
  const images = sizes.map(size => readFileSync(join(brand, `icon-${size}.png`)));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  return Buffer.concat([header, ...images]);
}

try {
  const native = join(scratch, "native");
  const small = join(scratch, "small");
  const large = join(scratch, "large");
  generate(join(brand, "icon.svg"), native);
  generate(join(brand, "icon-small.svg"), small, [16, 24, 32]);
  generate(join(brand, "icon.svg"), large, [48, 64, 128, 256, 512, 1024]);
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    copyFileSync(join(size <= 32 ? small : large, `${size}x${size}.png`), join(brand, `icon-${size}.png`));
  }
  cpSync(native, join(root, "src-tauri", "icons"), { recursive: true });
  copyFileSync(join(brand, "icon-32.png"), join(root, "src-tauri", "icons", "32x32.png"));
  writeFileSync(join(brand, "favicon.ico"), ico([16, 24, 32]));
  for (const size of [16, 32, 48]) {
    copyFileSync(join(brand, `icon-${size}.png`), join(brand, `favicon-${size}x${size}.png`));
  }
  writeFileSync(join(root, "src-tauri", "icons", "icon.ico"), ico([16, 24, 32, 48, 64, 128, 256]));
  console.log("Goro icons exported, including simplified small ICO entries.");
} finally {
  const target = resolve(scratch);
  if (dirname(target) === resolve(tmpdir()) && basename(target).startsWith("goro-brand-")) {
    rmSync(target, { recursive: true, force: true });
  }
}
