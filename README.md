# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Windows Build Note

On Windows, the `vswhom-sys` build step can fail if `zig` is picked up as the C/C++ compiler. If you see errors about the MSVC target being unknown, rerun with MSVC explicitly:

```powershell
$env:CC="cl"
$env:CXX="cl"
cargo test
```
