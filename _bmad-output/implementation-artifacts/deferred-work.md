## Deferred from: code review of 2-7-lsp-diagnostics (2026-04-12)

- Incomplete error handling for missing gopls: If gopls is not found, the system defaults to "no diagnostics" without notifying the user about the missing dependency. [src-tauri/src/integration/gopls.rs:47]
- Potential missing diagnostics from stderr: The current logic only reads stderr if stdout is empty, which might miss mixed output scenarios. [src-tauri/src/integration/gopls.rs:57]
