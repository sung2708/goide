# Goro brand

> **Goro — Understand Go in motion.**

The product name is **Goro**, derived from goroutine. The canonical slogan is
**Understand Go in motion.**, established in README.md. Keep both verbatim.
Goro is an independent Go desktop IDE; the logo does not imply AI functionality
or affiliation with the Go project.

## Identity

The original flat mascot moves horizontally. Its rounded body and focused eyes
carry the personality; three unequal, parallel trails represent concurrent
execution. There is no rocket, flame, editor panel or terminal symbol. The eyes
look in the same direction. The optical 16–32 px mark drops the nose, mouth and
fine outline rather than shrinking all details unchanged.

Canonical editable SVGs live in [public/brand](../public/brand). The geometric
wordmark reuses the existing Goro paths, with stronger strokes. Slogan outlines
use Syne Regular, already used by the separate website. Distributable lockups
have no external font dependency. Editable slogan text and its outlined source
are retained in public/brand/source, alongside the SIL OFL license.

## Colors and contrast

| Existing token | Value | Role |
| --- | --- | --- |
| --brand-primary | #35CDBE | Mascot and execution trails |
| --brand-secondary | #123A50 | Structural outline, pupils, light wordmark |
| --brand-surface | #10232F | Dark app-icon and social background |
| --brand-light | #EFF9F8 | Eyes, light app-icon, dark wordmark |

Per the requested wordmark treatment, **Go** uses #00ADD8 blue; **ro** uses the
light/dark ink above. This wordmark accent does not change UI or syntax tokens.
Monochrome variants retain one color throughout.

These tokens remain in src/styles/global.css. No editor syntax colors or named
palettes change. Use logo-light.svg on pale surfaces and logo-dark.svg on dark
surfaces. Monochrome black/white/brand/gray assets use explicit fills; currentColor
variants are available for inline embedding. Contrast ratios are documented in
the implementation report (local archived report).

## Usage

- Titlebar: static 16 px app icon, no watermark or animation in the editor.
- Welcome: optical 28 px icon and the exact slogan. About/Updates: 24 px icon.
- Website/docs navigation: compact wordmark without slogan, at least 144 px wide.
- Horizontal slogan lockup: at least 320 px wide. Stacked slogan: at least 240 px wide.
- Mark only: use optical mark at 16–32 px; full mascot from 48 px.
- App icon: contained mark, clear margins, no squeezed horizontal wordmark.
- README: light/dark picture sources. Social preview: 1200 × 630.

Keep at least 10 units of clear space around the 160 × 112 mark (one trail's
height). Lockups include spacing; allow the same proportion outside their canvas.
Preserve aspect ratio. Do not crop trails, rotate, alter eye direction, add glow,
recolor pieces independently or use a slogan too small to read.

## Reproducible exports

```sh
npm run brand:assets
npm run brand:icons
```

The first command derives SVG variants from mascot.svg, mark-small.svg and the
editable sources. For PNG/social exports, set GORO_SHARP_MODULE to an installed
sharp module; the export script does not add a graphics dependency to the app.
The second command uses the installed Tauri v2 CLI for native PNG/ICO/ICNS and
favicon exports. ICO contains 16/24/32/48/64/128/256 px; favicon ICO contains
16/24/32 px. The small native entries use optical geometry. Tauri configuration
already points to these paths. macOS canvas leaves a margin around the mark;
actual Dock/installer acceptance is separate from successful file generation.

The source slogan path is fixed in SVG for deterministic exports. Editing its
text requires regenerating outlines with the licensed Syne font and reviewing
spacing. Do not silently substitute another font.

## Licensing and legacy migration

The current mascot and original geometric wordmark are MIT artwork. Syne slogan
outlines retain their [SIL OFL notice](../public/brand/source/Syne-OFL.txt).
Previous revisions used an adaptation of Renee French's Go gopher under CC BY
4.0; their historical attribution remains applicable to those earlier assets.
The new artwork is authored vector geometry, not a tracing of that artwork or
the attached comparison board.

Existing asset paths are replaced in place. No broken imports or duplicate
branding root is introduced. Internal goide identifiers, bundle ID, repository
URLs, storage keys, release endpoints and historical release screenshots remain
for compatibility and accuracy. There is no release or version change.

## Validation and inventory

See Brand asset implementation (local archived report) for the exact file
inventory, export evidence and remaining native/platform acceptance. Website
integration belongs to the separate goide_web repository; its asset package is
public/brand, with instructions there to preserve the same canonical sources.
