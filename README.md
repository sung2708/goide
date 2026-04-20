# goide

`goide` is a Tauri desktop IDE focused on Go editing, concurrency analysis, runtime inspection, race-detector workflows, and lightweight debugger controls.

## Core capabilities

- Open a local workspace and browse files in an IDE-style explorer
- Edit Go source with CodeMirror-based syntax highlighting
- Run active Go files and stream stdout/stderr into the terminal panel
- Run with `-race` and surface race-detector findings in the editor
- Show diagnostics and completions through `gopls`
- Start a Delve-backed runtime session for breakpoints, pause/continue/step, and sampled runtime observations

## Required local tooling

For the full IDE experience, these commands must be available on `PATH`:

- `go` for running active Go files
- `gopls` for diagnostics, completions, and symbol enrichment
- `dlv` for runtime sessions and breakpoint control

The app runs a toolchain preflight and surfaces missing tools in the status bar and editor shell.

## Runtime behavior notes

### Runtime signal timeout

Runtime polling timeout can be configured with:

- `VITE_RUNTIME_SIGNAL_TIMEOUT_MS`

Behavior:

- Default: `450` ms
- Accepted range: `100` to `5000` ms
- Out-of-range or non-numeric values fall back to the default

### Product honesty notes

- Runtime topology is built from sampled/inferred runtime observations, not a full causality graph
- Race-detector findings come from `go run -race` output and are labeled separately from runtime-sampled observations
- Runtime sessions depend on local Delve availability and may degrade when the debugger backend is unavailable

## Build and verification

### Frontend

```bash
npm test
npm run build
```

### Rust / Tauri backend

```bash
cargo build --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

## Windows build note

On Windows, `cargo build`, `cargo test`, or `npm run tauri build` can fail if Git's `usr/bin/link.exe` or a Zig compiler override is picked up instead of the MSVC toolchain. If that happens, rerun from an MSVC-configured shell and force `cl` for both C and C++:

```powershell
cmd /c ""C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 && powershell"
$env:CC="cl"
$env:CXX="cl"
$env:HOST_CC="cl"
$env:HOST_CXX="cl"
cargo build --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

## Recommended IDE setup for contributors

- [VS Code](https://code.visualstudio.com/)
- [Tauri VS Code extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
