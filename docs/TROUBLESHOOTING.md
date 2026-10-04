# Goro Troubleshooting Guide

This guide provides diagnosis and resolution steps for common issues encountered when building, running, or developing Goro.

---

## 1. Toolchain & PATH Issues

Goro runs preflight checks on startup. Missing external tools are surfaced in the status bar.

### Starting a Go project (develop; not included in alpha.5)

- Choose **New Go Project…** on the welcome screen or **New Go Project** in the command palette. Select a parent folder and enter a new folder name and module path, such as `example.com/hello`.
- Goro uses the configured Go executable to run `go mod init`, adds a runnable `main.go`, and opens the project through the usual document-preservation workflow. Existing directories are rejected. If creation fails, inspect the reported folder before retrying; partial files are retained.
- `go.sum` is created by Go when dependencies require checksums. A standard-library-only starter does not need it.
- For a saved standalone `main.go` without a module or Go workspace, **Run** executes that file directly without creating module files. Module/workspace projects continue to run the selected package, including its helper files. Imports requiring modules need a module and dependencies first; package/workspace test execution still requires `go.mod` or `go.work`.
- Run/Debug entry controls sit beside the declaration and do not add editor rows. Controls from an obsolete source snapshot cannot start execution.

### Issue: `go` executable not found
- **Symptom**: Status bar indicates Go is missing; running Go files fails.
- **Resolution**:
  - Ensure Go 1.21+ is installed from [golang.org](https://go.dev/dl/).
  - Ensure the Go binary directory (`C:\Program Files\Go\bin` on Windows, `/usr/local/go/bin` on Linux/macOS) is in your system `PATH`.
  - Restart Goro or your terminal after updating `PATH`.

### Issue: `gopls` language server not found
- **Symptom**: Autocompletion, hover hints, and LSP diagnostics do not appear.
- **Resolution**:
  - Install `gopls`:
    ```bash
    go install golang.org/x/tools/gopls@latest
    ```
  - Ensure `$GOPATH/bin` (or `%USERPROFILE%\go\bin` on Windows) is included in your system `PATH`.

### Issue: `dlv` (Delve) debugger not found
- **Symptom**: "Debug File" action is disabled or triggers a missing debugger modal.
- **Resolution**:
  - Install Delve:
    ```bash
    go install github.com/go-delve/delve/cmd/dlv@latest
    ```
  - Verify Delve is executable by running `dlv version` in your terminal.

---

## 2. Windows MSVC Build & Linker Quirks

### Issue: `link.exe` conflict or Zig compiler override
- **Symptom**: `cargo build` or `npm run tauri build` fails with linker errors like `unrecognized option '/DEBUG'` or errors from Git's `usr/bin/link.exe`.
- **Cause**: Git for Windows includes a Unix `link` utility in its `usr/bin` folder, or an active Zig installation overrides `CC`/`CXX`.
- **Resolution**:
  - Use Goro's built-in wrapper: `scripts/cargo_check_msvc.cmd` or `scripts/tauri_build_msvc.cmd`.
  - From PowerShell, run the repository helper; it initializes MSVC in the same cmd.exe process as Cargo:
    ```powershell
    .\scripts\cargo_check_msvc.cmd --locked
    ```
    Running VsDevCmd.bat as a child of PowerShell does not import its environment into PowerShell. A Developer Command Prompt can also invoke Cargo directly.

---

## 3. Terminal & PTY Issues

### Issue: Terminal displays blank or fails to spawn shell
- **Symptom**: Bottom terminal dock opens with an error or fails to display a prompt.
- **Resolution**:
  - On Windows, verify PowerShell is accessible: `powershell.exe` or `pwsh.exe`.
  - On Linux/macOS, the current implementation launches `bash -l`; verify bash is installed and executable. `$SHELL` and configurable default-shell selection are not currently honored.
  - Close and reopen the terminal tab to force session re-initialization.

---

## 4. Runtime Inspection & Signal Polling

### Issue: "Runtime unavailable" or polling timeouts
- **Symptom**: Trace bubbles remain in an unconfirmed state or runtime signal polling times out.
- **Cause**: The active Go process exited before Delve could sample runtime observations, or polling timeout is too tight.
- **Resolution**:
  - Increase the polling timeout via the environment variable in `.env`:
    ```bash
    VITE_RUNTIME_SIGNAL_TIMEOUT_MS=1000
    ```
    (Accepted range is 100 to 5000 ms; defaults to 450 ms).

---

## 5. Filesystem Sync Fallback

### Issue: File changes made outside Goro do not update Explorer
- **Symptom**: External file edits are delayed or missing in the file tree.
- **Behavior**: The desktop app registers a native watcher and falls back to 900 ms polling if native setup fails or the native watcher reports an error. Polling compares entry type, file size, and modification time. Startup/subscription failures appear in the workbench; backend scan errors are logged without treating inaccessible files as deleted.
- **Limits**: `.git`, `node_modules`, `target`, and `dist` are excluded from sync scans. Links are not traversed. Workspaces exceeding 100,000 scanned entries or 256 directory levels report a startup error. Browser preview has no native watcher. A polling edit preserving both size and modification time can be missed; Explorer sync does not reload active document contents.
- **Workaround**: Refresh Explorer manually for excluded trees or unavailable sync. On network filesystems that silently omit native events, use manual refresh. External-edit conflict handling remains tracked in [ROADMAP.md](ROADMAP.md).
