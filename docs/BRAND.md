# Goro brand

> **Goro — Understand Go in motion.**

Goro takes its name from **goroutine**. The name borrows its sound and opening letters; `ro` is not a separate acronym. The product was previously named GoIDE. Repository URLs and internal application identifiers retain `goide` for continuity.

Goro's runtime gopher connects the familiar Go ecosystem to a dedicated IDE. Its small editor panel and breakpoint identify the workbench; three outward paths suggest concurrent goroutines. The amber node represents runtime observation. This is an independent Goro adaptation of the Go gopher, not an official Go product.

## Message system

| Placement | Message |
| --- | --- |
| Core brand line / app welcome | **Understand Go in motion.** |
| README / GitHub description | A Go IDE for coding, debugging, and understanding concurrent programs. |
| Website hero | Write Go. See it run. Understand what happens. |
| Technical introduction | A concurrency-aware development environment for Go. |
| Short supporting line | See Go in motion. |

Lead with understanding program behavior, then connect that promise to source editing, execution, debugging, and concurrency observations. Keep the IDE identity explicit in introductions. Avoid unsupported speed/memory comparisons, claiming complete runtime visibility, or presenting planned testing/debugging capabilities as shipped. The roadmap and product evidence model remain authoritative.

The mascot is a **runtime explorer**: calm, curious, and attentive to concurrent flow. The primary logo retains a neutral expression. Alternate expressions can support observed runtime states or documentation illustrations without adding product functionality.

## Assets

All canonical artwork lives in [`public/brand`](../public/brand). SVGs contain editable geometry, no raster images, and no external fonts. The Goro wordmark is drawn from original geometric paths.

| Use | Asset |
| --- | --- |
| Primary / light background | `logo.svg`, `logo-light.svg` |
| Dark background / README | `logo-dark.svg`, `readme.svg` |
| Compact / navbar | `logo-compact.svg`, `navbar.svg` |
| Wordmark only | `wordmark.svg` |
| Mascot | `mascot.svg` |
| App icon | `icon.svg` |
| Single color | `logo-monochrome.svg`, `icon-monochrome.svg` |
| Silhouette | `icon-silhouette.svg` |
| Small icon / favicon | `icon-small.svg`, `favicon.ico` |
| Website hero / social preview | `hero.svg`, `social-preview.svg`, `social-preview.png` |
| PNG exports | `icon-{16,24,32,48,64,128,256,512,1024}.png` |
| Native packaging | `src-tauri/icons`: ICO, ICNS, PNG, Windows store, Android and iOS variants |

Use the simplified icon at 16–32 px; it drops fine strokes while retaining the ears, eyes, teeth, editor, and three flow trails. Use the full mascot from 48 px. Horizontal lockups should be at least 174 px wide (compact) or 260 px wide (primary). Keep clear space of at least one ear's diameter around the mark. Do not crop the trails, stretch the artwork, recolor individual pieces, add glow, or put text inside the app icon.

## Colors

| Token | Value | Role |
| --- | --- | --- |
| `--brand-primary` | `#35CDBE` | Gopher and concurrent paths |
| `--brand-secondary` | `#123A50` | Ink and editor panel |
| `--brand-surface` | `#10232F` | Contained icon background |
| `--brand-light` | `#EFF9F8` | Eyes and dark-background wordmark |
| `--brand-accent` | `#F4B45F` | Breakpoint / observation node |

These tokens live in `src/styles/global.css`; editor syntax and diagnostic colors remain independent. Choose `logo-light.svg` on pale surfaces and `logo-dark.svg` on dark surfaces. Monochrome SVGs use `currentColor`, defaulting to black when loaded as standalone images; when inlining them, set the surrounding color for the chosen background.

In the workbench, use one static 16 px icon in the compact titlebar and a 28 px simplified mascot on the welcome screen. Keep branding out of the code surface: no editor watermark, animated mascot, logo overlay or glow. The titlebar uses a plain surface without backdrop blur. Editing, completion, selection and keyboard response take priority over decorative effects; preserve all named palettes and the Black & White default.

## Extensions

Future neutral, focused, happy, confused, warning, and debugging illustrations should preserve the tall body, round ears, white eyes, two teeth, and three paths. Expressions belong in illustrations, not alternate primary logos. The editor breakpoint and parallel paths can extend into race and goroutine illustrations without implying that a planned product feature already exists.

## Attribution and licensing

The Go gopher was created by Renee French. The [official Go gopher article](https://go.dev/blog/gopher) publishes the artwork under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Goro's gopher artwork is an adaptation: vector geometry, proportions, colors, editor/breakpoint panel, and concurrent trails have changed. Gopher-derived assets in `public/brand` and `src-tauri/icons` are provided under CC BY 4.0. Preserve this attribution when redistributing them; the project's MIT software license does not replace it. Original wordmark geometry is covered by the project's MIT license.

Attribution appears in the README, this guide, SVG descriptions, and the application's welcome screen. Goro is not affiliated with or endorsed by the Go project.

## Icon export

The export script uses the installed Tauri v2 CLI to generate native icon formats and PNG sizes from the canonical SVGs:

```sh
npm run brand:icons
```

The script exports `icon-small.svg` at 16, 24, and 32 px, replaces `src-tauri/icons/32x32.png` with the simplified export, and builds the native ICO with those small entries and full-size 48, 64, 128, and 256 px entries. `favicon.ico` contains only the simplified 16, 24, and 32 px entries. All PNGs are RGBA. The existing Tauri bundle icon configuration consumes these files for the native application and installers; no runtime feature changes are needed.
