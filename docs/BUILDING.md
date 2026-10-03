# Building Goro

This guide provides instructions for building Goro from source in both development and production release modes across all supported platforms.

---

## 1. System Requirements & Prerequisites

### Cross-Platform Requirements
- **Node.js**: v20 LTS or v22 LTS (`node --version`)
- **npm**: v10+ (`npm --version`)
- **Rust**: Current stable, at least 1.88 for the locked dependencies (`rustc --version`)
- **Go**: 1.21+ (`go version`)

---

## 2. Platform-Specific Setup

### Windows (x86_64)

Windows builds require the **Microsoft Visual C++ (MSVC)** toolchain:

1. Install supported **Visual Studio / Build Tools** with the **"Desktop development with C++"** workload and a Windows SDK selected. Visual Studio 2022 Build Tools is supported. Custom installation drives are supported through `vswhere` discovery.
2. Ensure `cl.exe` and MSVC `link.exe` are available in your build environment.

> [!WARNING]
> **Windows Linker & Zig Quirks**:
> On Windows, Cargo can fail if Git's `usr/bin/link.exe` or a Zig compiler override is picked up in `PATH`.
> To prevent this, Goro includes `scripts/tauri-wrapper.mjs` which automatically cleans conflicting Zig environment variables.
> Alternatively, invoke the build from a Visual Studio Developer Command Prompt or use the helpers from PowerShell:
> ```powershell
> .\scripts\cargo_check_msvc.cmd
> .\scripts\cargo_test_msvc.cmd
> .\scripts\cargo_clippy_msvc.cmd
> .\scripts\tauri_build_msvc.cmd
> ```
> `scripts/init_msvc.cmd` discovers the C++ installation and initializes the environment in the same `cmd.exe` process as Cargo. Running `VsDevCmd.bat` directly from PowerShell does not import its environment into PowerShell. Cargo configuration must not pin an absolute linker path or compiler version.

To keep Rust tools, downloads, and caches on another drive, set `CARGO_HOME` and `RUSTUP_HOME` before installing Rust, persist them as user environment variables, and add `%CARGO_HOME%\bin` to the user PATH. Visual Studio supports custom install, shared, and download-cache paths; its installer and some system components may still use the system drive. See the [rustup installation guide](https://rust-lang.github.io/rustup/installation/) and [Microsoft installer parameters](https://learn.microsoft.com/en-us/visualstudio/install/use-command-line-parameters-to-install-visual-studio).

Tauri uses `bundle.useLocalToolsDir` to cache installer tools such as WiX and NSIS in `src-tauri/target/.tauri/` on the project drive, rather than the user's system-drive cache.

### Linux (Ubuntu / Debian x86_64)

Install the required WebKitGTK and development libraries:

```bash
sudo apt-get update
sudo apt-get install -y --no-install-recommends \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### macOS (Apple Silicon aarch64 & Intel x86_64)

1. Install **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```
2. Verify Rust target support:
   ```bash
   rustup target add aarch64-apple-darwin
   rustup target add x86_64-apple-darwin
   ```

---

## 3. Development Build

To run Goro locally in hot-reloading development mode:

```bash
# 1. Install frontend packages
npm ci

# 2. Launch Tauri in development mode
npm run tauri dev
```

This starts the Vite development server on `http://localhost:1420` and compiles the Rust backend in debug mode.

---

## 4. Production Release Build

To build optimized, standalone desktop installers and application bundles:

```bash
# Build the production bundle
npm run tauri build
```

This executes:
1. `npm run build`: Typechecks with `tsc` and bundles frontend assets with Vite into `dist/`.
2. `cargo build --release`: Compiles the native Rust backend with release optimizations into `src-tauri/target/release/`.
3. Packages the application bundle into `src-tauri/target/release/bundle/`:
   - **Windows**: NSIS executable installer (`.exe`) and Windows Installer (`.msi`).
   - **macOS**: Apple Disk Image (`.dmg`) and application bundle (`.app`).
   - **Linux**: AppImage (`.AppImage`) and Debian package (`.deb`).

---

## 5. Artifact Verification

All production releases generate cryptographic SHA-256 checksums. Verify your local build:

```bash
# Linux
sha256sum src-tauri/target/release/bundle/appimage/*.AppImage

# macOS
shasum -a 256 src-tauri/target/release/bundle/dmg/*.dmg

# Windows PowerShell
Get-FileHash src-tauri/target/release/bundle/nsis/*.exe -Algorithm SHA256
```
