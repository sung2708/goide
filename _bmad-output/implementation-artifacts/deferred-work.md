## Deferred from: code review of 2-7-lsp-diagnostics (2026-04-12)

- Incomplete error handling for missing gopls: If gopls is not found, the system defaults to "no diagnostics" without notifying the user about the missing dependency. [src-tauri/src/integration/gopls.rs:47]
- Potential missing diagnostics from stderr: The current logic only reads stderr if stdout is empty, which might miss mixed output scenarios. [src-tauri/src/integration/gopls.rs:57]

## Deferred from: code review of 4-4-causal-correlation-runtime (2026-04-13)

- [Review][Defer] Package Lock Noise/Churn [package-lock.json] — deferred, pre-existing environment mismatch
