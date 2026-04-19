# GoIDE

GoIDE is a desktop IDE for Go focused on concurrency-aware development. It combines a familiar editor, workspace explorer, inline diagnostics, completions, terminal output, and Go-specific concurrency signals in one installable Tauri app.

## Download

Download the latest Windows installer from the GitHub Releases page.

For v1.0.0, use one of these artifacts:

- `goide_1.0.0_x64_en-US.msi`
- `goide_1.0.0_x64-setup.exe`

Install GoIDE, open the app, then choose a Go workspace folder.

## Features

- Open and browse Go workspaces.
- Edit Go files with syntax highlighting and editor snippets.
- Save files directly from the editor.
- Run the active Go file.
- Run the active Go file with the Go race detector.
- View run output in the built-in terminal panel.
- Receive diagnostics and completions through `gopls`.
- See concurrency signals for goroutines, channels, mutexes, wait groups, blocking operations, and related counterpart lines.
- Use Deep Trace runtime sampling through Delve when available.
- See startup toolchain status for `go`, `gopls`, and `dlv`.

## Requirements

GoIDE works best when these commands are available on `PATH`:

- `go` for running Go files.
- `gopls` for diagnostics, completions, and symbol enrichment.
- `dlv` for Deep Trace runtime sampling.

Install the Go tools with:

```powershell
go install golang.org/x/tools/gopls@latest
go install github.com/go-delve/delve/cmd/dlv@latest
```

The app runs a startup preflight check and surfaces missing tools in the status bar.

## Current Analysis Engine

GoIDE v1.0.0 currently uses:

- CodeMirror Lezer for frontend Go syntax highlighting.
- A lightweight Rust tokenizer for static concurrency markers.
- `gopls` for diagnostics, completions, and symbol enrichment.
- Delve (`dlv`) for runtime Deep Trace sampling.

Tree-sitter is not integrated in v1.0.0.

## Build From Source

Install dependencies:

```powershell
npm install
```

Run tests:

```powershell
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Build the desktop app:

```powershell
npm run tauri -- build
```

Release artifacts are generated under:

```text
src-tauri/target/release/bundle/
```

On Windows, if the Rust build picks the wrong C/C++ compiler, open a Visual Studio Developer PowerShell or run:

```powershell
$env:CC="cl"
$env:CXX="cl"
npm run tauri -- build
```

## License

MIT
