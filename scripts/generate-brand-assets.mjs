// Canonical editable SVGs live in public/brand. No raster artwork is traced.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public/brand');
const read = name => readFileSync(join(dir, name), 'utf8');
const body = svg => svg.replace(/^.*?<svg[^>]*>/s, '').replace(/<\/svg>\s*$/, '').replace(/<(title|desc)>.*?<\/\1>/gs, '');
const mark = body(read('mascot.svg')), small = body(read('mark-small.svg'));
const slogan = body(read('source/slogan.svg'));
let wordPart = 0;
const word = body(read('source/wordmark.svg')).replace(/#158D83|#123A50/g, () => ++wordPart <= 2 ? '#00ADD8' : 'currentColor').replace(/stroke-width="5"/g, 'stroke-width="7"');
const svg = (box, content, title = 'Goro') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box}" fill="none"><title>${title}</title><desc>Original Goro identity. Three parallel trails represent concurrent execution. MIT artwork; slogan outlines use Syne, SIL OFL 1.1.</desc>${content}</svg>\n`;
const write = (name, box, content, title) => writeFileSync(join(dir, name), svg(box, content, title));
const colors = { light: '#123A50', dark: '#EFF9F8' };
const lockup = (color, withSlogan = true) => `${mark}<g color="${color}" transform="translate(176 28)">${word}</g>${withSlogan ? `<g fill="${color}" transform="translate(177 82) scale(.85)">${slogan}</g>` : ''}`;
write('mark.svg', '160 112', mark);
write('mark-light.svg', '160 112', mark);
write('mark-dark.svg', '160 112', mark.replace(/stroke="#123A50"/g, 'stroke="#35CDBE"'));
for (const [mode, color] of Object.entries(colors)) {
  write(`logo-${mode}.svg`, '360 112', lockup(color));
  write(`logo-horizontal-${mode}.svg`, '360 112', lockup(color, false));
  write(`logo-slogan-${mode}.svg`, '360 112', lockup(color));
  write(`wordmark-${mode}.svg`, '164 52', `<g color="${color}">${word}</g>`);
  write(`stacked-${mode}.svg`, '240 244', `<g transform="translate(40 4)">${mark}</g><g color="${color}" transform="translate(38 128)">${word}</g><g fill="${color}" transform="translate(24 198)">${slogan}</g>`);
  write(`readme-${mode}.svg`, '360 112', lockup(color));
  write(`app-icon-${mode}.svg`, '104 104', `<rect x="2" y="2" width="100" height="100" rx="23" fill="${mode === 'dark' ? '#10232F' : '#EFF9F8'}"/><g transform="translate(10 24) scale(.525)">${mark}</g>`);
}
write('logo-compact.svg', '360 112', lockup(colors.light, false));
const silhouette = `<rect x="12" y="38" width="48" height="10" rx="5"/><rect x="2" y="61" width="58" height="10" rx="5"/><rect x="24" y="84" width="38" height="10" rx="5"/><path d="M73 32Q58 15 67 10Q77 5 84 25Q109 13 123 25Q130 10 139 16Q147 23 136 35Q152 45 152 61C152 84 129 97 102 96C77 96 59 85 58 69C58 62 62 55 62 46Q62 36 73 32Z"/>`;
for (const [name, color] of Object.entries({ black: '#000000', white: '#FFFFFF', brand: '#35CDBE', gray: '#667784' })) {
  write(`monochrome-${name}.svg`, '160 112', `<g fill="${color}">${silhouette}</g>`);
}
write('icon-silhouette.svg', '160 112', `<g fill="currentColor">${silhouette}</g>`);
write('logo-monochrome.svg', '360 112', `<g fill="currentColor">${silhouette}</g><g transform="translate(176 28)">${word.replace(/#00ADD8/g, 'currentColor')}</g>`);
write('icon.svg', '104 104', `<rect x="2" y="2" width="100" height="100" rx="23" fill="#10232F"/><g transform="translate(10 24) scale(.525)">${mark}</g>`);
write('app-icon-brand.svg', '104 104', `<rect x="2" y="2" width="100" height="100" rx="23" fill="#35CDBE"/><g transform="translate(10 24) scale(.525)">${mark.replace(/fill="#35CDBE"/g, 'fill="#EFF9F8"')}</g>`);
write('icon-small.svg', '104 104', `<rect x="2" y="2" width="100" height="100" rx="23" fill="#10232F"/><g transform="translate(7 21) scale(.56)">${small}</g>`);
write('favicon.svg', '104 104', `<rect x="2" y="2" width="100" height="100" rx="23" fill="#10232F"/><g transform="translate(7 21) scale(.56)">${small}</g>`);
for (const [mode, color] of Object.entries(colors)) {
  write(`banner-${mode}.svg`, '1200 630', `<rect width="1200" height="630" fill="${mode === 'dark' ? '#10232F' : '#EFF9F8'}"/><g transform="translate(650 130) scale(3)">${mark}</g><g color="${color}" transform="translate(96 220) scale(2.7)">${word}</g><g fill="${color}" transform="translate(102 408) scale(2)">${slogan}</g>`);
}
writeFileSync(join(dir, 'social-preview.svg'), read('banner-dark.svg'));
// Optional PNG exports use sharp already installed in a graphics runtime.
// No graphics dependency is added to the application's runtime dependencies.
if (process.env.GORO_SHARP_MODULE) {
  const sharp = createRequire(import.meta.url)(process.env.GORO_SHARP_MODULE);
  for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
    await sharp(Buffer.from(svg('160 112', size <= 32 ? small : mark))).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(join(dir, `mark-${size}.png`));
  }
  for (const mode of ['light', 'dark', 'brand']) {
    await sharp(join(dir, `app-icon-${mode}.svg`)).resize(1024, 1024).png().toFile(join(dir, `app-icon-${mode}.png`));
  }
  for (const mode of ['light', 'dark']) {
    await sharp(join(dir, `logo-${mode}.svg`)).resize(1080, 336).png().toFile(join(dir, `logo-${mode}.png`));
    await sharp(join(dir, `banner-${mode}.svg`)).png().toFile(join(dir, `banner-${mode}.png`));
  }
  await sharp(join(dir, 'social-preview.svg')).png().toFile(join(dir, 'social-preview.png'));
  await sharp(join(dir, 'app-icon-light.svg')).resize(180, 180).png().toFile(join(dir, 'apple-touch-icon.png'));
}
console.log('Goro SVG asset family regenerated.');
